// The shipped config files agree with each other, and the daily cap cannot
// outrun the credit limit set on the key.
import test from "node:test";
import assert from "node:assert/strict";
import { configProblems, modelName, providerOf } from "../../lib/models.ts";
import { billedOutputTokens, LIMITS } from "../../lib/limits.ts";
import { candidates, prices } from "./test-helpers.mjs";

test("the shipped config and the shipped prices agree", () => {
  assert.deepEqual(configProblems(candidates, prices), []);
});

test("every model the app can call has a dated price from OpenRouter", () => {
  assert.match(prices.checked_on, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(prices.source_url, "https://openrouter.ai/api/v1/models");
  const ids = [...candidates.candidates, candidates.writer, ...candidates.judges].map((m) => m.id);
  for (const id of ids) {
    const price = prices.models[id];
    assert.ok(price?.listed, `${id} is not listed`);
    assert.ok(price.input_per_million >= 0 && price.output_per_million > 0, `${id} has no usable price`);
  }
});

test("no more than six candidates, and a run starts with three of them", () => {
  assert.ok(candidates.candidates.length <= 6);
  assert.equal(candidates.default_models.length, 3);
  assert.ok(candidates.default_models.length <= LIMITS.maxModels);
});

test("the config problems function names what is wrong", () => {
  const broken = JSON.parse(JSON.stringify(candidates));
  broken.default_current = "x/none";
  broken.candidates.push({ id: "x/seventh", name: "S", provider: "Nowhere" }, { id: "x/eighth", name: "E", provider: "Nowhere" });
  const problems = configProblems(broken, prices);
  assert.ok(problems.some((p) => /More than six/.test(p)));
  assert.ok(problems.some((p) => /default current model/.test(p)));
  assert.ok(problems.some((p) => /x\/seventh has no listed price/.test(p)));
  assert.ok(problems.some((p) => /No colour for provider Nowhere/.test(p)));
  assert.ok(configProblems(candidates, { ...prices, checked_on: "yesterday" }).some((p) => /no date/.test(p)));
});

test("names and providers are looked up by id, and a stray id shows as itself", () => {
  assert.equal(modelName(candidates, "openai/gpt-6-luna"), "GPT-6 Luna");
  assert.equal(providerOf(candidates, "openai/gpt-6-luna"), "OpenAI");
  assert.equal(modelName(candidates, "x/unknown"), "x/unknown");
  assert.equal(modelName(candidates, "mistralai/mistral-medium-3.1"), "Mistral Medium 3.1");
});

// An upper bound on one full check, from the caps, with every model writing
// its whole allowance. Assumption: 3 characters per token for anything read,
// which over-counts normal English. The judge is counted as if its first
// choice failed and the second also ran.
//
// Output is counted at `billedOutputTokens`, not at the answer allowance:
// hidden reasoning has its own allowance on top and is billed as output, so a
// candidate call can be charged for 600 + 1,024 tokens. The same bound is the
// worst case for what a later reader is given, because a model that does not
// think may write the whole combined cap as visible text.
function worstCheckUsd() {
  const price = (id) => prices.models[id];
  const cost = (id, inTokens, outTokens) => (inTokens * price(id).input_per_million + outTokens * price(id).output_per_million) / 1e6;
  const answerOut = billedOutputTokens(LIMITS.maxOutputTokens);
  const writerOut = billedOutputTokens(LIMITS.writerMaxTokens);
  const judgeOut = billedOutputTokens(LIMITS.judgeMaxTokens);
  const perCall = Math.ceil((4000 + LIMITS.maxTestCaseChars) / 3);
  const dearest = [...candidates.candidates].sort((a, b) => price(b.id).output_per_million - price(a.id).output_per_million);
  const chosen = dearest.slice(0, LIMITS.maxModels);
  const grid = chosen.reduce((sum, m) => sum + LIMITS.testCases * cost(m.id, perCall, answerOut), 0);
  const writer = cost(candidates.writer.id, Math.ceil((LIMITS.maxTaskChars + 3000) / 3), writerOut);
  const judgeIn = Math.ceil((chosen.length * LIMITS.testCases * (answerOut * 3 + 600) + 3000) / 3);
  const judge = candidates.judges.reduce((sum, j) => sum + cost(j.id, judgeIn, judgeOut), 0);
  const smallJudgeIn = Math.ceil((LIMITS.testCases * (answerOut * 3 + 600) + 3000) / 3);
  const smallJudge = candidates.judges.reduce((sum, j) => sum + cost(j.id, smallJudgeIn, judgeOut), 0);
  const top = dearest[0].id;
  const promptTest = LIMITS.testCases * cost(top, perCall, answerOut) + smallJudge;
  const shape = cost(candidates.writer.id, Math.ceil(4000 / 3), writerOut);
  return grid + writer + judge + promptTest + shape + promptTest;
}

test("a full check at its caps stays near the bound recorded in docs/model-connection.md", () => {
  const bound = worstCheckUsd();
  // The note says about $0.69. A change either way means the note is stale.
  assert.ok(bound > 0.6 && bound < 0.9, `bound ${bound.toFixed(3)} outside the expected range; update docs/model-connection.md`);
});

test("a full day of the site's checks, every one at its worst, stays under the $25 limit on the key", () => {
  const CREDIT_LIMIT_USD = 25;
  const day = LIMITS.dailyChecksSite * worstCheckUsd();
  assert.ok(day < CREDIT_LIMIT_USD, `a worst-case day costs $${day.toFixed(2)}, the limit is $${CREDIT_LIMIT_USD}`);
});
