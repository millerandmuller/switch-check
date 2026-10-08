// Saved results of one real run of the sample workflow (written by
// scripts/run-sample.mjs) and the rules for showing them. Pure and UI-free.
// Only type imports here, so the test runner can read this file directly.

import type { ModelSide, PastedOutputs } from "./comparison";
import type { ModelPair, SampleWorkflow, WorkflowDraft } from "./workflow";

// A call that errored or timed out is saved as not tested, with the reason.
export type SampleResultCell =
  | {
      status: "ok";
      output: string;
      input_tokens: number | null;
      output_tokens: number | null;
      response_ms: number;
    }
  | { status: "not tested"; reason: string };

export type SampleOkCell = Extract<SampleResultCell, { status: "ok" }>;

export type SampleResults = {
  run_date: string;
  models: ModelPair;
  results: ({ input_label: string } & Record<ModelSide, SampleResultCell>)[];
};

const RESULTS_FILE_NAME = /^sample-results-(\d{4}-\d{2}-\d{2})\.json$/;

// The newest results file among the names in demo-data, or null when there is
// none. The date is in the name, so sorting the names sorts the runs.
export function newestResultsFileName(fileNames: string[]): string | null {
  const matching = fileNames.filter((name) => RESULTS_FILE_NAME.test(name)).sort();
  return matching.at(-1) ?? null;
}

// Saved outputs belong to the inputs and models they were produced from, so
// they may only be loaded while the draft is still the unchanged sample
// workflow on the pair the run used.
export function canLoadSampleResults(
  draft: WorkflowDraft,
  sample: SampleWorkflow,
  results: SampleResults | null,
): boolean {
  if (results === null) return false;
  return (
    draft.prompt === sample.prompt &&
    draft.inputs.length === sample.inputs.length &&
    draft.inputs.every((input, index) => input === sample.inputs[index].text) &&
    results.results.length === sample.inputs.length &&
    draft.currentModel === results.models.current &&
    draft.candidateModel === results.models.candidate
  );
}

function savedOutput(cell: SampleResultCell): string {
  return cell.status === "ok" ? cell.output : "";
}

// The saved outputs in the shape the comparison table holds. A cell that was
// saved as not tested stays empty, so it reads "not tested" on screen.
export function outputsFromSampleResults(results: SampleResults): PastedOutputs {
  return results.results.map((row) => ({
    current: savedOutput(row.current),
    candidate: savedOutput(row.candidate),
  }));
}

// The "sample run" tag follows the text, like the SAMPLE tag on inputs: it
// shows only while a cell still holds exactly what the run returned for that
// cell, and the cell reads "pasted" once the text is edited. Returns what the
// run saved for the cell, or null.
export function sampleRunCell(
  results: SampleResults | null,
  inputIndex: number,
  side: ModelSide,
  output: string,
): SampleOkCell | null {
  const cell = results?.results[inputIndex]?.[side];
  if (!cell || cell.status !== "ok") return null;
  return cell.output === output ? cell : null;
}

// The run date for the tag, or null.
export function sampleRunDate(
  results: SampleResults | null,
  inputIndex: number,
  side: ModelSide,
  output: string,
): string | null {
  if (results === null) return null;
  return sampleRunCell(results, inputIndex, side, output) === null ? null : results.run_date;
}

// One model's column as the saved run knows it: per input, what the run saved
// for the cell, or null once the cell no longer holds it. Measured figures
// belong to the model that was run, so a column under any other model has
// none, whatever text it holds.
export function sampleRunColumn(
  results: SampleResults | null,
  outputs: PastedOutputs,
  side: ModelSide,
  model: string,
): (SampleOkCell | null)[] {
  const sameModel = results !== null && results.models[side] === model;
  return outputs.map((pair, inputIndex) =>
    sameModel ? sampleRunCell(results, inputIndex, side, pair[side]) : null,
  );
}
