// The outputs being compared: one pair per input, one output per model. Pure
// and UI-free, same convention as lib/workflow.ts, so outputs pasted by hand
// today and outputs from sample results or a live runner later fill one shape.

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
