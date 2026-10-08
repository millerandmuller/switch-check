// Cost and speed of one model's column in the comparison. Pure and UI-free,
// type imports only, like lib/sample-results.ts.
//
// The one rule: every figure is measured, estimated or not measured, and says
// which. A response time is measured (the saved run timed it). A cost is an
// estimate: a published price times the tokens the saved run used. Anything
// the tool did not run itself is not measured, with the reason. Nothing here
// compares the two models or names a cheaper or faster one.

import type { SampleOkCell } from "./sample-results";

// config/model-prices.json, written by `npm run check-models`.
export type ModelPrice =
  | { listed: true; input_per_million: number | null; output_per_million: number | null }
  | { listed: false };

export type ModelPrices = {
  source_url: string;
  checked_on: string;
  models: Record<string, ModelPrice>;
};

// One model's column: per input, what the saved run holds for the cell, or
// null when the cell is empty, pasted or edited (see sampleRunColumn).
export type RunColumn = (SampleOkCell | null)[];

export const NOT_RUN_REASON = "Switch Check did not run these outputs";
export const NO_PRICE_REASON = "no published price for this model";
export const NO_TOKENS_REASON = "the run reported no token counts";

const TOKENS_PER_MILLION = 1_000_000;
const RUNS = 1000;

export type CostFigure =
  | {
      state: "estimated";
      usdPer1000Runs: number;
      // How many of the column's inputs the estimate rests on.
      basedOn: number;
      inputs: number;
    }
  | { state: "not measured"; reason: string };

export type SpeedFigure =
  | { state: "measured"; fastestMs: number; slowestMs: number; basedOn: number; inputs: number }
  | { state: "not measured"; reason: string };

function isCounted(cell: SampleOkCell | null): cell is SampleOkCell {
  return cell !== null;
}

// What one call cost at the published price, or null when the run reported
// no token count for it or the model has no price.
export function cellCostUsd(cell: SampleOkCell, price: ModelPrice | undefined): number | null {
  if (!price || !price.listed) return null;
  if (price.input_per_million === null || price.output_per_million === null) return null;
  if (cell.input_tokens === null || cell.output_tokens === null) return null;
  const perMillionTokens =
    cell.input_tokens * price.input_per_million + cell.output_tokens * price.output_per_million;
  return perMillionTokens / TOKENS_PER_MILLION;
}

// Estimated cost of 1,000 runs of one model, where a run is the prompt with
// one input: the mean cost of the counted cells, times 1,000.
export function costPer1000Runs(column: RunColumn, price: ModelPrice | undefined): CostFigure {
  const counted = column.filter(isCounted);
  if (counted.length === 0) return { state: "not measured", reason: NOT_RUN_REASON };
  if (!price || !price.listed || price.input_per_million === null || price.output_per_million === null) {
    return { state: "not measured", reason: NO_PRICE_REASON };
  }
  const costs = counted
    .map((cell) => cellCostUsd(cell, price))
    .filter((cost): cost is number => cost !== null);
  if (costs.length === 0) return { state: "not measured", reason: NO_TOKENS_REASON };
  const mean = costs.reduce((sum, cost) => sum + cost, 0) / costs.length;
  return {
    state: "estimated",
    usdPer1000Runs: mean * RUNS,
    basedOn: costs.length,
    inputs: column.length,
  };
}

// The shortest and longest measured response of the counted cells. No average:
// three values from one run do not carry one.
export function responseTimes(column: RunColumn): SpeedFigure {
  const times = column.filter(isCounted).map((cell) => cell.response_ms);
  if (times.length === 0) return { state: "not measured", reason: NOT_RUN_REASON };
  return {
    state: "measured",
    fastestMs: Math.min(...times),
    slowestMs: Math.max(...times),
    basedOn: times.length,
    inputs: column.length,
  };
}

// US dollars with two decimals. An amount under one cent would round to
// "$0.00" and read as free, so it reads "less than $0.01".
export function formatUsd(amount: number): string {
  if (amount > 0 && amount < 0.01) return "less than $0.01";
  return `$${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Seconds with one decimal, without the unit.
export function formatSeconds(ms: number): string {
  return (ms / 1000).toFixed(1);
}

function ofInputs(basedOn: number, inputs: number): string {
  return `${basedOn} of ${inputs} input${inputs === 1 ? "" : "s"}`;
}

// "estimated $3.92 per 1,000 runs (OpenRouter price checked 2026-09-28,
// tokens from the sample run of 2026-10-03, 3 of 3 inputs)"
export function costText(figure: CostFigure, priceCheckedOn: string, runDate: string): string {
  if (figure.state === "not measured") return `cost not measured (${figure.reason})`;
  const basis = `OpenRouter price checked ${priceCheckedOn}, tokens from the sample run of ${runDate}, ${ofInputs(figure.basedOn, figure.inputs)}`;
  return `estimated ${formatUsd(figure.usdPer1000Runs)} per 1,000 runs (${basis})`;
}

// "answered in 3.2 to 5.5 s (measured, one run on 2026-10-03, 3 of 3 inputs)"
export function speedText(figure: SpeedFigure, runDate: string): string {
  if (figure.state === "not measured") return `response time not measured (${figure.reason})`;
  const fastest = formatSeconds(figure.fastestMs);
  const slowest = formatSeconds(figure.slowestMs);
  const range = fastest === slowest ? `${fastest} s` : `${fastest} to ${slowest} s`;
  return `answered in ${range} (measured, one run on ${runDate}, ${ofInputs(figure.basedOn, figure.inputs)})`;
}

// One model's "Cost and speed" line, without the model id in front.
export function costSpeedLine(
  column: RunColumn,
  price: ModelPrice | undefined,
  priceCheckedOn: string,
  runDate: string,
): string {
  const cost = costText(costPer1000Runs(column, price), priceCheckedOn, runDate);
  const speed = speedText(responseTimes(column), runDate);
  return `${cost} · ${speed}`;
}

// The time shown in one sample-run cell: "measured 5.5 s".
export function cellTimeText(cell: SampleOkCell): string {
  return `measured ${formatSeconds(cell.response_ms)} s`;
}
