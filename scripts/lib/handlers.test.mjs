// What the routes do, end to end except for the network: who may spend, what
// is free, and what a follow-up may do.
import test from "node:test";
import assert from "node:assert/strict";
import { forThisVisitor, handleCheck, handleFollowup, handleStatus, isCacheable } from "../../lib/server/handlers.ts";
import { addressKey, jsonResponse, readJsonBody, toResponse, visitorOf } from "../../lib/server/http.ts";
import { memoryStore } from "../../lib/server/store.ts";
import { cacheKey } from "../../lib/server/guard.ts";
import { parseEventLine, replay, splitLines } from "../../lib/events.ts";
import { LIMITS } from "../../lib/limits.ts";
import { depsWith, judgeReplyFor, planBody, SONNET, LUNA, HAIKU, OPUS } from "./test-helpers.mjs";

const WRITER = "google/gemini-3.8-flash";
const NOW = Date.UTC(2026, 9, 9, 15, 0);
const script = (extra = {}) => ({
  [WRITER]: (request) => {
    if (request.prompt.startsWith("You prepare a fair test")) return JSON.stringify(planBody());
    if (request.prompt.startsWith("You are marking answers")) return judgeReplyFor(request);
    return JSON.stringify({ prompt: "Shaped.\n{input}" });
  },
  [SONNET]: () => "Sonnet answer", [LUNA]: () => "Luna answer", [HAIKU]: () => "Haiku answer", [OPUS]: () => "Opus answer",
  ...extra,
});

function setup(overrides = {}, scripted = script()) {
  const { deps, calls } = depsWith(scripted);
  let n = 0;
  const services = { store: memoryStore(() => NOW), deps, now: () => NOW, newRunId: () => `run-${++n}`, ...overrides };
  return { services, calls };
}
const body = { task: "Sort my tickets", models: [SONNET, LUNA, HAIKU], current: SONNET };

async function drain(handled) {
  assert.equal(handled.kind, "stream", handled.error);
  const out = [];
  for await (const event of handled.events) out.push(event);
  return out;
}

test("a request that is not understood is refused before anything is spent", async () => {
  const { services, calls } = setup();
  for (const bad of [null, { task: "" }, { ...body, models: [SONNET] }, { ...body, task: "x".repeat(2001) }, { ...body, models: [SONNET, "x/unknown"] }]) {
    const handled = await handleCheck(bad, "v1", services);
    assert.deepEqual([handled.kind, handled.status, handled.reason], ["reject", 400, "input"]);
  }
  assert.equal(calls.length, 0);
});

test("a first check runs, sends a ticket before the end, and spends one of the visitor's checks", async () => {
  const { services, calls } = setup();
  const events = await drain(await handleCheck(body, "v1", services));
  assert.ok(calls.length > 0);
  const types = events.map((e) => e.type);
  assert.ok(types.indexOf("ticket") < types.indexOf("done"));
  assert.ok(types.includes("verdict"));
  assert.equal(await services.store.get("limit:v:2026-10-09:v1"), "1");
  assert.equal(await services.store.get("limit:site:2026-10-09"), "1");
});

test("asking the same thing again is answered from the cache: no model call, no check spent, labelled cached", async () => {
  const { services, calls } = setup();
  await drain(await handleCheck(body, "v1", services));
  const before = calls.length;
  const again = await drain(await handleCheck({ ...body, models: [HAIKU, SONNET, LUNA] }, "v2", services));
  assert.equal(calls.length, before);
  assert.equal(again[0].type, "start");
  assert.equal(again[0].source, "cached");
  assert.ok(!again.some((e) => e.type === "ticket"), "a cached run has no ticket, so nothing live can start from it");
  assert.equal(again.find((e) => e.type === "cell" && e.cell.status === "answered").cell.ms.state, "recorded");
  assert.equal(await services.store.get("limit:v:2026-10-09:v2"), null);
  assert.equal(await services.store.get("limit:site:2026-10-09"), "1");
});

test("a cached run is told this visitor's current model, and carries no stale verdict", async () => {
  const { services } = setup();
  await drain(await handleCheck(body, "v1", services));
  const again = await drain(await handleCheck({ ...body, current: LUNA }, "v2", services));
  assert.equal(again[0].current, LUNA);
  assert.ok(!again.some((e) => e.type === "verdict"));
  const state = replay(again);
  assert.equal(state.current, LUNA);
  assert.equal(state.serverVerdict, null);
  assert.deepEqual(forThisVisitor([{ type: "verdict", verdict: {} }, { type: "done", totalMs: 1 }], "x"), [{ type: "done", totalMs: 1 }]);
});

