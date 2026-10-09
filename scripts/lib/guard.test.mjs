// The store, the daily allowance, the cache and the tickets.
import test from "node:test";
import assert from "node:assert/strict";
import { memoryStore, restStore, storeFromEnv } from "../../lib/server/store.ts";
import {
  addToCache, cacheKey, claimFollowup, consumeCheck, dayKey, loadShapedPrompt, loadTicket, newTicketId, nextResetIso,
  peekLimits, readCache, saveShapedPrompt, saveTicket, siteLimitKey, ticketKey, visitorId, visitorLimitKey, writeCache,
} from "../../lib/server/guard.ts";
import { limitScope, limitSecret } from "../../lib/server/services.ts";
import { LIMITS } from "../../lib/limits.ts";

const DAY = Date.UTC(2026, 9, 9, 15, 30);
const SCOPE = "production";

test("memory: values expire, counts start at one and keep their first expiry", async () => {
  let t = 0;
  const store = memoryStore(() => t);
  await store.set("a", "1", 10);
  assert.equal(await store.get("a"), "1");
  t = 9_999;
  assert.equal(await store.get("a"), "1");
  t = 10_000;
  assert.equal(await store.get("a"), null);
  t = 0;
  assert.equal(await store.incr("n", 5), 1);
  t = 3_000;
  assert.equal(await store.incr("n", 5), 2);
  t = 5_000;
  assert.equal(await store.incr("n", 5), 1, "the count restarted when the first expiry passed");
});

test("memory: set-if-absent sets once", async () => {
  const store = memoryStore();
  assert.equal(await store.setIfAbsent("k", "v", 10), true);
  assert.equal(await store.setIfAbsent("k", "w", 10), false);
  assert.equal(await store.get("k"), "v");
});

function fakeRedis(replies) {
  const sent = [];
  return {
    sent,
    fetchImpl: async (url, init) => {
      sent.push({ url, auth: init.headers.Authorization, body: JSON.parse(init.body) });
      const next = replies.shift();
      return new Response(JSON.stringify(next.body), { status: next.status ?? 200 });
    },
  };
}

test("rest: commands go out as Redis commands with the token in the header", async () => {
  const fake = fakeRedis([{ body: { result: "hello" } }, { body: { result: "OK" } }, { body: { result: "OK" } }, { body: { result: null } }, { body: [{ result: 3 }, { result: 1 }] }]);
  const store = restStore("https://kv.example/", "secret-token", fake.fetchImpl);
  assert.equal(await store.get("a"), "hello");
  await store.set("a", "v", 60);
  assert.equal(await store.setIfAbsent("b", "v", 60), true);
  assert.equal(await store.setIfAbsent("b", "v", 60), false);
  assert.equal(await store.incr("c", 86400), 3);
  assert.deepEqual(fake.sent.map((s) => s.body), [
    ["GET", "a"], ["SET", "a", "v", "EX", 60], ["SET", "b", "v", "EX", 60, "NX"], ["SET", "b", "v", "EX", 60, "NX"],
    [["INCR", "c"], ["EXPIRE", "c", 86400, "NX"]],
  ]);
  assert.deepEqual(fake.sent.map((s) => s.url), ["https://kv.example", "https://kv.example", "https://kv.example", "https://kv.example", "https://kv.example/pipeline"]);
  assert.ok(fake.sent.every((s) => s.auth === "Bearer secret-token"));
});

test("rest: a failing store throws without the token or the address in the message", async () => {
  const store = restStore("https://kv.example", "secret-token", fakeRedis([{ status: 500, body: {} }, { body: { error: "ERR wrong" } }, { body: [{ error: "x" }] }]).fetchImpl);
  for (const run of [() => store.get("a"), () => store.get("a"), () => store.incr("a", 1)]) {
    await assert.rejects(run, (error) => !/secret-token|kv\.example/.test(error.message));
  }
});

