// The outputs being compared: one pair per input, one output per model. Pure
// and UI-free, same convention as lib/workflow.ts, so outputs pasted by hand
// today and outputs from sample results or a live runner later fill one shape.

import type { WorkflowDraft } from "./workflow";

export type ModelSide = "current" | "candidate";

export const MODEL_SIDES: ModelSide[] = ["current", "candidate"];

// One row of the comparison: the two models' outputs for the same input.
export type OutputPair = Record<ModelSide, string>;

export type PastedOutputs = OutputPair[];

export function emptyOutputs(inputCount: number): PastedOutputs {
  return Array.from({ length: inputCount }, () => ({ current: "", candidate: "" }));
}

export function withOutput(
  outputs: PastedOutputs,
  inputIndex: number,
  side: ModelSide,
  value: string,
): PastedOutputs {
  return outputs.map((pair, index) => (index === inputIndex ? { ...pair, [side]: value } : pair));
}

// A cell with no answer is "not tested", never an empty output: a model that
// was not tried must not read as a model that said nothing.
export type CellState = "pasted" | "not tested";

export function cellState(output: string): CellState {
  return output.trim() === "" ? "not tested" : "pasted";
}

export function cellCount(outputs: PastedOutputs): number {
  return outputs.length * MODEL_SIDES.length;
}

export function filledCount(outputs: PastedOutputs): number {
  return outputs
    .flatMap((pair) => MODEL_SIDES.map((side) => pair[side]))
    .filter((output) => cellState(output) === "pasted").length;
}

export function modelFor(draft: WorkflowDraft, side: ModelSide): string {
  return side === "current" ? draft.currentModel : draft.candidateModel;
}

// An output belongs to the prompt, the input and the model it was produced
// with. After the draft is edited, a cell's output still belongs only if none
// of those three changed for that cell.
export function outputStillBelongs(
  before: WorkflowDraft,
  after: WorkflowDraft,
  inputIndex: number,
  side: ModelSide,
): boolean {
  return (
    before.prompt === after.prompt &&
    before.inputs[inputIndex] === after.inputs[inputIndex] &&
    modelFor(before, side) === modelFor(after, side)
  );
}

// The outputs that may stay in the table after the draft changed. Every other
// cell is emptied, so no output sits under a prompt, input or model that did
// not produce it. The reviews follow through reviewsAfterOutputsReplaced.
export function outputsAfterDraftChange(
  outputs: PastedOutputs,
  before: WorkflowDraft,
  after: WorkflowDraft,
): PastedOutputs {
  return outputs.map((pair, inputIndex) => ({
    current: outputStillBelongs(before, after, inputIndex, "current") ? pair.current : "",
    candidate: outputStillBelongs(before, after, inputIndex, "candidate") ? pair.candidate : "",
  }));
}

// The quality review. The person rates each output on its own, with the same
// three points for both models. The tool never fills in, suggests or changes a
// rating: everything below only stores and counts what the person entered.

export type Rating = "usable" | "needs edits" | "not usable";

// Ordered from most to least usable. The descriptions are shown on screen, so
// nobody has to guess what a point on the scale means.
export const RATINGS: { value: Rating; label: string; description: string }[] = [
  {
    value: "usable",
    label: "Usable as is",
    description: "I would send or use this without changing it.",
  },
  {
    value: "needs edits",
    label: "Needs edits",
    description: "Right direction, but I would have to fix something first.",
  },
  {
    value: "not usable",
    label: "Not usable",
    description: "Wrong, missing a part, or I would have to redo it.",
  },
];

export const NOTE_MAX_CHARS = 200;

// One cell's review: the rating (null until the person picks one) and their
// optional one-line reason.
export type Review = { rating: Rating | null; note: string };

export type ReviewPair = Record<ModelSide, Review>;

export type Reviews = ReviewPair[];

const EMPTY_REVIEW: Review = { rating: null, note: "" };

export function emptyReviews(inputCount: number): Reviews {
  return Array.from({ length: inputCount }, () => ({
    current: EMPTY_REVIEW,
    candidate: EMPTY_REVIEW,
  }));
}

function withReview(
  reviews: Reviews,
  inputIndex: number,
  side: ModelSide,
  review: Review,
): Reviews {
  return reviews.map((pair, index) => (index === inputIndex ? { ...pair, [side]: review } : pair));
}

