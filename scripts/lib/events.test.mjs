// The stream between route and page: one reducer builds the same state from a
// live run, a cached run and a recorded one.
import test from "node:test";
import assert from "node:assert/strict";
import { asRecordedEvents, encodeEvent, initialState, parseEventLine, reduce, replay, splitLines, toRunData, withoutTicket } from "../../lib/events.ts";
import { figure } from "../../lib/figure.ts";

const plan = {
  prompt: "{input}", additions: ["a"], taskClass: "one-response",
  testCases: [{ id: "t1", input: "x" }, { id: "t2", input: "y" }, { id: "t3", input: "z" }],
  checks: [{ id: "c1", question: "q1?" }, { id: "c2", question: "q2?" }, { id: "c3", question: "q3?" }],
};
const answered = (text) => ({ status: "answered", text, ms: figure(1200, "measured", "this run"), inputTokens: 10, outputTokens: 20, truncated: false });
const judge = { id: "j", name: "J", label: "Judged by J" };
const events = [
  { type: "start", runId: "r1", source: "live", at: "2026-10-09T12:00:00.000Z", models: ["m1", "m2"], current: "m1", writer: "W", judge },
  { type: "stage", stage: "plan", state: "start", ms: 1 },
  { type: "stage", stage: "plan", state: "done", ms: 4000 },
  { type: "plan", plan },
  { type: "stage", stage: "grid", state: "start", ms: 4001 },
  { type: "cell", modelId: "m1", testCaseId: "t1", cell: answered("a") },
  { type: "cell", modelId: "m2", testCaseId: "t1", cell: { status: "not-tested", reason: "No answer within 45 seconds." } },
  { type: "stage", stage: "grid", state: "done", ms: 3000 },
  { type: "judge-used", judge: { ...judge, name: "K" } },
  { type: "judged", modelId: "m1", testCaseId: "t1", results: [{ checkId: "c1", pass: true, changedByUser: false }] },
  { type: "ticket", id: "ticket12345" },
  { type: "done", totalMs: 9000 },
];

test("a run adds up to the state the page draws", () => {
  const state = replay(events);
  assert.equal(state.phase, "done");
  assert.equal(state.source, "live");
  assert.deepEqual(state.models, ["m1", "m2"]);
  assert.equal(state.plan, plan);
  assert.equal(state.cells.m1.t1.status, "answered");
  assert.equal(state.cells.m2.t1.status, "not-tested");
  assert.equal(state.stages.plan.status, "done");
  assert.equal(state.stages.plan.ms, 4000);
  assert.equal(state.stages.judge.status, "waiting");
  assert.equal(state.judge.name, "K", "the judge that ran replaces the one planned");
  assert.equal(state.ticket, "ticket12345");
  assert.equal(state.totalMs, 9000);
});

test("a new start empties the old run", () => {
  const state = reduce(replay(events), events[0]);
  assert.equal(state.phase, "running");
  assert.deepEqual(state.cells, {});
  assert.equal(state.plan, null);
  assert.equal(state.ticket, null);
});

test("reducing never changes the state it was given", () => {
  const before = replay(events.slice(0, 6));
  const frozen = JSON.stringify(before);
  reduce(before, events[6]);
  assert.equal(JSON.stringify(before), frozen);
});

test("an error ends the run and keeps what arrived", () => {
  const state = replay([...events.slice(0, 4), { type: "error", kind: "limit", message: "Today's free runs are used up." }]);
  assert.equal(state.phase, "done");
  assert.deepEqual(state.error, { kind: "limit", message: "Today's free runs are used up." });
  assert.equal(state.plan, plan);
});

test("when the judge fails every answered cell gets unset checks the person can set", () => {
  const state = replay([...events.slice(0, 7), { type: "judge-failed", reason: "No answer within 33 seconds." }]);
  assert.equal(state.judgeFailed, "No answer within 33 seconds.");
  assert.deepEqual(state.judged.m1.t1.map((r) => r.pass), [null, null, null]);
  assert.equal(state.judged.m2, undefined, "a model that did not answer has nothing to judge");
});

test("setting a check changes that result and marks it as the person's", () => {
  const failed = replay([...events.slice(0, 7), { type: "judge-failed", reason: "x" }]);
  const set = reduce(failed, { type: "set-check", modelId: "m1", testCaseId: "t1", checkId: "c2", pass: false });
  assert.deepEqual(set.judged.m1.t1[1], { checkId: "c2", pass: false, changedByUser: true });
  assert.equal(set.judged.m1.t1[0].pass, null);
  assert.equal(reduce(failed, { type: "set-check", modelId: "nobody", testCaseId: "t1", checkId: "c1", pass: true }), failed);
});