test("the cache answers even when no model key is set", async () => {
  const { services } = setup();
  await drain(await handleCheck(body, "v1", services));
  const keyless = { ...services, deps: null };
  const cached = await drain(await handleCheck(body, "v1", keyless));
  assert.equal(cached[0].source, "cached");
});

test("without a model key a new ask is refused with the recorded examples on offer", async () => {
  const { services } = setup({ deps: null });
  const handled = await handleCheck(body, "v1", services);
  assert.deepEqual([handled.kind, handled.status, handled.reason], ["reject", 503, "unavailable"]);
  assert.match(handled.error, /three recorded examples/);
});

test("without a store nothing live runs, because the limits cannot be checked", async () => {
  const { services, calls } = setup({ store: null });
  const handled = await handleCheck(body, "v1", services);
  assert.deepEqual([handled.status, handled.reason], [503, "unavailable"]);
  assert.match(handled.error, /limits cannot be checked/);
  assert.equal(calls.length, 0);
});

test("a visitor's sixth check of the day is refused, and no model is called for it", async () => {
  const { services, calls } = setup();
  for (let n = 0; n < LIMITS.dailyChecksVisitor; n += 1) await drain(await handleCheck({ ...body, task: `Task ${n}` }, "v1", services));
  const used = calls.length;
  const handled = await handleCheck({ ...body, task: "One more" }, "v1", services);
  assert.deepEqual([handled.kind, handled.status, handled.reason], ["reject", 429, "limit"]);
  assert.match(handled.error, /Your free checks for today are used up\. Here are three recorded examples\./);
  assert.equal(calls.length, used);
});

