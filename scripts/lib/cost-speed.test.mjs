// Tests for the cost and speed figures: every figure is estimated, measured or
// not measured and says which, and only cells that still hold what the saved
// run returned are counted.
import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  NOT_RUN_REASON,
  NO_PRICE_REASON,
  NO_TOKENS_REASON,
  cellTimeText,
  costPer1000Runs,
  costSpeedLine,
  formatUsd,
  responseTimes,
} from "../../lib/cost-speed.ts";
import {
  newestResultsFileName,
  outputsFromSampleResults,
  sampleRunColumn,
} from "../../lib/sample-results.ts";
import { emptyOutputs, outputsAfterDraftChange, withOutput } from "../../lib/comparison.ts";
import { draftFromSample } from "../../lib/workflow.ts";

const root = fileURLToPath(new URL("../../", import.meta.url));

async function readJson(relativePath) {
  return JSON.parse(await readFile(`${root}${relativePath}`, "utf8"));
}

async function shippedRun() {
  const fileName = newestResultsFileName(await readdir(`${root}demo-data`));
  return readJson(`demo-data/${fileName}`);
}

// The prices read on 2026-09-28, pinned here so the expected figures do not
// move when config/model-prices.json is re-read.
const PRICES_CHECKED_ON = "2026-09-28";
const SONNET = { listed: true, input_per_million: 2, output_per_million: 10 };
const LUNA = { listed: true, input_per_million: 0.1, output_per_million: 0.5 };

const MODELS = { current: "vendor/current", candidate: "vendor/candidate" };
const PRICE = { listed: true, input_per_million: 1, output_per_million: 2 };

function ok(output, changes = {}) {
  return { status: "ok", output, input_tokens: 1000, output_tokens: 500, response_ms: 1500, ...changes };
}

const RESULTS = {
  run_date: "2026-10-03",
  models: MODELS,
  results: [
    { input_label: "one", current: ok("current 1", { response_ms: 1249 }), candidate: ok("candidate 1") },
    { input_label: "two", current: ok("current 2", { response_ms: 3051 }), candidate: ok("candidate 2") },
    { input_label: "three", current: ok("current 3", { response_ms: 2000 }), candidate: ok("candidate 3") },
  ],
};

function line(results, outputs, side, model, price) {
  return costSpeedLine(sampleRunColumn(results, outputs, side, model), price, PRICES_CHECKED_ON, results.run_date);
}

test("the shipped sample gives $3.92 and $0.10 per 1,000 runs at the prices of 2026-09-28", async () => {
  const run = await shippedRun();
  assert.equal(run.run_date, "2026-10-03");
  const outputs = outputsFromSampleResults(run);

  assert.equal(
    line(run, outputs, "current", "anthropic/claude-sonnet-5.5", SONNET),
    "estimated $3.92 per 1,000 runs (OpenRouter price checked 2026-09-28, tokens from the sample run of 2026-10-03, 3 of 3 inputs) · answered in 3.2 to 5.5 s (measured, one run on 2026-10-03, 3 of 3 inputs)",
  );
  assert.equal(
    line(run, outputs, "candidate", "openai/gpt-6-luna", LUNA),
    "estimated $0.10 per 1,000 runs (OpenRouter price checked 2026-09-28, tokens from the sample run of 2026-10-03, 3 of 3 inputs) · answered in 2.1 to 4.8 s (measured, one run on 2026-10-03, 3 of 3 inputs)",
  );
});

