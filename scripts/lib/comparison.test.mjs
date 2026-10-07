// Unit tests for the quality review logic. Node reads lib/comparison.ts
// directly because that file has no "@/" imports and only erasable types.
import test from "node:test";
import assert from "node:assert/strict";
import {
  NOTE_MAX_CHARS,
  RATINGS,
  emptyOutputs,
  emptyReviews,
  outputsAfterDraftChange,
  reviewsAfterOutputChange,
  reviewsAfterOutputsReplaced,
  rowResult,
  summaryLine,
  withNote,
  withOutput,
  withRating,
} from "../../lib/comparison.ts";

const BOTH = { current: "an answer", candidate: "another answer" };

function pair(current, candidate) {
  return { current: { rating: current, note: "" }, candidate: { rating: candidate, note: "" } };
}

// Three inputs with both outputs pasted, rated row by row as [current, candidate].
function ratedTable(rows) {
  return {
    outputs: rows.map(() => BOTH),
    reviews: rows.map(([current, candidate]) => pair(current, candidate)),
  };
}

test("the scale has three points, each with a label and a description", () => {
  assert.deepEqual(
    RATINGS.map((entry) => entry.label),
    ["Usable as is", "Needs edits", "Not usable"],
  );
  for (const entry of RATINGS) assert.ok(entry.description.trim().length > 0);
});

test("a new review set has no rating and no note anywhere", () => {
  const reviews = emptyReviews(3);
  assert.equal(reviews.length, 3);
  for (const row of reviews) {
    assert.deepEqual(row, { current: { rating: null, note: "" }, candidate: { rating: null, note: "" } });
  }
});

test("rowResult is better when the compared model is rated more usable", () => {
  assert.equal(rowResult(BOTH, pair("needs edits", "usable")), "better");
  assert.equal(rowResult(BOTH, pair("not usable", "needs edits")), "better");
});

test("rowResult is same rating when both outputs got the same rating", () => {
  for (const { value } of RATINGS) assert.equal(rowResult(BOTH, pair(value, value)), "same rating");
});

test("rowResult is worse when the compared model is rated less usable", () => {
  assert.equal(rowResult(BOTH, pair("usable", "needs edits")), "worse");
  assert.equal(rowResult(BOTH, pair("usable", "not usable")), "worse");
});

test("rowResult is not rated yet while either rating is missing", () => {
  assert.equal(rowResult(BOTH, pair(null, "usable")), "not rated yet");
  assert.equal(rowResult(BOTH, pair("usable", null)), "not rated yet");
  assert.equal(rowResult(BOTH, pair(null, null)), "not rated yet");
});

test("rowResult is not tested when either output is missing, whatever the ratings", () => {
  assert.equal(rowResult({ current: "an answer", candidate: "" }, pair("usable", null)), "not tested");
  assert.equal(rowResult({ current: "  \n", candidate: "an answer" }, pair("usable", "usable")), "not tested");
});

test("summaryLine counts same, better and worse once everything is rated", () => {
  const { outputs, reviews } = ratedTable([
    ["usable", "usable"],
    ["needs edits", "usable"],
    ["usable", "not usable"],
  ]);
  assert.equal(summaryLine(outputs, reviews), "Compared model rated the same on 1 of 3, better on 1, worse on 1.");
});

test("summaryLine leaves out parts with a count of zero", () => {
  const sameAndWorse = ratedTable([
    ["usable", "usable"],
    ["needs edits", "needs edits"],
    ["usable", "needs edits"],
  ]);
  assert.equal(
    summaryLine(sameAndWorse.outputs, sameAndWorse.reviews),
    "Compared model rated the same on 2 of 3, worse on 1.",
  );

  const allBetter = ratedTable([
    ["not usable", "usable"],
    ["needs edits", "usable"],
    ["not usable", "needs edits"],
  ]);
  assert.equal(summaryLine(allBetter.outputs, allBetter.reviews), "Compared model rated better on 3 of 3.");
});

test("summaryLine counts only tested inputs and lists the others separately", () => {
  const { outputs, reviews } = ratedTable([
    ["usable", "usable"],
    ["usable", "usable"],
    ["usable", null],
  ]);
  outputs[2] = { current: "an answer", candidate: "" };
  assert.equal(summaryLine(outputs, reviews), "Compared model rated the same on 2 of 2. 1 input not tested.");
});

test("summaryLine gives no counts while a tested input still needs a rating", () => {
  const twoOpen = ratedTable([
    ["usable", "usable"],
    ["usable", null],
    [null, null],
  ]);
  assert.equal(summaryLine(twoOpen.outputs, twoOpen.reviews), "2 inputs still need a rating.");

  const oneOpen = ratedTable([
    ["usable", "usable"],
    ["usable", "needs edits"],
    [null, "usable"],
  ]);
  assert.equal(summaryLine(oneOpen.outputs, oneOpen.reviews), "1 input still needs a rating.");
});

test("summaryLine with no input tested on both models has no counts at all", () => {
  const outputs = [
    { current: "an answer", candidate: "" },
    { current: "", candidate: "" },
    { current: "", candidate: "an answer" },
  ];
  assert.equal(summaryLine(outputs, emptyReviews(3)), "3 inputs not tested.");
});

