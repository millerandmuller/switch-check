// Tests for loading saved sample results into the comparison, plus a guard on
// the results file that ships in demo-data.
import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  canLoadSampleResults,
  newestResultsFileName,
  outputsFromSampleResults,
  sampleRunDate,
} from "../../lib/sample-results.ts";
import { reviewsAfterOutputsReplaced } from "../../lib/comparison.ts";

const SAMPLE = {
  prompt: "Email: {input}",
  inputs: [
    { label: "one", sample: true, text: "first email" },
    { label: "two", sample: true, text: "second email" },
    { label: "three", sample: true, text: "third email" },
  ],
};
const MODELS = { current: "vendor/current", candidate: "vendor/candidate" };

function ok(output) {
  return { status: "ok", output, input_tokens: 100, output_tokens: 50, response_ms: 900 };
}

const RESULTS = {
  run_date: "2026-10-03",
  models: MODELS,
  results: [
    { input_label: "one", current: ok("current 1"), candidate: ok("candidate 1") },
    { input_label: "two", current: ok("current 2"), candidate: { status: "not tested", reason: "OpenRouter answered 429." } },
    { input_label: "three", current: ok("current 3"), candidate: ok("candidate 3") },
  ],
};

function sampleDraft(changes = {}) {
  return {
    prompt: SAMPLE.prompt,
    inputs: SAMPLE.inputs.map((input) => input.text),
    currentModel: MODELS.current,
    candidateModel: MODELS.candidate,
    ...changes,
  };
}

test("newestResultsFileName picks the latest dated results file and ignores other files", () => {
  const names = ["sample-email-triage.json", "sample-results-2026-10-03.json", "sample-results-2026-11-01.json", "sample-results-notes.txt"];
  assert.equal(newestResultsFileName(names), "sample-results-2026-11-01.json");
  assert.equal(newestResultsFileName(["sample-email-triage.json"]), null);
});

test("sample results can be loaded for the unchanged sample workflow on the pair that was run", () => {
  assert.equal(canLoadSampleResults(sampleDraft(), SAMPLE, RESULTS), true);
});

test("sample results are not offered once the prompt, an input or a model differs", () => {
  assert.equal(canLoadSampleResults(sampleDraft({ prompt: "Other: {input}" }), SAMPLE, RESULTS), false);
  assert.equal(
    canLoadSampleResults(sampleDraft({ inputs: ["first email", "second email, edited", "third email"] }), SAMPLE, RESULTS),
    false,
  );
  assert.equal(canLoadSampleResults(sampleDraft({ currentModel: "vendor/other" }), SAMPLE, RESULTS), false);
  assert.equal(canLoadSampleResults(sampleDraft({ candidateModel: "vendor/other" }), SAMPLE, RESULTS), false);
  // The two models swapped are a different comparison too.
  assert.equal(
    canLoadSampleResults(sampleDraft({ currentModel: MODELS.candidate, candidateModel: MODELS.current }), SAMPLE, RESULTS),
    false,
  );
});

test("sample results are not offered when no results file exists", () => {
  assert.equal(canLoadSampleResults(sampleDraft(), SAMPLE, null), false);
});

test("outputsFromSampleResults keeps each output as saved and leaves a not tested cell empty", () => {
  assert.deepEqual(outputsFromSampleResults(RESULTS), [
    { current: "current 1", candidate: "candidate 1" },
    { current: "current 2", candidate: "" },
    { current: "current 3", candidate: "candidate 3" },
  ]);
});

test("the sample run tag follows the text: it goes away once a loaded output is edited", () => {
  assert.equal(sampleRunDate(RESULTS, 0, "candidate", "candidate 1"), "2026-10-03");
  assert.equal(sampleRunDate(RESULTS, 0, "candidate", "candidate 1, edited"), null);
  assert.equal(sampleRunDate(RESULTS, 1, "candidate", ""), null);
  assert.equal(sampleRunDate(null, 0, "candidate", "candidate 1"), null);
});

test("loading results clears the rating and note of every cell whose text changes, and keeps the rest", () => {
  const rated = { rating: "usable", note: "kept" };
  const before = [
    { current: "current 1", candidate: "something pasted" },
    { current: "", candidate: "" },
    { current: "", candidate: "" },
  ];
  const reviews = [
    { current: rated, candidate: rated },
    { current: { rating: null, note: "" }, candidate: { rating: null, note: "" } },
    { current: { rating: null, note: "" }, candidate: { rating: null, note: "" } },
  ];
  const after = reviewsAfterOutputsReplaced(reviews, before, outputsFromSampleResults(RESULTS));
  assert.deepEqual(after[0].current, rated);
  assert.deepEqual(after[0].candidate, { rating: null, note: "" });
});

// The file that ships. These checks read the committed run, they do not
// repeat it.
const demoData = fileURLToPath(new URL("../../demo-data/", import.meta.url));
const shippedName = newestResultsFileName(await readdir(demoData));

test("a sample results file ships, named after its own run date", () => {
  assert.notEqual(shippedName, null);
});

test("the shipped results match the sample workflow and the default pair, and hold no key", async () => {
  const text = await readFile(`${demoData}${shippedName}`, "utf8");
  const shipped = JSON.parse(text);
  const sample = JSON.parse(await readFile(`${demoData}sample-email-triage.json`, "utf8"));
  const config = JSON.parse(await readFile(fileURLToPath(new URL("../../config/candidates.json", import.meta.url)), "utf8"));

  assert.equal(shippedName, `sample-results-${shipped.run_date}.json`);
  assert.deepEqual(shipped.models, config.default_pair);
  assert.deepEqual(
    shipped.results.map((row) => row.input_label),
    sample.inputs.map((input) => input.label),
  );
  for (const row of shipped.results) {
    for (const side of ["current", "candidate"]) {
      const cell = row[side];
      if (cell.status === "not tested") {
        assert.ok(cell.reason.trim().length > 0);
        continue;
      }
      assert.equal(cell.status, "ok");
      assert.ok(cell.output.trim().length > 0);
      assert.ok(cell.response_ms > 0);
    }
  }
  assert.equal(/sk-or-|Bearer /.test(text), false);
});
