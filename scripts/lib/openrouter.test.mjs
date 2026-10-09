// The model call: request shape, caps, timing, retry and what an error says.
import test from "node:test";
import assert from "node:assert/strict";
import { buildRequest, complete, redact, shapeCompletion } from "../../lib/server/openrouter.ts";
import { LIMITS } from "../../lib/limits.ts";

const KEY = "sk-or-test-key-1234567890";

test("every call carries the key in the header only, the cap and the same reasoning budget", () => {
  const { url, options } = buildRequest(KEY, { model: "a/b", prompt: "Hello {x}", maxTokens: 600 });
  assert.equal(url, "https://openrouter.ai/api/v1/chat/completions");
  assert.equal(options.headers.Authorization, `Bearer ${KEY}`);
  assert.ok(!options.body.includes(KEY), "the key must not be in the body");
  const body = JSON.parse(options.body);
  assert.equal(body.model, "a/b");
  assert.deepEqual(body.messages, [{ role: "user", content: "Hello {x}" }]);
  assert.equal(body.reasoning.max_tokens, LIMITS.maxReasoningTokens, "the same reasoning budget for every model");
});

// P2-8: one cap at the provider covers hidden reasoning and the visible
// answer. Asking for only the answer's 600 lets a reasoning model spend all
// 600 on reasoning and return nothing, which reads as "not tested".
test("hidden reasoning is asked for on top of the answer's allowance, not out of it", () => {
  const body = JSON.parse(buildRequest(KEY, { model: "a/b", prompt: "p", maxTokens: LIMITS.maxOutputTokens }).options.body);
  assert.equal(body.max_tokens, LIMITS.maxOutputTokens + LIMITS.maxReasoningTokens);
  assert.equal(
    body.max_tokens - LIMITS.maxReasoningTokens,
    LIMITS.maxOutputTokens,
    "the answer keeps its full allowance even if reasoning uses all of its own",
  );
  // Anthropic takes a budget rather than an effort: the smallest it accepts is
  // 1,024, and max_tokens has to stay strictly above the budget.
  assert.ok(LIMITS.maxReasoningTokens >= 1024, "below Anthropic's minimum reasoning budget");
  assert.ok(body.max_tokens > LIMITS.maxReasoningTokens);
  // The reasoning is never shown, so it is not asked for in the reply.
  assert.equal(body.reasoning.exclude, true);
  // The writer and the judge get the same headroom, or a long reasoning spell
  // leaves no plan and no judgement.
  const writer = JSON.parse(buildRequest(KEY, { model: "a/b", prompt: "p", maxTokens: LIMITS.writerMaxTokens }).options.body);
  assert.equal(writer.max_tokens, LIMITS.writerMaxTokens + LIMITS.maxReasoningTokens);
  assert.equal(writer.reasoning.max_tokens, LIMITS.maxReasoningTokens);
});

// An effort is a hint, a budget is a cap. Measured against the real API,
// `effort: "low"` let DeepSeek V4.1 Flash spend every token it had on
// reasoning (600 of 600, and again 1,624 of 1,624) and return nothing, while
// the same model under a 1,024-token budget stopped at 873 and answered.
test("the reasoning allowance is asked for as a budget, never as an effort", () => {
  const body = JSON.parse(buildRequest(KEY, { model: "a/b", prompt: "p", maxTokens: 600 }).options.body);
  assert.equal(body.reasoning.effort, undefined, "an effort does not bound the reasoning, and may not be sent with a budget");
  assert.equal(typeof body.reasoning.max_tokens, "number");
  assert.deepEqual(Object.keys(body.reasoning).sort(), ["exclude", "max_tokens"]);
});

test("the answer text is kept exactly as returned, with the API's own token counts", () => {
  const text = "  **Priority:** High\n\n- one\n  ";
  const shaped = shapeCompletion({ choices: [{ message: { content: text }, finish_reason: "stop" }], usage: { prompt_tokens: 12, completion_tokens: 34 } }, 910);
  assert.deepEqual(shaped, { status: "ok", text, inputTokens: 12, outputTokens: 34, ms: 910, truncated: false });
});