test("the store comes from the environment: the real one, memory in development, nothing in production", () => {
  assert.ok(storeFromEnv({ KV_REST_API_URL: "https://x", KV_REST_API_TOKEN: "t", NODE_ENV: "production" }));
  assert.ok(storeFromEnv({ NODE_ENV: "development" }));
  assert.equal(storeFromEnv({ NODE_ENV: "production" }), null);
  assert.equal(storeFromEnv({ NODE_ENV: "production", KV_REST_API_URL: "https://x" }), null, "a url without a token is no store");
  assert.equal(storeFromEnv({ NODE_ENV: "development" }), storeFromEnv({ NODE_ENV: "development" }), "development keeps one memory store");
});

test("days run from 00:00 UTC", () => {
  assert.equal(dayKey(DAY), "2026-10-09");
  assert.equal(dayKey(Date.UTC(2026, 9, 9, 23, 59, 59)), "2026-10-09");
  assert.equal(dayKey(Date.UTC(2026, 9, 10, 0, 0, 0)), "2026-10-10");
  assert.equal(nextResetIso(DAY), "2026-10-10T00:00:00.000Z");
  assert.equal(nextResetIso(Date.UTC(2026, 11, 31, 23, 0)), "2027-01-01T00:00:00.000Z");
});

test("a visitor is a keyed hash: stable, different per address and per secret, and not the address", () => {
  const a = visitorId("203.0.113.9", "s1");
  assert.equal(a, visitorId("203.0.113.9", "s1"));
  assert.notEqual(a, visitorId("203.0.113.10", "s1"));
  assert.notEqual(a, visitorId("203.0.113.9", "s2"));
  assert.ok(!a.includes("203") && /^[0-9a-f]{24}$/.test(a));
});

test("a visitor gets five checks a day, then is refused without touching the site's count", async () => {
  const store = memoryStore(() => DAY);
  const results = [];
  for (let n = 0; n < 6; n += 1) results.push(await consumeCheck(store, SCOPE, "v1", DAY));
  assert.deepEqual(results.slice(0, 5).map((r) => r.ok), [true, true, true, true, true]);
  assert.deepEqual(results.map((r) => r.ok && r.visitorLeft), [4, 3, 2, 1, 0, false]);
  assert.deepEqual(results[5], { ok: false, reason: "visitor" });
  assert.equal(await store.get(siteLimitKey(SCOPE, "2026-10-09")), "5", "the refused sixth did not use a site check");
});

test("the site's whole day is spent across visitors, then everyone is refused", async () => {
  const store = memoryStore(() => DAY);
  for (let n = 0; n < LIMITS.dailyChecksSite; n += 1) {
    const result = await consumeCheck(store, SCOPE, `visitor-${n}`, DAY);
    assert.equal(result.ok, true, `check ${n + 1}`);
  }
  assert.deepEqual(await consumeCheck(store, SCOPE, "visitor-new", DAY), { ok: false, reason: "site" });
});

// One store is shared by the live site and every preview. Before the scope
// was part of the key, five checks run on a preview came off the live site's
// allowance for that day.
test("each environment counts on its own, in the same store", async () => {
  const store = memoryStore(() => DAY);
  for (let n = 0; n < LIMITS.dailyChecksVisitor; n += 1) {
    assert.equal((await consumeCheck(store, "preview", "v1", DAY)).ok, true, `preview check ${n + 1}`);
  }
  assert.deepEqual(await consumeCheck(store, "preview", "v1", DAY), { ok: false, reason: "visitor" });

  // The same visitor on the live site still has the whole day.
  const live = await peekLimits(store, "production", "v1", DAY);
  assert.deepEqual(
    [live.live, live.visitorLeft, live.siteLeft],
    [true, LIMITS.dailyChecksVisitor, LIMITS.dailyChecksSite],
    "a preview spent the live site's day",
  );
  assert.equal((await consumeCheck(store, "production", "v1", DAY)).ok, true);
  // And spending on the live site leaves the preview where it was.
  assert.equal((await peekLimits(store, "preview", "v1", DAY)).visitorLeft, 0);
});

