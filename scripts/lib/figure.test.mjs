// A figure cannot reach the page without a state.
import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { FIGURE_STATES, asRecorded, figure, isFigure, stateCaption } from "../../lib/figure.ts";
import { costPer1000Runs, responseTime } from "../../lib/cost-speed.ts";
import { summarize } from "../../lib/verdict.ts";
import { root } from "./test-helpers.mjs";

test("the five states are the only states", () => {
  assert.deepEqual([...FIGURE_STATES], ["measured", "estimated", "generated", "judged", "recorded"]);
});

test("a figure keeps its value, its state and its note", () => {
  const made = figure(3.2, "measured", "this run");
  assert.deepEqual(made, { value: 3.2, state: "measured", note: "this run" });
  assert.equal(stateCaption(made), "measured · this run");
  assert.equal(stateCaption(figure(1, "judged")), "judged");
});

test("drawing a figure without a state throws", () => {
  assert.throws(() => stateCaption({ value: 5 }), /without a state/);
  assert.throws(() => stateCaption({ value: 5, state: "guessed" }), /without a state/);
  assert.throws(() => stateCaption(5), /without a state/);
  assert.equal(isFigure({ value: 1, state: "estimated" }), true);
  assert.equal(isFigure({ value: 1 }), false);
  assert.equal(isFigure(null), false);
});

test("a saved run shows measured figures as recorded and leaves the others", () => {
  assert.equal(asRecorded(figure(1, "measured")).state, "recorded");
  assert.equal(asRecorded(figure(1, "estimated")).state, "estimated");
  assert.equal(asRecorded(figure(1, "judged")).state, "judged");
});

test("every figure the cost and time functions produce carries a state", () => {
  const cost = costPer1000Runs([{ inputTokens: 100, outputTokens: 100, ms: 10 }], { listed: true, input_per_million: 1, output_per_million: 1 }, "2026-10-09");
  assert.equal(cost.kind, "estimated");
  assert.ok(isFigure(cost.usdPer1000Runs));
  const time = responseTime([{ inputTokens: 1, outputTokens: 1, ms: 1200 }]);
  assert.equal(time.kind, "measured");
  assert.ok(isFigure(time.meanMs));
});

test("every figure a model summary exposes carries a state", () => {
  const plan = { prompt: "{input}", additions: ["a"], testCases: [{ id: "t1", input: "x" }], checks: [{ id: "c1", question: "q?" }], taskClass: "one-response" };
  const cell = { status: "answered", text: "t", ms: figure(900, "measured"), inputTokens: 10, outputTokens: 10, truncated: false };
  const [summary] = summarize({
    plan, models: ["m"], current: "m", cells: { m: { t1: cell } }, judged: { m: { t1: [{ checkId: "c1", pass: true, changedByUser: false }] } },
    prices: { m: { listed: true, input_per_million: 1, output_per_million: 1 } }, priceCheckedOn: "2026-10-09", names: { m: "M" }, writerName: "W", judgeName: "J",
  });
  assert.ok(isFigure(summary.costPer1000));
  assert.ok(isFigure(summary.meanMs));
});

// The chip is the only thing that draws a number with a state under it. This
// scan fails if a screen uses it with a bare string instead of a figure.
test("every use of FigureChip in the app passes a figure", async () => {
  const files = (await readdir(`${root}app`, { recursive: true })).filter((name) => name.endsWith(".tsx"));
  let uses = 0;
  for (const name of files) {
    const source = await readFile(`${root}app/${name}`, "utf8");
    for (const match of source.matchAll(/<FigureChip\b([\s\S]*?)\/>/g)) {
      uses += 1;
      assert.match(match[1], /\bfig=\{/, `${name}: a FigureChip without fig={...}`);
      assert.doesNotMatch(match[1], /\bnote=/, `${name}: a FigureChip with a loose note`);
    }
  }
  assert.ok(uses > 0, "no FigureChip found in the app; the scan would pass on nothing");
});
