// The small pure rules the page leans on: which tiles may be ticked, how
// times and ages read, and how a stream is read back.
import test from "node:test";
import assert from "node:assert/strict";
import { setCurrent, tileOrder, toggleModel, withCurrent } from "../../lib/selection.ts";
import { ageText, dateOnly, formatMs, tokensText } from "../../lib/format.ts";
import { readRun } from "../../lib/stream-client.ts";
import { encodeEvent } from "../../lib/events.ts";

test("the model used today is always one of the models", () => {
  assert.deepEqual(withCurrent(["a", "b"], "a"), ["a", "b"]);
  assert.deepEqual(withCurrent(["a", "b"], "c"), ["a", "b", "c"]);
  assert.deepEqual(withCurrent(["a", "b", "c", "d"], "e"), ["a", "b", "c", "e"], "the last other model makes room");
  assert.deepEqual(withCurrent(["a", "b", "c", "d"], "a"), ["a", "b", "c", "d"]);
  assert.deepEqual(setCurrent({ models: ["a", "b", "c", "d"], current: "a" }, "e"), { models: ["a", "b", "c", "e"], current: "e" });
});

test("tiles tick and untick within two to four, and today's model stays ticked", () => {
  const sel = { models: ["a", "b", "c"], current: "a" };
  assert.deepEqual(toggleModel(sel, "a"), { selection: sel, refused: "current" });
  assert.deepEqual(toggleModel(sel, "b").selection.models, ["a", "c"]);
  assert.deepEqual(toggleModel(toggleModel(sel, "b").selection, "c"), { selection: { models: ["a", "c"], current: "a" }, refused: "minimum" });
  const added = toggleModel(sel, "d");
  assert.deepEqual(added.selection.models, ["a", "b", "c", "d"]);
  assert.deepEqual(toggleModel(added.selection, "e"), { selection: added.selection, refused: "maximum" });
});

test("tiles are grouped by provider, cheaper first inside a group", () => {
  const models = [
    { id: "o/sol", provider: "OpenAI" }, { id: "a/opus", provider: "Anthropic" }, { id: "a/haiku", provider: "Anthropic" }, { id: "o/luna", provider: "OpenAI" },
  ];
  const price = { "o/sol": 10, "a/opus": 20, "a/haiku": 0.5, "o/luna": 0.5 };
  assert.deepEqual(tileOrder(models, (id) => price[id]).map((m) => m.id), ["o/luna", "o/sol", "a/haiku", "a/opus"]);
});

test("times, tokens and ages read plainly", () => {
  assert.equal(formatMs(4558), "4.6 s");
  assert.equal(tokensText(1204, 322), "1,204 in, 322 out");
  assert.equal(tokensText(null, 50), "50 out");
  assert.equal(tokensText(null, null), null);
  const now = Date.parse("2026-10-09T12:00:00Z");
  assert.equal(ageText("2026-10-09T11:59:40Z", now), "just now");
  assert.equal(ageText("2026-10-09T11:59:00Z", now), "1 minute ago");
  assert.equal(ageText("2026-10-09T09:00:00Z", now), "3 hours ago");
  assert.equal(ageText("2026-10-07T12:00:00Z", now), "2 days ago");
  assert.equal(ageText("2026-10-10T12:00:00Z", now), "just now");
  assert.equal(dateOnly("2026-10-09T11:59:00.000Z"), "2026-10-09");
});

function streamOf(chunks, init = {}) {
  const encoder = new TextEncoder();
  const body = new ReadableStream({ start(controller) { for (const c of chunks) controller.enqueue(encoder.encode(c)); controller.close(); } });
  return new Response(body, { status: 200, headers: { "content-type": "application/x-ndjson" }, ...init });
}

test("a stream is read event by event even when chunks split a line", async () => {
  const wire = [{ type: "plan", plan: {} }, { type: "done", totalMs: 5 }].map(encodeEvent).join("");
  const seen = [];
  const result = await readRun(streamOf([wire.slice(0, 7), wire.slice(7, 30), wire.slice(30)]), (e) => seen.push(e.type));
  assert.deepEqual(seen, ["plan", "done"]);
  assert.deepEqual(result, { kind: "streamed", complete: true });
});

test("a stream that stops before its end event is reported as incomplete", async () => {
  const seen = [];
  const result = await readRun(streamOf([encodeEvent({ type: "plan", plan: {} })]), (e) => seen.push(e.type));
  assert.deepEqual(result, { kind: "streamed", complete: false });
});

test("an error event also counts as the end", async () => {
  const result = await readRun(streamOf([encodeEvent({ type: "error", kind: "failed", message: "x" })]), () => {});
  assert.equal(result.complete, true);
});

test("a refusal comes back with its status, message and reason", async () => {
  const response = new Response(JSON.stringify({ error: "Your free checks for today are used up.", reason: "limit" }), { status: 429, headers: { "content-type": "application/json" } });
  assert.deepEqual(await readRun(response, () => {}), { kind: "refused", status: 429, error: "Your free checks for today are used up.", reason: "limit" });
  const odd = await readRun(new Response("<html>", { status: 502 }), () => {});
  assert.equal(odd.kind, "refused");
  assert.equal(odd.reason, "unavailable");
});

test("an age under a minute reads just now, at the edge too", () => {
  const now = Date.parse("2026-10-09T12:00:00Z");
  assert.equal(ageText("2026-10-09T11:59:01Z", now), "just now");
  assert.equal(ageText("2026-10-09T11:59:00Z", now), "1 minute ago");
});
