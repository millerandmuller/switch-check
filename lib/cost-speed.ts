// Cost and speed of one model across the calls of a run. Pure and UI-free.
//
// The one rule, carried over from the first version: every figure has a state
// and says which. A response time is measured: the server timed the call. A
// cost is estimated: a published price times the tokens the API reported.
// A model with nothing to count gets a reason, never a zero.

import { figure, type Figure } from "./figure.ts";

// config/model-prices.json, written by `npm run check-models`.
export type ModelPrice =
  | { listed: true; input_per_million: number | null; output_per_million: number | null }
  | { listed: false };

// What one answered call reported: tokens as the API counted them (reasoning
// tokens are inside the output count) and the time the server measured.
export type CallUsage = { inputTokens: number | null; outputTokens: number | null; ms: number };

export const NO_CALLS_REASON = "no call was answered";
export const NO_PRICE_REASON = "no published price for this model";
export const NO_TOKENS_REASON = "the run reported no token counts";

const TOKENS_PER_MILLION = 1_000_000;
const RUNS = 1000;

export type CostEstimate =
  | { kind: "estimated"; usdPer1000Runs: Figure<number>; basedOn: number; calls: number }
  | { kind: "unavailable"; reason: string };

export type TimeMeasure =
  | { kind: "measured"; meanMs: Figure<number>; fastestMs: number; slowestMs: number; calls: number }
  | { kind: "unavailable"; reason: string };

// What one call cost at the published price, or null when the call reported
// no token count or the model has no price.
export function callCostUsd(usage: CallUsage, price: ModelPrice | undefined): number | null {
  if (!price || !price.listed) return null;
  if (price.input_per_million === null || price.output_per_million === null) return null;
  if (usage.inputTokens === null || usage.outputTokens === null) return null;
  return (
    (usage.inputTokens * price.input_per_million + usage.outputTokens * price.output_per_million) /
    TOKENS_PER_MILLION
  );
}

// Estimated cost of 1,000 runs of one model, where a run is the prompt with
// one test input: the mean cost of the answered calls, times 1,000.
export function costPer1000Runs(calls: CallUsage[], price: ModelPrice | undefined, priceCheckedOn: string): CostEstimate {
  if (calls.length === 0) return { kind: "unavailable", reason: NO_CALLS_REASON };
  if (!price || !price.listed || price.input_per_million === null || price.output_per_million === null) {
    return { kind: "unavailable", reason: NO_PRICE_REASON };
  }
  const costs = calls
    .map((call) => callCostUsd(call, price))
    .filter((cost): cost is number => cost !== null);
  if (costs.length === 0) return { kind: "unavailable", reason: NO_TOKENS_REASON };
  const mean = costs.reduce((sum, cost) => sum + cost, 0) / costs.length;
  return {
    kind: "estimated",
    usdPer1000Runs: figure(mean * RUNS, "estimated", `OpenRouter price checked ${priceCheckedOn}`),
    basedOn: costs.length,
    calls: calls.length,
  };
}

// The mean, shortest and longest measured response time of the answered calls.
// `recorded` is true when the calls come from a saved run: the mean is then
// a recorded figure, not one this page timed just now.
export function responseTime(calls: CallUsage[], recorded = false): TimeMeasure {
  if (calls.length === 0) return { kind: "unavailable", reason: NO_CALLS_REASON };
  const times = calls.map((call) => call.ms);
  const mean = times.reduce((sum, ms) => sum + ms, 0) / times.length;
  return {
    kind: "measured",
    meanMs: recorded ? figure(mean, "recorded") : figure(mean, "measured", "this run"),
    fastestMs: Math.min(...times),
    slowestMs: Math.max(...times),
    calls: times.length,
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

// How much lower (positive) or higher (negative) the second cost is than the
// first, as a whole percent. null when the first cost is not above zero.
export function percentLower(reference: number, other: number): number | null {
  if (!(reference > 0)) return null;
  return Math.round(((reference - other) / reference) * 100);
}