test("withRating and withNote change one cell and leave the rest alone", () => {
  let reviews = emptyReviews(3);
  reviews = withRating(reviews, 1, "candidate", "needs edits");
  reviews = withNote(reviews, 1, "candidate", "promises a credit note");
  assert.deepEqual(reviews[1].candidate, { rating: "needs edits", note: "promises a credit note" });
  assert.deepEqual(reviews[1].current, { rating: null, note: "" });
  assert.deepEqual(reviews[0], emptyReviews(1)[0]);
  assert.deepEqual(reviews[2], emptyReviews(1)[0]);
});

test("a rating can be changed and keeps its note", () => {
  let reviews = withNote(withRating(emptyReviews(3), 0, "current", "usable"), 0, "current", "fine");
  reviews = withRating(reviews, 0, "current", "not usable");
  assert.deepEqual(reviews[0].current, { rating: "not usable", note: "fine" });
});

test("withNote caps the note at 200 characters", () => {
  assert.equal(NOTE_MAX_CHARS, 200);
  const reviews = withNote(emptyReviews(3), 0, "current", "x".repeat(250));
  assert.equal(reviews[0].current.note.length, 200);
});

test("changing an output's text clears that cell's rating and note, and only that cell's", () => {
  let outputs = emptyOutputs(3);
  outputs = withOutput(outputs, 0, "current", "first answer");
  outputs = withOutput(outputs, 0, "candidate", "second answer");
  let reviews = emptyReviews(3);
  reviews = withNote(withRating(reviews, 0, "current", "usable"), 0, "current", "good");
  reviews = withNote(withRating(reviews, 0, "candidate", "needs edits"), 0, "candidate", "too long");

  const after = reviewsAfterOutputChange(reviews, outputs, 0, "candidate", "second answer, edited");
  assert.deepEqual(after[0].candidate, { rating: null, note: "" });
  assert.deepEqual(after[0].current, { rating: "usable", note: "good" });
});

test("an output change that leaves the text as it was keeps the rating and note", () => {
  const outputs = withOutput(emptyOutputs(3), 2, "current", "an answer");
  const reviews = withNote(withRating(emptyReviews(3), 2, "current", "not usable"), 2, "current", "wrong priority");
  const after = reviewsAfterOutputChange(reviews, outputs, 2, "current", "an answer");
  assert.deepEqual(after[2].current, { rating: "not usable", note: "wrong priority" });
});

// Outputs after the draft was edited. Six filled cells, all rated, on one draft.
const DRAFT = {
  prompt: "Triage: {input}",
  inputs: ["first email", "second email", "third email"],
  currentModel: "vendor/current",
  candidateModel: "vendor/candidate",
};
const FILLED = DRAFT.inputs.map((_, index) => ({
  current: `current ${index + 1}`,
  candidate: `candidate ${index + 1}`,
}));

test("an unchanged draft keeps every output", () => {
  assert.deepEqual(outputsAfterDraftChange(FILLED, DRAFT, { ...DRAFT }), FILLED);
});

test("a different model on one side empties that side's column and keeps the other", () => {
  const after = outputsAfterDraftChange(FILLED, DRAFT, { ...DRAFT, candidateModel: "vendor/other" });
  assert.deepEqual(after, [
    { current: "current 1", candidate: "" },
    { current: "current 2", candidate: "" },
    { current: "current 3", candidate: "" },
  ]);
});

test("a changed input empties that input's row and keeps the other rows", () => {
  const edited = { ...DRAFT, inputs: ["first email", "a different email", "third email"] };
  assert.deepEqual(outputsAfterDraftChange(FILLED, DRAFT, edited), [
    FILLED[0],
    { current: "", candidate: "" },
    FILLED[2],
  ]);
});

test("a changed prompt empties the whole table, and so do the two models swapped", () => {
  const empty = emptyOutputs(3);
  assert.deepEqual(outputsAfterDraftChange(FILLED, DRAFT, { ...DRAFT, prompt: "Sort: {input}" }), empty);
  const swapped = { ...DRAFT, currentModel: DRAFT.candidateModel, candidateModel: DRAFT.currentModel };
  assert.deepEqual(outputsAfterDraftChange(FILLED, DRAFT, swapped), empty);
});

test("the ratings and notes of emptied cells go with them, and the others stay", () => {
  const rated = { rating: "usable", note: "kept" };
  const reviews = FILLED.map(() => ({ current: rated, candidate: rated }));
  const edited = { ...DRAFT, inputs: ["first email", "a different email", "third email"] };
  const kept = outputsAfterDraftChange(FILLED, DRAFT, edited);
  const after = reviewsAfterOutputsReplaced(reviews, FILLED, kept);
  assert.deepEqual(after[1], { current: { rating: null, note: "" }, candidate: { rating: null, note: "" } });
  assert.deepEqual(after[0], reviews[0]);
  assert.deepEqual(after[2], reviews[2]);
  assert.equal(summaryLine(kept, after), "Compared model rated the same on 2 of 2. 1 input not tested.");
});
