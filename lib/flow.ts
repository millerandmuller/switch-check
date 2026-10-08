// The guided flow: five steps, which of them can be opened for the state the
// comparison is in, and which comes next. Pure and UI-free, type imports only,
// like lib/sample-results.ts. Nothing here changes a rule of the comparison:
// it only reads what lib/workflow.ts and lib/comparison.ts worked out.

import type { RowResult } from "./comparison";
import type { DraftProblems, SampleWorkflow, WorkflowDraft } from "./workflow";

export type StepId = "start" | "setup" | "inputs" | "outputs" | "rate";

export const STEPS: { id: StepId; label: string }[] = [
  { id: "start", label: "Start" },
  { id: "setup", label: "Prompt and models" },
  { id: "inputs", label: "Inputs" },
  { id: "outputs", label: "Outputs" },
  { id: "rate", label: "Rate and result" },
];

// What the flow needs to know about the comparison, each worked out elsewhere:
// the draft's problems (findProblems), how many output cells are filled
// (filledCount) and the result of each row (rowResult).
export type FlowFacts = {
  problems: DraftProblems;
  filledOutputs: number;
  rowResults: RowResult[];
};

function promptAndModelsOk(facts: FlowFacts): boolean {
  return facts.problems.prompt === null && facts.problems.models === null;
}

function draftOk(facts: FlowFacts): boolean {
  return promptAndModelsOk(facts) && facts.problems.inputs.every((problem) => problem === null);
}

// A step can be opened once everything before it is in place. Rating needs at
// least one output: with none there is nothing to compare.
export function isReachable(step: StepId, facts: FlowFacts): boolean {
  if (step === "start" || step === "setup") return true;
  if (step === "inputs") return promptAndModelsOk(facts);
  if (step === "outputs") return draftOk(facts);
  return draftOk(facts) && facts.filledOutputs > 0;
}

// Rating is finished when every input that has both outputs is rated on both,
// and there is at least one such input.
function ratingDone(rowResults: RowResult[]): boolean {
  const tested = rowResults.filter((result) => result !== "not tested");
  return tested.length > 0 && tested.every((result) => result !== "not rated yet");
}

// A step's own job is done. For every step but the last this is the same as
// "the next step can be opened".
export function isDone(step: StepId, current: StepId, facts: FlowFacts): boolean {
  if (step === "start") return current !== "start";
  if (step === "rate") return isReachable("rate", facts) && ratingDone(facts.rowResults);
  const next = nextStep(step);
  return next !== null && isReachable(next, facts);
}

export type StepState = "done" | "current" | "to do";

export type StepInBar = {
  id: StepId;
  position: number;
  label: string;
  state: StepState;
  // Whether pressing it in the bar goes there. The current step and steps
  // that are not reachable yet cannot be pressed.
  canOpen: boolean;
};

export function stepsInBar(current: StepId, facts: FlowFacts): StepInBar[] {
  return STEPS.map(({ id, label }, index) => {
    const isCurrent = id === current;
    const state: StepState = isCurrent ? "current" : isDone(id, current, facts) ? "done" : "to do";
    return { id, position: index + 1, label, state, canOpen: !isCurrent && isReachable(id, facts) };
  });
}

export function nextStep(step: StepId): StepId | null {
  const index = STEPS.findIndex((entry) => entry.id === step);
  return STEPS[index + 1]?.id ?? null;
}

// How many of the inputs have text, for the "2 of 3 added" line.
export function inputsAdded(draft: WorkflowDraft): number {
  return draft.inputs.filter((input) => input.trim() !== "").length;
}

// Whether the draft holds something the person typed: any prompt or input
// text that is not the untouched sample workflow. Replacing such a draft is
// asked about first. The sample itself can be loaded again at any time, so
// replacing it loses nothing.
export function hasTypedDraft(draft: WorkflowDraft, sample: SampleWorkflow): boolean {
  const empty = draft.prompt.trim() === "" && draft.inputs.every((input) => input.trim() === "");
  if (empty) return false;
  const untouchedSample =
    draft.prompt === sample.prompt &&
    draft.inputs.length === sample.inputs.length &&
    draft.inputs.every((input, index) => input === sample.inputs[index].text);
  return !untouchedSample;
}