test("follow-ups fill their own part of the state", () => {
  let state = replay(events);
  state = reduce(state, { type: "followup-start", kind: "words", model: "m1" });
  assert.equal(state.words.running, true);
  state = reduce(state, { type: "followup-cell", kind: "words", testCaseId: "t1", cell: answered("w") });
  state = reduce(state, { type: "followup-judged", kind: "words", testCaseId: "t1", results: [{ checkId: "c1", pass: true, changedByUser: false }] });
  state = reduce(state, { type: "followup-done", kind: "words" });
  assert.deepEqual([state.words.running, state.words.done, state.words.model], [false, true, "m1"]);
  assert.equal(state.words.cells.t1.text, "w");
  state = reduce(state, { type: "shape", model: "m1", prompt: "Better {input}" });
  assert.deepEqual(state.shape, { model: "m1", prompt: "Better {input}" });
  state = reduce(state, { type: "followup-failed", kind: "variant", reason: "No answer came back." });
  assert.equal(state.variant.failed, "No answer came back.");
  state = reduce(state, { type: "followup-failed", kind: "shape", reason: "The writer returned no prompt." });
  assert.equal(state.shapeFailed, "The writer returned no prompt.");
});

test("a recording shows measured times as recorded, drops the ticket and says where it came from", () => {
  const recorded = asRecordedEvents(events, "recorded");
  assert.ok(!recorded.some((e) => e.type === "ticket"));
  assert.equal(recorded[0].source, "recorded");
  const cell = recorded.find((e) => e.type === "cell" && e.cell.status === "answered");
  assert.equal(cell.cell.ms.state, "recorded");
  assert.equal(cell.cell.ms.value, 1200);
  assert.equal(events.find((e) => e.type === "cell").cell.ms.state, "measured", "the original is untouched");
  assert.equal(replay(recorded).source, "recorded");
  assert.equal(asRecordedEvents(events, "cached")[0].source, "cached");
  assert.equal(withoutTicket(events).length, events.length - 1);
});

test("run data needs a plan and a current model", () => {
  const context = { prices: {}, priceCheckedOn: "2026-10-09", names: {}, writerName: "W", judgeName: "J" };
  assert.equal(toRunData(initialState(), context), null);
  const data = toRunData(replay(events), context);
  assert.equal(data.current, "m1");
  assert.deepEqual(data.models, ["m1", "m2"]);
});

test("events travel as one json object per line", () => {
  const wire = events.map(encodeEvent).join("");
  const { lines, rest } = splitLines(wire);
  assert.equal(rest, "");
  assert.deepEqual(lines.map(parseEventLine), events);
});

test("a stream cut in the middle of a line keeps the unfinished part", () => {
  const wire = events.map(encodeEvent).join("");
  const cut = wire.length - 10;
  const first = splitLines(wire.slice(0, cut));
  assert.equal(first.lines.length, events.length - 1);
  assert.ok(first.rest.length > 0);
  const second = splitLines(first.rest + wire.slice(cut));
  assert.equal(second.lines.length, 1);
  assert.equal(second.rest, "");
});

test("a line that is not an event is dropped without stopping the stream", () => {
  assert.equal(parseEventLine("not json"), null);
  assert.equal(parseEventLine("[]"), null);
  assert.equal(parseEventLine('{"no":"type"}'), null);
  assert.deepEqual(parseEventLine('{"type":"done","totalMs":1}'), { type: "done", totalMs: 1 });
});

test("run data from a recording or a cached run is marked recorded, a live one is not", () => {
  const context = { prices: {}, priceCheckedOn: "2026-10-09", names: {}, writerName: "W", judgeName: "J" };
  assert.equal(toRunData(replay(events), context).recorded, false);
  assert.equal(toRunData(replay(asRecordedEvents(events, "recorded")), context).recorded, true);
  assert.equal(toRunData(replay(asRecordedEvents(events, "cached")), context).recorded, true);
});

test("a recorded cell time drops the note that said this run", () => {
  const cell = asRecordedEvents(events, "recorded").find((e) => e.type === "cell" && e.cell.status === "answered").cell;
  assert.deepEqual(cell.ms, { value: 1200, state: "recorded" });
});
