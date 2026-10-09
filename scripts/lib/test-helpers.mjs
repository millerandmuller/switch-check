// Shared by the tests: the shipped config, a fake model, and small builders.
// Not a test file itself (the test glob is *.test.mjs).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
export const candidates = JSON.parse(readFileSync(`${root}config/candidates.json`, "utf8"));
export const prices = JSON.parse(readFileSync(`${root}config/model-prices.json`, "utf8"));
export { root };

export const SONNET = "anthropic/claude-sonnet-5.5";
export const LUNA = "openai/gpt-6-luna";
export const HAIKU = "anthropic/claude-haiku-5.5";
export const OPUS = "anthropic/claude-opus-5.5";

export function planBody(overrides = {}) {
  return {
    taskClass: "one-response",
    prompt: "Classify this ticket.\n\n{input}",
    additions: ["Asked for one category."],
    testInputs: ["I was charged twice.", "The app crashes on login.", "Please add dark mode."],
    checks: ["Does it name exactly one category?", "Is the category right for the ticket?", "Does it avoid extra commentary?"],
    ...overrides,
  };
}

// A fake model. `script` maps a model id to a function (request) => text or
// a Completion; anything else answers "ok". Records every request.
export function fakeComplete(script = {}) {
  const calls = [];
  const complete = async (request) => {
    calls.push(request);
    const handler = script[request.model];
    const out = handler ? await handler(request, calls.length) : "ok";
    if (typeof out === "object" && out !== null) return out;
    return { status: "ok", text: String(out), inputTokens: 100, outputTokens: 50, ms: 400, truncated: false };
  };
  return { complete, calls };
}

export function judgeReplyFor(request, { failing = [] } = {}) {
  // Reads the prompt the judge was given and passes every check except the
  // (case, answer, check) triples in `failing`.
  const checks = [...request.prompt.matchAll(/^(c\d+): /gm)].map((m) => m[1]);
  const verdicts = [];
  for (const block of request.prompt.split("### Test case ").slice(1)) {
    const testCase = block.slice(0, block.indexOf("\n"));
    for (const label of [...block.matchAll(/<<<ANSWER ([A-H])>>>/g)].map((m) => m[1])) {
      const bad = failing.filter((f) => f.case === testCase && f.answer === label);
      const text = block.split(`<<<ANSWER ${label}>>>\n`)[1].split(`\n<<<END ${label}>>>`)[0];
      verdicts.push({
        case: testCase,
        answer: label,
        pass: checks.filter((c) => !bad.some((f) => f.check === c)),
        fail: bad.map((f) => ({ check: f.check, quote: f.quote ?? text.split("\n")[0] })),
      });
    }
  }
  return JSON.stringify({ verdicts });
}

export function fixedClock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms) => { t += ms; } };
}

export function depsWith(script, { random = () => 0.5, now = Date.now } = {}) {
  const fake = fakeComplete(script);
  return {
    deps: { complete: fake.complete, now, random, config: candidates, prices },
    calls: fake.calls,
  };
}