export function withRating(
  reviews: Reviews,
  inputIndex: number,
  side: ModelSide,
  rating: Rating,
): Reviews {
  return withReview(reviews, inputIndex, side, { ...reviews[inputIndex][side], rating });
}

export function withNote(
  reviews: Reviews,
  inputIndex: number,
  side: ModelSide,
  note: string,
): Reviews {
  const capped = note.slice(0, NOTE_MAX_CHARS);
  return withReview(reviews, inputIndex, side, { ...reviews[inputIndex][side], note: capped });
}

// A rating belongs to the output it was given for. Once that output's text
// changes, its rating and note are dropped, so a rating never sits under an
// output it did not judge. Call this with the outputs as they were before the
// change.
export function reviewsAfterOutputChange(
  reviews: Reviews,
  outputsBefore: PastedOutputs,
  inputIndex: number,
  side: ModelSide,
  value: string,
): Reviews {
  if (outputsBefore[inputIndex][side] === value) return reviews;
  return withReview(reviews, inputIndex, side, EMPTY_REVIEW);
}

// The same rule for a whole table replaced at once, as when saved sample
// results are loaded: only cells whose text changes lose their review.
export function reviewsAfterOutputsReplaced(
  reviews: Reviews,
  outputsBefore: PastedOutputs,
  outputsAfter: PastedOutputs,
): Reviews {
  return outputsAfter.reduce(
    (current, pair, inputIndex) =>
      MODEL_SIDES.reduce(
        (kept, side) =>
          reviewsAfterOutputChange(kept, outputsBefore, inputIndex, side, pair[side]),
        current,
      ),
    reviews,
  );
}

// How the compared model did against the model in use today on one input,
// worked out from the person's two ratings and nothing else.
export type RowResult = "better" | "same rating" | "worse" | "not tested" | "not rated yet";

function usability(rating: Rating): number {
  return RATINGS.length - RATINGS.findIndex((entry) => entry.value === rating);
}

export function rowResult(outputs: OutputPair, reviews: ReviewPair): RowResult {
  const untested = MODEL_SIDES.some((side) => cellState(outputs[side]) === "not tested");
  if (untested) return "not tested";
  const current = reviews.current.rating;
  const candidate = reviews.candidate.rating;
  if (current === null || candidate === null) return "not rated yet";
  const difference = usability(candidate) - usability(current);
  if (difference > 0) return "better";
  if (difference < 0) return "worse";
  return "same rating";
}

function inputs(count: number): string {
  return `${count} input${count === 1 ? "" : "s"}`;
}

const COUNTED_RESULTS: { result: RowResult; phrase: string }[] = [
  { result: "same rating", phrase: "the same" },
  { result: "better", phrase: "better" },
  { result: "worse", phrase: "worse" },
];

// "Compared model rated the same on 2 of 3, worse on 1." Only the first part
// carries the total, and parts with a count of zero are left out.
function countsSentence(results: RowResult[], total: number): string {
  const parts = COUNTED_RESULTS.map(({ result, phrase }) => ({
    phrase,
    count: results.filter((entry) => entry === result).length,
  }))
    .filter((part) => part.count > 0)
    .map((part, index) =>
      index === 0 ? `${part.phrase} on ${part.count} of ${total}` : `${part.phrase} on ${part.count}`,
    );
  return `Compared model rated ${parts.join(", ")}.`;
}

// The summary above the table. It only counts the person's ratings: no winner
// and no advice. The total covers only inputs where both models have an
// output, and while any of those still lacks a rating there are no counts,
// only how many are open.
export function summaryLine(outputs: PastedOutputs, reviews: Reviews): string {
  const results = outputs.map((pair, index) => rowResult(pair, reviews[index]));
  const untested = results.filter((result) => result === "not tested").length;
  const open = results.filter((result) => result === "not rated yet").length;
  const tested = results.length - untested;

  const sentences: string[] = [];
  if (open > 0) {
    sentences.push(`${inputs(open)} still need${open === 1 ? "s" : ""} a rating.`);
  } else if (tested > 0) {
    sentences.push(countsSentence(results, tested));
  }
  if (untested > 0) sentences.push(`${inputs(untested)} not tested.`);
  return sentences.join(" ");
}