test("a missing token count stays null, never zero", () => {
  const shaped = shapeCompletion({ choices: [{ message: { content: "x" } }], usage: { prompt_tokens: "12" } }, 1);
  assert.equal(shaped.inputTokens, null);
  assert.equal(shaped.outputTokens, null);
});

test("an answer cut off by the cap is flagged", () => {
  assert.equal(shapeCompletion({ choices: [{ message: { content: "partial" }, finish_reason: "length" }] }, 1).truncated, true);
});

test("no text is a failure with a reason, and says when the allowance went on reasoning", () => {
  assert.equal(shapeCompletion({ choices: [{ message: { content: "" }, finish_reason: "stop" }] }, 1).reason, "The model returned no output text.");
  assert.equal(shapeCompletion({ choices: [] }, 1).status, "failed");
  assert.match(shapeCompletion({ choices: [{ message: { content: null }, finish_reason: "length" }] }, 1).reason, /whole token allowance/);
});

// P2-8: a model can still reason past its own allowance. The cell stays not
// tested, and the reason has to say in plain words where the tokens went.
test("a reply that went entirely on hidden reasoning says so in plain words", () => {
  const body = {
    choices: [{ message: { content: "" }, finish_reason: "length" }],
    usage: { prompt_tokens: 300, completion_tokens: 1624, completion_tokens_details: { reasoning_tokens: 1624 } },
  };
  const shaped = shapeCompletion(body, 9000);
  assert.equal(shaped.status, "failed");
  assert.equal(shaped.reason, "The model spent its token allowance on hidden reasoning (1,624 tokens) and wrote no answer.");
  assert.ok(!/undefined|NaN|null/.test(shaped.reason));
});

// The cost figure is the published price times the API's own token counts, and
// completion_tokens already holds the reasoning tokens. Subtracting them here
// would quietly under-report what a reasoning model costs.
test("reasoning tokens stay inside the output count, so the cost figure counts them", () => {
  const shaped = shapeCompletion(
    {
      choices: [{ message: { content: "An answer." }, finish_reason: "stop" }],
      usage: { prompt_tokens: 300, completion_tokens: 1100, completion_tokens_details: { reasoning_tokens: 900 } },
    },
    1200,
  );
  assert.equal(shaped.status, "ok");
  assert.equal(shaped.outputTokens, 1100);
  assert.equal(shaped.inputTokens, 300);
});

function transport(responses, clock = { t: 0 }) {
  const calls = [];
  return {
    calls,
    clock,
    transport: {
      apiKey: KEY,
      now: () => clock.t,
      fetchImpl: async (url, init) => {
        calls.push({ url, init });
        const next = responses.shift();
        clock.t += next.takes ?? 500;
        if (next.throws) throw next.throws;
        return new Response(JSON.stringify(next.body), { status: next.status ?? 200 });
      },
    },
  };
}
const good = { body: { choices: [{ message: { content: "fine" }, finish_reason: "stop" }], usage: { prompt_tokens: 5, completion_tokens: 6 } } };
const request = { model: "a/b", prompt: "p", maxTokens: 600, timeoutMs: 45_000 };

test("time is read after the body, from the clock the caller gave", async () => {
  const { transport: t } = transport([{ ...good, takes: 2345 }]);
  const result = await complete(t, request);
  assert.equal(result.status, "ok");
  assert.equal(result.ms, 2345);
});

test("a quick failure is tried once more, and the time kept is the answering call's own", async () => {
  const { transport: t, calls } = transport([{ status: 500, body: { error: { message: "upstream" } }, takes: 300 }, { ...good, takes: 800 }]);
  const result = await complete(t, request);
  assert.equal(calls.length, 2);
  assert.equal(result.status, "ok");
  assert.equal(result.ms, 800);
});