test("when the whole site is out, the message says today's free runs are used up", async () => {
  const { services } = setup();
  await services.store.set("limit:site:2026-10-09", String(LIMITS.dailyChecksSite), 100);
  const handled = await handleCheck({ ...body, task: "Fresh" }, "v9", services);
  assert.equal(handled.status, 429);
  assert.match(handled.error, /^Today's free runs are used up\. Here are three recorded examples\./);
});

test("a run with a model that failed, or no verdict, is not kept for the next visitor", async () => {
  const failing = script({ [LUNA]: () => ({ status: "failed", reason: "x", timedOut: false, ms: 1 }) });
  const { services, calls } = setup({}, failing);
  await drain(await handleCheck(body, "v1", services));
  const before = calls.length;
  const second = await drain(await handleCheck(body, "v1", services));
  assert.ok(calls.length > before, "it ran again instead of replaying the failure");
  assert.equal(second[0].source, "live");
  assert.equal(isCacheable(replay(second)), false);
});

test("a repeat needs a ticket that still exists", async () => {
  const { services } = setup();
  const handled = await handleCheck({ rerun: { ticket: "abcdefgh12345678", testCases: ["a", "b", "c"] } }, "v1", services);
  assert.deepEqual([handled.status, handled.reason], [410, "gone"]);
});

test("a repeat reuses the earlier prompt and checks with the person's test cases, and spends a check", async () => {
  const { services, calls } = setup();
  const first = await drain(await handleCheck(body, "v1", services));
  const ticket = first.find((e) => e.type === "ticket").id;
  const writerCalls = calls.filter((c) => c.prompt.startsWith("You prepare a fair test")).length;
  const again = await drain(await handleCheck({ rerun: { ticket, testCases: ["My own case", "The app crashes on login.", "Please add dark mode."] } }, "v1", services));
  assert.equal(calls.filter((c) => c.prompt.startsWith("You prepare a fair test")).length, writerCalls, "no second writer call");
  const plan = again.find((e) => e.type === "plan").plan;
  assert.deepEqual(plan.testCases.map((c) => c.edited ?? false), [true, false, false]);
  assert.equal(plan.testCases[0].input, "My own case");
  assert.equal(await services.store.get("limit:v:2026-10-09:v1"), "2");
  assert.equal(again[0].source, "live");
  assert.ok(again.some((e) => e.type === "ticket"), "a repeat can be extended and repeated again");
});

async function liveRun(services) {
  const events = await drain(await handleCheck(body, "v1", services));
  return events.find((e) => e.type === "ticket").id;
}

test("a follow-up needs a real ticket and a model that was in the run", async () => {
  const { services } = setup();
  const ticket = await liveRun(services);
  assert.equal((await handleFollowup({ ticket: "abcdefgh12345678", kind: "words", model: LUNA }, services)).status, 410);
  assert.equal((await handleFollowup({ ticket, kind: "words", model: OPUS }, services)).status, 400);
  assert.equal((await handleFollowup({ ticket, kind: "nope", model: LUNA }, services)).status, 400);
});

test("each follow-up can be started once per check", async () => {
  const { services } = setup();
  const ticket = await liveRun(services);
  const first = await drain(await handleFollowup({ ticket, kind: "words", model: LUNA }, services));
  assert.equal(first.at(-1).type, "followup-done");
  const second = await handleFollowup({ ticket, kind: "words", model: LUNA }, services);
  assert.deepEqual([second.status, second.reason], [409, "used"]);
});

test("the shaped prompt is saved on the server, and only that prompt can be tested", async () => {
  const { services, calls } = setup();
  const ticket = await liveRun(services);
  const early = await handleFollowup({ ticket, kind: "variant", model: LUNA }, services);
  assert.deepEqual([early.status, early.reason], [409, "used"]);
  assert.match(early.error, /no shaped prompt/);
  const shape = await drain(await handleFollowup({ ticket, kind: "shape", model: LUNA }, services));
  assert.equal(shape[0].type, "shape");
  const before = calls.length;
  const tested = await drain(await handleFollowup({ ticket, kind: "variant", model: LUNA }, services));
  assert.equal(tested.at(-1).type, "followup-done");
  const lunaPrompts = calls.slice(before).filter((c) => c.model === LUNA).map((c) => c.prompt);
  assert.equal(lunaPrompts.length, 3);
  assert.ok(lunaPrompts.every((p) => p.startsWith("Shaped.")), "the saved prompt, not anything the page sent");
});

test("your words and the shaped prompt join the cached run for the next visitor", async () => {
  const { services } = setup();
  const ticket = await liveRun(services);
  await drain(await handleFollowup({ ticket, kind: "words", model: LUNA }, services));
  await drain(await handleFollowup({ ticket, kind: "shape", model: LUNA }, services));
  await drain(await handleFollowup({ ticket, kind: "variant", model: LUNA }, services));
  const replayed = await drain(await handleCheck(body, "v7", services));
  assert.ok(replayed.some((e) => e.type === "followup-cell" && e.kind === "words"));
  assert.ok(replayed.some((e) => e.type === "shape"));
  assert.ok(!replayed.some((e) => e.type === "followup-start" && e.kind === "variant"), "testing the shaped prompt stays live");
});

test("a follow-up with no key or no store is refused", async () => {
  const { services } = setup();
  const ticket = await liveRun(services);
  assert.equal((await handleFollowup({ ticket, kind: "words", model: LUNA }, { ...services, deps: null })).status, 503);
  assert.equal((await handleFollowup({ ticket, kind: "words", model: LUNA }, { ...services, store: null })).status, 503);
});

test("the status says what is left today and whether live runs are on", async () => {
  const { services } = setup();
  await drain(await handleCheck(body, "v1", services));
  assert.deepEqual(await handleStatus("v1", services), { live: true, keyed: true, visitorLeft: LIMITS.dailyChecksVisitor - 1, siteLeft: LIMITS.dailyChecksSite - 1, resetsAt: "2026-10-10T00:00:00.000Z" });
  assert.equal((await handleStatus("v1", { ...services, deps: null })).live, false);
  assert.equal((await handleStatus("v1", { ...services, store: null })).live, false);
});

test("the cache key the handler uses is the one guard.ts defines", async () => {
  const { services } = setup();
  await drain(await handleCheck(body, "v1", services));
  assert.ok(await services.store.get(cacheKey(body.task, body.models)));
});

test("the response is a stream of json lines the page can read back", async () => {
  const { services } = setup();
  const response = toResponse(await handleCheck(body, "v1", services));
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /application\/x-ndjson/);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const text = await response.text();
  const { lines, rest } = splitLines(text);
  assert.equal(rest, "");
  const events = lines.map(parseEventLine);
  assert.equal(events[0].type, "start");
  assert.equal(events.at(-1).type, "done");
});

test("a refusal is plain json with a reason the page can act on", async () => {
  const { services } = setup({ deps: null });
  const response = toResponse(await handleCheck(body, "v1", services));
  assert.equal(response.status, 503);
  assert.deepEqual(Object.keys(await response.json()).sort(), ["error", "reason"]);
});

test("an event stream that breaks ends with one plain error event", async () => {
  async function* broken() { yield { type: "done", totalMs: 1 }; throw new Error("secret detail sk-or-xyz"); }
  const text = await toResponse({ kind: "stream", events: broken() }).text();
  const events = splitLines(text).lines.map(parseEventLine);
  assert.equal(events.at(-1).type, "error");
  assert.ok(!text.includes("sk-or"), "the error detail is not sent");
});

