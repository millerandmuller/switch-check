// Cost and speed figures: estimated or measured, with a reason when absent.
import test from "node:test";
import assert from "node:assert/strict";
import {
  NO_CALLS_REASON, NO_PRICE_REASON, NO_TOKENS_REASON,
  callCostUsd, costPer1000Runs, formatSeconds, formatUsd, percentLower, responseTime,
} from "../../lib/cost-speed.ts";

const price = { listed: true, input_per_million: 2, output_per_million: 10 };

test("one call costs tokens times the published price", () => {
  assert.equal(callCostUsd({ inputTokens: 1000, outputTokens: 500, ms: 1 }, price), (1000 * 2 + 500 * 10) / 1e6);
});

test("a call costs nothing countable without a price, a listing or token counts", () => {
  const call = { inputTokens: 10, outputTokens: 10, ms: 1 };
  assert.equal(callCostUsd(call, undefined), null);
  assert.equal(callCostUsd(call, { listed: false }), null);
  assert.equal(callCostUsd(call, { listed: true, input_per_million: null, output_per_million: 1 }), null);
  assert.equal(callCostUsd({ inputTokens: null, outputTokens: 5, ms: 1 }, price), null);
});

test("cost per 1,000 runs is the mean answered call times 1,000, estimated, with the price date", () => {
  const calls = [
    { inputTokens: 1000, outputTokens: 100, ms: 1 },
    { inputTokens: 3000, outputTokens: 300, ms: 1 },
  ];
  const cost = costPer1000Runs(calls, price, "2026-10-09");
  assert.equal(cost.kind, "estimated");
  const mean = ((1000 * 2 + 100 * 10) / 1e6 + (3000 * 2 + 300 * 10) / 1e6) / 2;
  assert.ok(Math.abs(cost.usdPer1000Runs.value - mean * 1000) < 1e-9);
  assert.equal(cost.usdPer1000Runs.state, "estimated");
  assert.match(cost.usdPer1000Runs.note, /2026-10-09/);
  assert.equal(cost.basedOn, 2);
});

test("a model with no answered call has no cost, with the reason", () => {
  assert.deepEqual(costPer1000Runs([], price, "d"), { kind: "unavailable", reason: NO_CALLS_REASON });
});

test("a model without a price has no cost, with the reason", () => {
  const call = [{ inputTokens: 1, outputTokens: 1, ms: 1 }];
  assert.deepEqual(costPer1000Runs(call, undefined, "d"), { kind: "unavailable", reason: NO_PRICE_REASON });
  assert.deepEqual(costPer1000Runs(call, { listed: false }, "d"), { kind: "unavailable", reason: NO_PRICE_REASON });
});

test("a run that reported no tokens has no cost, with the reason", () => {
  assert.deepEqual(costPer1000Runs([{ inputTokens: null, outputTokens: null, ms: 1 }], price, "d"), { kind: "unavailable", reason: NO_TOKENS_REASON });
});

test("response time is measured: mean, fastest and slowest", () => {
  const time = responseTime([{ inputTokens: 1, outputTokens: 1, ms: 1000 }, { inputTokens: 1, outputTokens: 1, ms: 3000 }]);
  assert.equal(time.kind, "measured");
  assert.equal(time.meanMs.value, 2000);
  assert.equal(time.meanMs.state, "measured");
  assert.equal(time.fastestMs, 1000);
  assert.equal(time.slowestMs, 3000);
  assert.deepEqual(responseTime([]), { kind: "unavailable", reason: NO_CALLS_REASON });
});

test("an amount under one cent reads less than $0.01, never $0.00", () => {
  assert.equal(formatUsd(0.004), "less than $0.01");
  assert.equal(formatUsd(0), "$0.00");
  assert.equal(formatUsd(3.9), "$3.90");
  assert.equal(formatUsd(1234.5), "$1,234.50");
});

test("seconds have one decimal", () => {
  assert.equal(formatSeconds(4558), "4.6");
  assert.equal(formatSeconds(960), "1.0");
});

test("percent lower is whole, negative when higher, null with nothing to compare", () => {
  assert.equal(percentLower(3.9, 0.08), 98);
  assert.equal(percentLower(1, 1.5), -50);
  assert.equal(percentLower(0, 1), null);
});