test("a second failure stays a failure, with the second reason and the status", async () => {
  const { transport: t, calls } = transport([{ status: 429, body: { error: { message: "slow down" } } }, { status: 503, body: { error: { message: "busy" } } }]);
  const result = await complete(t, request);
  assert.equal(calls.length, 2);
  assert.equal(result.status, "failed");
  assert.equal(result.reason, "OpenRouter answered 503: busy");
});

test("a timeout is not retried and says how long it waited", async () => {
  const error = Object.assign(new Error("aborted"), { name: "TimeoutError" });
  const { transport: t, calls } = transport([{ throws: error, takes: 45_000 }, good]);
  const result = await complete(t, request);
  assert.equal(calls.length, 1);
  assert.deepEqual([result.status, result.timedOut], ["failed", true]);
  assert.equal(result.reason, "No answer within 45 seconds.");
});

test("a failure that took long is not retried either", async () => {
  const { transport: t, calls } = transport([{ status: 500, body: {}, takes: 20_000 }, good]);
  const result = await complete(t, request);
  assert.equal(calls.length, 1);
  assert.equal(result.status, "failed");
});

test("an error message never holds the key", async () => {
  const { transport: t } = transport([{ throws: new TypeError("fetch failed") }, { throws: new TypeError("fetch failed") }]);
  const result = await complete(t, request);
  assert.match(result.reason, /The call failed: fetch failed/);
  assert.ok(!result.reason.includes(KEY));
});

test("a long error detail is cut", async () => {
  const { transport: t } = transport([{ status: 400, body: { error: { message: "x".repeat(500) } }, takes: 20_000 }]);
  const result = await complete(t, request);
  assert.ok(result.reason.length < 200);
});

test("anything shaped like a key or a bearer token is removed from a reason", async () => {
  assert.equal(redact("Incorrect API key provided: sk-or-v1-abcdef1234567890"), "Incorrect API key provided: [removed]");
  assert.equal(redact("Authorization: Bearer abc.def-123"), "Authorization: Bearer [removed]");
  assert.equal(redact("plain text, sk-short"), "plain text, sk-short");
  const { transport: t } = transport([{ status: 401, body: { error: { message: `Bad key ${KEY}` } }, takes: 20_000 }]);
  const result = await complete(t, request);
  assert.ok(!result.reason.includes(KEY) && !result.reason.includes("sk-or-"), result.reason);
  const { transport: t2 } = transport([{ throws: new TypeError(`fetch failed for ${KEY}`) }, { throws: new TypeError(`fetch failed for ${KEY}`) }]);
  assert.ok(!(await complete(t2, request)).reason.includes(KEY));
});

test("the exact key is removed even when split across lines or when it has no recognisable shape", async () => {
  assert.equal(redact("bad key abc-123-secret here", "abc-123-secret"), "bad key [removed] here");
  const split = `Bad key ${KEY.slice(0, 20)}\n${KEY.slice(20)} rejected`;
  const { transport: t } = transport([{ status: 401, body: { error: { message: `Bad key ${KEY.slice(0, 20)}\n${KEY.slice(20)}` } }, takes: 20_000 }]);
  const result = await complete(t, request);
  assert.ok(!result.reason.includes(KEY.slice(20)), result.reason);
  assert.ok(split.length > 0);
  const { transport: t2 } = transport([{ status: 401, body: { error: { message: `rejected ${KEY}` } }, takes: 20_000 }]);
  assert.ok(!(await complete(t2, request)).reason.includes(KEY));
});

test("regex characters in a key are matched literally, and a key with spaces cannot hang the redaction", () => {
  assert.equal(redact("a.b axb", "a.b"), "[removed] axb");
  assert.equal(redact("x+y xxy", "x+y"), "[removed] xxy");
  const started = Date.now();
  redact(`${"a ".repeat(30000)}`, `a${" ".repeat(72)}`);
  assert.ok(Date.now() - started < 1000);
});
