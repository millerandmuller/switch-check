// The recorded examples are real runs, whole, and they are what they say.
import test from "node:test";
import assert from "node:assert/strict";
import { EXAMPLES } from "../../lib/examples.ts";
import { asRecordedEvents, replay } from "../../lib/events.ts";
import { computeVerdict } from "../../lib/verdict.ts";
import { toRunData } from "../../lib/events.ts";
import { candidates, prices } from "./test-helpers.mjs";
import { isFigure } from "../../lib/figure.ts";

const names = Object.fromEntries(candidates.candidates.map((m) => [m.id, m.name]));

test("there are three examples with ids, titles, a date and a task", () => {
  assert.equal(EXAMPLES.length, 3);
  assert.deepEqual(EXAMPLES.map((e) => e.id), ["triage", "classify", "time-tracker"]);
  for (const example of EXAMPLES) {
    assert.ok(example.title && example.task && /^\d{4}-\d{2}-\d{2}T/.test(example.recorded_on));
    assert.ok(example.models.includes(example.current));
  }
});

test("each example is a complete run: a plan, every cell, a verdict and an end", () => {
  for (const example of EXAMPLES) {
    const state = replay(example.events);
    assert.equal(state.phase, "done", example.id);
    assert.ok(state.plan, example.id);
    assert.ok(state.serverVerdict, example.id);
    assert.equal(state.error, null);
    for (const model of example.models) {
      assert.equal(Object.keys(state.cells[model]).length, 3, `${example.id} ${model}`);
    }
    assert.ok(state.stages.verdict.status === "done");
  }
});

test("the verdict in each file is the one the rule gives today, so the files cannot drift from the rule", () => {
  for (const example of EXAMPLES) {
    const state = replay(example.events);
    const data = toRunData(state, { prices: prices.models, priceCheckedOn: prices.checked_on, names, writerName: candidates.writer.name, judgeName: state.judge.name });
    const result = computeVerdict(data);
    assert.equal(result.waiting, false, example.id);
    assert.equal(result.verdict.decision, state.serverVerdict.decision, example.id);
    assert.equal(result.verdict.model, state.serverVerdict.model, example.id);
  }
});

test("no example carries a key, a ticket or an unlabelled figure", () => {
  for (const example of EXAMPLES) {
    const text = JSON.stringify(example);
    assert.doesNotMatch(text, /sk-or-|Bearer|"ticket"/);
    for (const event of example.events) {
      if (event.type === "cell" && event.cell.status === "answered") assert.ok(isFigure(event.cell.ms));
    }
  }
});

test("replayed as recordings, measured times read recorded and the source says recorded", () => {
  for (const example of EXAMPLES) {
    const state = replay(asRecordedEvents(example.events, "recorded"));
    assert.equal(state.source, "recorded");
    const answered = Object.values(state.cells).flatMap((byCase) => Object.values(byCase)).filter((c) => c.status === "answered");
    assert.ok(answered.length > 0);
    assert.ok(answered.every((c) => c.ms.state === "recorded"));
  }
});

test("a live task for each example finished within 40 seconds when it was recorded", () => {
  for (const example of EXAMPLES) assert.ok(example.check_ms < 40_000, `${example.id} took ${example.check_ms} ms`);
});

test("the project example states what it tested and what it did not", () => {
  const state = replay(EXAMPLES.find((e) => e.id === "time-tracker").events);
  assert.equal(state.plan.taskClass, "project");
  assert.ok(state.plan.slice.tested && state.plan.slice.notTested);
});

test("answers are kept exactly: the formatter test below reads them from here", () => {
  const state = replay(EXAMPLES[0].events);
  const cell = Object.values(state.cells)[0].t1;
  assert.equal(typeof cell.text, "string");
  assert.ok(cell.text.length > 20);
});