test("the price file the app reads has a source, a date and a price for each candidate", async () => {
  const prices = await readJson("config/model-prices.json");
  const { candidates } = await readJson("config/candidates.json");
  assert.match(prices.checked_on, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(prices.source_url, /^https:\/\/openrouter\.ai\//);
  for (const id of candidates) {
    assert.equal(prices.models[id]?.listed, true, `${id} has no published price in config/model-prices.json`);
  }
});

test("a column with one edited cell is based on 2 of 3 inputs", () => {
  const outputs = withOutput(outputsFromSampleResults(RESULTS), 1, "current", "current 2, edited");
  const column = sampleRunColumn(RESULTS, outputs, "current", MODELS.current);
  // 1,000 input tokens at $1 and 500 output tokens at $2 per million: $0.002 a run.
  assert.deepEqual(costPer1000Runs(column, PRICE), { state: "estimated", usdPer1000Runs: 2, basedOn: 2, inputs: 3 });
  // The edited cell held the slowest call, so it no longer sets the range.
  assert.equal(
    line(RESULTS, outputs, "current", MODELS.current, PRICE),
    "estimated $2.00 per 1,000 runs (OpenRouter price checked 2026-09-28, tokens from the sample run of 2026-10-03, 2 of 3 inputs) · answered in 1.2 to 2.0 s (measured, one run on 2026-10-03, 2 of 3 inputs)",
  );
  // The other model's column is untouched.
  assert.equal(costPer1000Runs(sampleRunColumn(RESULTS, outputs, "candidate", MODELS.candidate), PRICE).basedOn, 3);
});

test("a column of pasted outputs is not measured, because Switch Check did not run them", () => {
  const outputs = [
    { current: "pasted 1", candidate: "pasted a" },
    { current: "pasted 2", candidate: "pasted b" },
    { current: "pasted 3", candidate: "pasted c" },
  ];
  const expected =
    "cost not measured (Switch Check did not run these outputs) · response time not measured (Switch Check did not run these outputs)";
  assert.equal(line(RESULTS, outputs, "current", MODELS.current, PRICE), expected);
  assert.equal(line(RESULTS, outputs, "candidate", MODELS.candidate, PRICE), expected);
  // Also when no run was ever saved.
  assert.deepEqual(costPer1000Runs(sampleRunColumn(null, outputs, "current", MODELS.current), PRICE), {
    state: "not measured",
    reason: NOT_RUN_REASON,
  });
});

test("a null token count leaves that cell out of the cost and keeps its measured time", () => {
  const results = structuredClone(RESULTS);
  results.results[0].current.output_tokens = null;
  results.results[1].current.input_tokens = 4000;
  const column = sampleRunColumn(results, outputsFromSampleResults(results), "current", MODELS.current);
  // Counted: (4,000 + 2 x 500) / 1M = $0.005 and (1,000 + 2 x 500) / 1M = $0.002, mean $0.0035.
  assert.deepEqual(costPer1000Runs(column, PRICE), { state: "estimated", usdPer1000Runs: 3.5, basedOn: 2, inputs: 3 });
  assert.equal(responseTimes(column).basedOn, 3);

  for (const row of results.results) row.current.input_tokens = null;
  const noTokens = sampleRunColumn(results, outputsFromSampleResults(results), "current", MODELS.current);
  assert.deepEqual(costPer1000Runs(noTokens, PRICE), { state: "not measured", reason: NO_TOKENS_REASON });
});

test("a model without a published price is not measured for cost, with the reason, and keeps its times", () => {
  const outputs = outputsFromSampleResults(RESULTS);
  const column = sampleRunColumn(RESULTS, outputs, "current", MODELS.current);
  const noPrice = { state: "not measured", reason: NO_PRICE_REASON };
  assert.deepEqual(costPer1000Runs(column, undefined), noPrice);
  assert.deepEqual(costPer1000Runs(column, { listed: false }), noPrice);
  assert.deepEqual(costPer1000Runs(column, { listed: true, input_per_million: 1, output_per_million: null }), noPrice);
  assert.equal(
    line(RESULTS, outputs, "current", MODELS.current, { listed: false }),
    "cost not measured (no published price for this model) · answered in 1.2 to 3.1 s (measured, one run on 2026-10-03, 3 of 3 inputs)",
  );
});

test("an amount under one cent reads less than $0.01, never $0.00", () => {
  assert.equal(formatUsd(0.004), "less than $0.01");
  assert.equal(formatUsd(0.0099), "less than $0.01");
  assert.equal(formatUsd(0.01), "$0.01");
  assert.equal(formatUsd(0), "$0.00");
  assert.equal(formatUsd(3.9173), "$3.92");
  assert.equal(formatUsd(1234.5), "$1,234.50");

  const cheap = { listed: true, input_per_million: 0.001, output_per_million: 0.002 };
  assert.equal(
    line(RESULTS, outputsFromSampleResults(RESULTS), "candidate", MODELS.candidate, cheap),
    "estimated less than $0.01 per 1,000 runs (OpenRouter price checked 2026-09-28, tokens from the sample run of 2026-10-03, 3 of 3 inputs) · answered in 1.5 s (measured, one run on 2026-10-03, 3 of 3 inputs)",
  );
});

test("one cell's time reads as measured, in seconds with one decimal", () => {
  assert.equal(cellTimeText(ok("x", { response_ms: 5469 })), "measured 5.5 s");
  assert.equal(cellTimeText(ok("x", { response_ms: 2139 })), "measured 2.1 s");
});

test("after a model change the emptied column is not measured (the Day 13 rule still holds)", async () => {
  const sample = await readJson("demo-data/sample-email-triage.json");
  const run = await shippedRun();
  const before = draftFromSample(sample, run.models.current, run.models.candidate);
  const after = { ...before, candidateModel: "openai/gpt-6-sol" };
  const outputs = outputsAfterDraftChange(outputsFromSampleResults(run), before, after);
  const notMeasured =
    "cost not measured (Switch Check did not run these outputs) · response time not measured (Switch Check did not run these outputs)";

  assert.equal(line(run, outputs, "candidate", after.candidateModel, SONNET), notMeasured);
  // The column that kept its model keeps its figures.
  assert.match(line(run, outputs, "current", after.currentModel, SONNET), /^estimated \$3\.92 per 1,000 runs /);

  // Pasting the old model's text back under the new model does not bring the
  // old model's tokens with it: they would be priced as a model that never ran.
  const pastedBack = outputsFromSampleResults(run);
  assert.equal(line(run, pastedBack, "candidate", after.candidateModel, SONNET), notMeasured);
  // An empty table has nothing measured either.
  assert.equal(line(run, emptyOutputs(3), "current", before.currentModel, SONNET), notMeasured);
});