// With LIMIT_SALT set, the hash that stands in for an address no longer
// depends on the model key, so rotating the key cannot reset everyone's day
// and the live site and a preview no longer disagree about who a visitor is.
test("the visitor hash is keyed by LIMIT_SALT when there is one, not by the model key", () => {
  assert.equal(limitSecret({ LIMIT_SALT: "salt", OPENROUTER_API_KEY: "model-key" }), "salt");
  assert.notEqual(limitSecret({ LIMIT_SALT: "salt", OPENROUTER_API_KEY: "model-key" }), "model-key");
  // The same address keeps the same id when only the model key changes.
  const withSalt = (key) => visitorId("203.0.113.9", limitSecret({ LIMIT_SALT: "salt", OPENROUTER_API_KEY: key }));
  assert.equal(withSalt("key-one"), withSalt("key-two"));
  // Without a salt it still falls back, and then the key does decide the id.
  assert.equal(limitSecret({ OPENROUTER_API_KEY: "model-key" }), "model-key");
  const noSalt = (key) => visitorId("203.0.113.9", limitSecret({ OPENROUTER_API_KEY: key }));
  assert.notEqual(noSalt("key-one"), noSalt("key-two"));
  // An empty value is not a salt.
  assert.equal(limitSecret({ LIMIT_SALT: "", OPENROUTER_API_KEY: "model-key" }), "model-key");
});

// The cache and the tickets share the store with the limits, so they carry
// the environment for the same reason: a preview must not hand the live site
// a finished run, or claim a follow-up on its behalf.
test("the cache and the ticket keys carry the environment as well", async () => {
  assert.equal(ticketKey("production", "abc"), "ticket:production:abc");
  assert.equal(ticketKey("preview", "abc", "words"), "ticket:preview:abc:words");
  assert.notEqual(ticketKey("preview", "abc"), ticketKey("production", "abc"));
  const store = memoryStore(() => DAY);
  const ticket = { task: "t", plan: { prompt: "p", testCases: [], checks: [], additions: ["a"], taskClass: "one-response" }, models: ["m/one"], current: "m/one", cacheKey: null };
  await saveTicket(store, "preview", "abc12345", ticket);
  assert.notEqual(await loadTicket(store, "preview", "abc12345"), null);
  assert.equal(await loadTicket(store, "production", "abc12345"), null, "a preview ticket was readable on the live site");
  // A follow-up claimed on a preview leaves the live site's claim free.
  assert.equal(await claimFollowup(store, "preview", "abc12345", "words"), true);
  assert.equal(await claimFollowup(store, "preview", "abc12345", "words"), false);
  assert.equal(await claimFollowup(store, "production", "abc12345", "words"), true);
});

test("the scope is in the key itself, and comes from the environment Vercel names", () => {
  assert.equal(siteLimitKey("production", "2026-10-09"), "limit:production:site:2026-10-09");
  assert.equal(visitorLimitKey("preview", "2026-10-09", "abc"), "limit:preview:v:2026-10-09:abc");
  assert.notEqual(siteLimitKey("preview", "2026-10-09"), siteLimitKey("production", "2026-10-09"));
  assert.equal(limitScope({ VERCEL_ENV: "production" }), "production");
  assert.equal(limitScope({ VERCEL_ENV: "preview" }), "preview");
  assert.equal(limitScope({}), "development");
  // Anything unexpected goes in one bucket rather than making a key of its own.
  assert.equal(limitScope({ VERCEL_ENV: "weird:value" }), "other");
});

test("a new day starts the counts again", async () => {
  const store = memoryStore(() => DAY);
  for (let n = 0; n < 5; n += 1) await consumeCheck(store, SCOPE, "v1", DAY);
  assert.equal((await consumeCheck(store, SCOPE, "v1", DAY)).ok, false);
  assert.equal((await consumeCheck(store, SCOPE, "v1", DAY + 86_400_000)).ok, true);
});

test("no store, or a store that throws, means no live run", async () => {
  assert.deepEqual(await consumeCheck(null, SCOPE, "v", DAY), { ok: false, reason: "unavailable" });
  const broken = { get: async () => { throw new Error("down"); }, set: async () => { throw new Error("down"); }, setIfAbsent: async () => { throw new Error("down"); }, incr: async () => { throw new Error("down"); } };
  assert.deepEqual(await consumeCheck(broken, SCOPE, "v", DAY), { ok: false, reason: "unavailable" });
  assert.equal((await peekLimits(broken, SCOPE, "v", DAY)).live, false);
  assert.equal((await peekLimits(null, SCOPE, "v", DAY)).live, false);
  assert.equal(await readCache(broken, "k"), null);
  assert.equal(await loadTicket(broken, SCOPE, "abcdefgh1234"), null);
});

