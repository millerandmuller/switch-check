// Tests for the guided flow: which steps can be opened for the state the
// comparison is in, how each reads in the bar, and which comes next. The facts
// are worked out with the real rules in lib/, as the page does.
import test from "node:test";
import assert from "node:assert/strict";
import { STEPS, hasTypedDraft, inputsAdded, isReachable, nextStep, stepsInBar } from "../../lib/flow.ts";
import { emptyDraft, findProblems } from "../../lib/workflow.ts";
import {
  emptyOutputs,
  emptyReviews,
  filledCount,
  rowResult,
  withOutput,
  withRating,
} from "../../lib/comparison.ts";

const SAMPLE = {
  prompt: "Email: {input}",
  inputs: [
    { label: "one", sample: true, text: "first email" },
    { label: "two", sample: true, text: "second email" },
    { label: "three", sample: true, text: "third email" },
  ],
};

const EMPTY = emptyDraft("vendor/current", "vendor/candidate");
const WITH_PROMPT = { ...EMPTY, prompt: "Email: {input}" };
const COMPLETE = { ...WITH_PROMPT, inputs: ["a", "b", "c"] };

function facts(draft, outputs = emptyOutputs(3), reviews = emptyReviews(3)) {
  return {
    problems: findProblems(draft),
    filledOutputs: filledCount(outputs),
    rowResults: outputs.map((pair, index) => rowResult(pair, reviews[index])),
  };
}

function reachable(f) {
  return STEPS.map((step) => step.id).filter((id) => isReachable(id, f));
}

function allSix() {
  return [0, 1, 2].reduce(
    (outputs, index) => withOutput(withOutput(outputs, index, "current", `c${index}`), index, "candidate", `d${index}`),
    emptyOutputs(3),
  );
}

function rateAll(reviews) {
  return [0, 1, 2].reduce(
    (rated, index) => withRating(withRating(rated, index, "current", "usable"), index, "candidate", "needs edits"),
    reviews,
  );
}

test("the five steps, in order", () => {
  assert.deepEqual(
    STEPS.map((step) => step.label),
    ["Start", "Prompt and models", "Inputs", "Outputs", "Rate and result"],
  );
});

test("nextStep walks the steps in order and ends after the last", () => {
  assert.equal(nextStep("start"), "setup");
  assert.equal(nextStep("setup"), "inputs");
  assert.equal(nextStep("inputs"), "outputs");
  assert.equal(nextStep("outputs"), "rate");
  assert.equal(nextStep("rate"), null);
});

test("an empty draft opens only Start and Prompt and models", () => {
  assert.deepEqual(reachable(facts(EMPTY)), ["start", "setup"]);
});

test("Inputs opens once the prompt has its placeholder and the two models differ", () => {
  assert.deepEqual(reachable(facts({ ...EMPTY, prompt: "no placeholder" })), ["start", "setup"]);
  assert.deepEqual(reachable(facts(WITH_PROMPT)), ["start", "setup", "inputs"]);
  assert.deepEqual(reachable(facts({ ...WITH_PROMPT, candidateModel: "vendor/current" })), ["start", "setup"]);
});

test("Outputs opens once all three inputs are in and within the limit", () => {
  assert.deepEqual(reachable(facts({ ...WITH_PROMPT, inputs: ["a", "b", ""] })), ["start", "setup", "inputs"]);
  assert.deepEqual(reachable(facts({ ...COMPLETE, inputs: ["a", "b", "x".repeat(4001)] })), ["start", "setup", "inputs"]);
  assert.deepEqual(reachable(facts(COMPLETE)), ["start", "setup", "inputs", "outputs"]);
});

test("Rate and result opens with one output, because an empty cell is not tested", () => {
  const one = withOutput(emptyOutputs(3), 0, "current", "an output");
  assert.equal(isReachable("rate", facts(COMPLETE)), false);
  assert.equal(isReachable("rate", facts(COMPLETE, one)), true);
  // Outputs under a draft that is no longer complete cannot be rated.
  assert.equal(isReachable("rate", facts(WITH_PROMPT, one)), false);
});

test("the bar reads done, current and to do, and only reachable other steps can be pressed", () => {
  const bar = stepsInBar("inputs", facts(WITH_PROMPT));
  assert.deepEqual(
    bar.map((step) => [step.position, step.label, step.state, step.canOpen]),
    [
      [1, "Start", "done", true],
      [2, "Prompt and models", "done", true],
      [3, "Inputs", "current", false],
      [4, "Outputs", "to do", false],
      [5, "Rate and result", "to do", false],
    ],
  );
});

test("on Start nothing is done yet, and going back keeps later finished steps pressable", () => {
  assert.deepEqual(
    stepsInBar("start", facts(EMPTY)).map((step) => step.state),
    ["current", "to do", "to do", "to do", "to do"],
  );
  const back = stepsInBar("setup", facts(COMPLETE, allSix()));
  assert.deepEqual(back.map((step) => step.state), ["done", "current", "done", "done", "to do"]);
  assert.deepEqual(back.map((step) => step.canOpen), [true, false, true, true, true]);
});

test("Rate and result is done only when every tested input is rated on both outputs", () => {
  const outputs = allSix();
  const last = (f) => stepsInBar("outputs", f).at(-1).state;
  assert.equal(last(facts(COMPLETE, outputs)), "to do");
  const fiveRated = withRating(rateAll(emptyReviews(3)), 2, "candidate", "usable");
  assert.equal(last(facts(COMPLETE, outputs, rateAll(emptyReviews(3)))), "done");
  assert.equal(last(facts(COMPLETE, outputs, fiveRated)), "done");
  const oneOpen = rateAll(emptyReviews(3)).map((pair, index) =>
    index === 1 ? { ...pair, candidate: { rating: null, note: "" } } : pair,
  );
  assert.equal(last(facts(COMPLETE, outputs, oneOpen)), "to do");
  // An input with only one output is not tested and does not hold the step open.
  const fiveOutputs = withOutput(outputs, 1, "candidate", "");
  assert.equal(last(facts(COMPLETE, fiveOutputs, oneOpen)), "done");
});

test("inputsAdded counts inputs with text, for the 2 of 3 added line", () => {
  assert.equal(inputsAdded(EMPTY), 0);
  assert.equal(inputsAdded({ ...EMPTY, inputs: ["a", "  ", "c"] }), 2);
  assert.equal(inputsAdded(COMPLETE), 3);
});

test("a typed draft is asked about before it is replaced; an empty one or the untouched sample is not", () => {
  const sampleDraft = { ...EMPTY, prompt: SAMPLE.prompt, inputs: SAMPLE.inputs.map((input) => input.text) };
  assert.equal(hasTypedDraft(EMPTY, SAMPLE), false);
  assert.equal(hasTypedDraft(sampleDraft, SAMPLE), false);
  assert.equal(hasTypedDraft({ ...EMPTY, prompt: "x" }, SAMPLE), true);
  assert.equal(hasTypedDraft({ ...EMPTY, inputs: ["", "typed", ""] }, SAMPLE), true);
  assert.equal(hasTypedDraft({ ...sampleDraft, inputs: ["first email", "second email, edited", "third email"] }, SAMPLE), true);
});