test("a body that is too large or not json is refused", async () => {
  const json = { "content-type": "application/json" };
  const big = await readJsonBody(new Request("http://x", { method: "POST", headers: json, body: JSON.stringify({ task: "x".repeat(LIMITS.maxBodyBytes) }) }));
  assert.equal(big.ok, false);
  assert.equal(big.response.status, 413);
  const bad = await readJsonBody(new Request("http://x", { method: "POST", headers: json, body: "{nope" }));
  assert.equal(bad.response.status, 400);
  const good = await readJsonBody(new Request("http://x", { method: "POST", headers: json, body: '{"a":1}' }));
  assert.deepEqual(good, { ok: true, body: { a: 1 } });
  assert.equal(jsonResponse(200, {}).headers.get("cache-control"), "no-store");
});

test("the visitor comes from the first forwarded address and is never the address", () => {
  const a = visitorOf(new Headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" }), "s");
  assert.equal(a, visitorOf(new Headers({ "x-forwarded-for": "203.0.113.9" }), "s"));
  assert.equal(a, visitorOf(new Headers({ "x-real-ip": "203.0.113.9" }), "s"));
  assert.notEqual(a, visitorOf(new Headers({ "x-forwarded-for": "198.51.100.1" }), "s"));
  assert.ok(!a.includes("203.0.113"));
  assert.match(visitorOf(new Headers(), "s"), /^[0-9a-f]{24}$/);
});

test("a request that is not json is refused, because a cross-site page cannot send json without a preflight", async () => {
  for (const type of ["text/plain", "application/x-www-form-urlencoded", "text/plain; x=application/json", "text/plain;application/json", "application/jsonx", undefined]) {
    const headers = type ? { "content-type": type } : undefined;
    const refused = await readJsonBody(new Request("http://x", { method: "POST", headers, body: '{"task":"hi"}' }));
    assert.equal(refused.ok, false, String(type));
    assert.equal(refused.response.status, 415);
  }
});

test("an ipv6 address counts as its /64 network: the end of the address buys no new visitor", () => {
  assert.equal(addressKey("203.0.113.9"), "203.0.113.9");
  assert.equal(addressKey("2001:db8:abcd:12:1:2:3:4"), "2001:db8:abcd:12::/64");
  assert.equal(addressKey("2001:db8:abcd:12:ffff:ffff:ffff:ffff"), addressKey("2001:DB8:ABCD:0012::1"));
  assert.equal(addressKey("2001:db8::1"), "2001:db8:0:0::/64");
  assert.equal(addressKey("::1"), "0:0:0:0::/64");
  assert.equal(addressKey("unknown"), "unknown");
  assert.equal(addressKey("::ffff:102:304"), "1.2.3.4", "an ipv4 address in hex form is that address, not a shared network");
  assert.equal(addressKey("::ffff:1.2.3.4"), "1.2.3.4");
  assert.notEqual(addressKey("::ffff:102:304"), addressKey("::ffff:102:305"));
  const a = visitorOf(new Headers({ "x-forwarded-for": "2001:db8:abcd:12::1" }), "s");
  const b = visitorOf(new Headers({ "x-forwarded-for": "2001:db8:abcd:12:aaaa:bbbb:cccc:dddd" }), "s");
  const c = visitorOf(new Headers({ "x-forwarded-for": "2001:db8:abcd:13::1" }), "s");
  assert.equal(a, b);
  assert.notEqual(a, c);
});

test("application/json with a charset is accepted", async () => {
  const good = await readJsonBody(new Request("http://x", { method: "POST", headers: { "content-type": "Application/JSON; charset=utf-8" }, body: '{"a":1}' }));
  assert.equal(good.ok, true);
});

test("brackets, ports, zone ids, spaces and leading zeros do not make a new visitor", () => {
  const forms = ["1.2.3.4", " 1.2.3.4 ", "1.2.3.4:5678", "01.002.3.4", "::ffff:1.2.3.4", "[::ffff:1.2.3.4]", "::ffff:1.2.3.4%x", "::ffff:01.02.03.04", "::ffff:102:304"];
  for (const form of forms) assert.equal(addressKey(form), "1.2.3.4", form);
  const v6 = ["2001:db8::1", "[2001:db8::1]", "[2001:db8::1]:443", "2001:db8::1%eth0", "2001:0db8:0000::0001"];
  for (const form of v6) assert.equal(addressKey(form), "2001:db8:0:0::/64", form);
  assert.notEqual(addressKey("1.2.3.4"), addressKey("1.2.3.5"));
});