test("peeking shows what is left without taking a check", async () => {
  const store = memoryStore(() => DAY);
  await consumeCheck(store, SCOPE, "v1", DAY);
  await consumeCheck(store, SCOPE, "v1", DAY);
  const left = await peekLimits(store, SCOPE, "v1", DAY);
  assert.deepEqual(left, { live: true, visitorLeft: LIMITS.dailyChecksVisitor - 2, siteLeft: LIMITS.dailyChecksSite - 2, resetsAt: "2026-10-10T00:00:00.000Z" });
  assert.deepEqual(await peekLimits(store, SCOPE, "v1", DAY), left);
});

test("peeking says not live once the visitor or the site is out", async () => {
  const store = memoryStore(() => DAY);
  for (let n = 0; n < 5; n += 1) await consumeCheck(store, SCOPE, "v1", DAY);
  assert.equal((await peekLimits(store, SCOPE, "v1", DAY)).live, false);
  assert.equal((await peekLimits(store, SCOPE, "v2", DAY)).live, true);
});

test("the cache key is the task and the models, whitespace squashed, models in any order", () => {
  const a = cacheKey(SCOPE, "Sort my  emails\n", ["m/two", "m/one"]);
  assert.equal(a, cacheKey(SCOPE, "  Sort my emails", ["m/one", "m/two"]));
  assert.notEqual(a, cacheKey(SCOPE, "Sort my emails.", ["m/one", "m/two"]));
  assert.notEqual(a, cacheKey(SCOPE, "Sort my emails", ["m/one", "m/three"]));
  assert.notEqual(a, cacheKey(SCOPE, "sort my emails", ["m/one", "m/two"]), "case matters to a task");
  assert.match(a, /^cache:production:v1:[0-9a-f]{64}$/);
  // A preview must never be handed the live site's finished run, or the other way round.
  assert.notEqual(a, cacheKey("preview", "Sort my  emails\n", ["m/two", "m/one"]));
  assert.match(cacheKey("preview", "x", ["m/one"]), /^cache:preview:v1:/);
});

test("a cached run is kept for 24 hours and follow-ups are added to it", async () => {
  let t = 0;
  const store = memoryStore(() => t);
  const key = cacheKey(SCOPE, "task", ["a", "b"]);
  assert.equal(await readCache(store, key), null);
  await writeCache(store, key, { events: [{ type: "done", totalMs: 1 }], extra: [] });
  await addToCache(store, key, [{ type: "shape", model: "a", prompt: "p {input}" }]);
  const entry = await readCache(store, key);
  assert.equal(entry.events.length, 1);
  assert.deepEqual(entry.extra, [{ type: "shape", model: "a", prompt: "p {input}" }]);
  t = LIMITS.cacheSeconds * 1000 - 1;
  assert.ok(await readCache(store, key));
  t = LIMITS.cacheSeconds * 1000;
  assert.equal(await readCache(store, key), null);
  await addToCache(store, key, []); // nothing to add to: no error, nothing created
  assert.equal(await readCache(store, key), null);
});

test("a ticket keeps the run for an hour, each follow-up can be claimed once, ids are unguessable", async () => {
  let t = 0;
  const store = memoryStore(() => t);
  const id = newTicketId();
  assert.match(id, /^[0-9a-f]{32}$/);
  assert.notEqual(id, newTicketId());
  const ticket = { task: "task", plan: { prompt: "{input}" }, models: ["a", "b"], current: "a", cacheKey: null };
  await saveTicket(store, SCOPE, id, ticket);
  assert.deepEqual(await loadTicket(store, SCOPE, id), ticket);
  assert.equal(await claimFollowup(store, SCOPE, id, "words"), true);
  assert.equal(await claimFollowup(store, SCOPE, id, "words"), false);
  assert.equal(await claimFollowup(store, SCOPE, id, "shape"), true);
  await saveShapedPrompt(store, SCOPE, id, "Shaped {input}");
  assert.equal(await loadShapedPrompt(store, SCOPE, id), "Shaped {input}");
  t = LIMITS.ticketSeconds * 1000;
  assert.equal(await loadTicket(store, SCOPE, id), null);
});
