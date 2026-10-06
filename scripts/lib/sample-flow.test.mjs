// One walk through the sample path, in the order a person takes it, using the
// rules in lib/ and the two files that ship in demo-data. The per-rule tests
// live next to this file; this one checks that the rules still fit together.
import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { draftFromSample, findProblems, isComplete } from "../../lib/workflow.ts";
import {
  canLoadSampleResults,
  newestResultsFileName,
  outputsFromSampleResults,
} from "../../lib/sample-results.ts";
import {
  MODEL_SIDES,
  cellCount,
  emptyOutputs,
  emptyReviews,
  filledCount,
  reviewsAfterOutputChange,
  reviewsAfterOutputsReplaced,
  rowResult,
  summaryLine,
  withNote,
  withOutput,
  withRating,
} from "../../lib/comparison.ts";

const demoData = fileURLToPath(new URL("../../demo-data/", import.meta.url));

async function readJson(fileName) {
  return JSON.parse(await readFile(`${demoData}${fileName}`, "utf8"));
}

// [current, candidate] per input: one row of each counted result.
const RATINGS_BY_ROW = [
  ["needs edits", "needs edits"],
  ["needs edits", "usable"],
  ["usable", "not usable"],
];

function rateAll(reviews) {
  return RATINGS_BY_ROW.reduce(
    (rated, [current, candidate], index) =>
      withRating(withRating(rated, index, "current", current), index, "candidate", candidate),
    reviews,
  );
}

test("the sample path: fill the draft, load the saved results, rate six outputs, read the summary", async () => {
  const sample = await readJson("sample-email-triage.json");
  const results = await readJson(newestResultsFileName(await readdir(demoData)));

  // Use sample workflow: a complete draft on the pair the saved run used.
  const draft = draftFromSample(sample, results.models.current, results.models.candidate);
  assert.equal(isComplete(findProblems(draft)), true);

  // Load sample results: allowed for this draft, and all six cells are filled.
  assert.equal(canLoadSampleResults(draft, sample, results), true);
  const empty = emptyOutputs(draft.inputs.length);
  const outputs = outputsFromSampleResults(results);
  let reviews = reviewsAfterOutputsReplaced(emptyReviews(draft.inputs.length), empty, outputs);
  assert.equal(cellCount(outputs), 6);
  assert.equal(filledCount(outputs), 6);
  assert.equal(summaryLine(outputs, reviews), "3 inputs still need a rating.");

  // Six ratings and one note: every row has a result, the summary counts three inputs.
  reviews = withNote(rateAll(reviews), 0, "current", "leaves the date blank");
  assert.deepEqual(
    outputs.map((pair, index) => rowResult(pair, reviews[index])),
    ["same rating", "better", "worse"],
  );
  assert.equal(
    summaryLine(outputs, reviews),
    "Compared model rated the same on 1 of 3, better on 1, worse on 1.",
  );

  // Changing one output's text clears that cell's rating and note, and no other.
  const edited = `${outputs[0].current} `;
  const afterEdit = reviewsAfterOutputChange(reviews, outputs, 0, "current", edited);
  const editedOutputs = withOutput(outputs, 0, "current", edited);
  assert.deepEqual(afterEdit[0].current, { rating: null, note: "" });
  for (const [index, pair] of reviews.entries()) {
    for (const side of MODEL_SIDES) {
      if (index === 0 && side === "current") continue;
      assert.deepEqual(afterEdit[index][side], pair[side]);
    }
  }
  assert.equal(summaryLine(editedOutputs, afterEdit), "1 input still needs a rating.");

  // A different model to compare with: the saved results may no longer be loaded.
  const otherModel = `${results.models.candidate}-other`;
  assert.equal(canLoadSampleResults({ ...draft, candidateModel: otherModel }, sample, results), false);
});
