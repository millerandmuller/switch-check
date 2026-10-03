// No test here touches the network: every call goes to a fake fetch.
import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_OUTPUT_TOKENS,
  OPENROUTER_URL,
  buildRequest,
  callModel,
  countTested,
  fillPrompt,
  runSample,
  shapeCell,
} from "./sample-run.mjs";

const KEY = "test-key-not-real";
const WORKFLOW = {
  id: "sample",
  prompt: "Triage this.\n\nEmail: {input}",
  inputs: [
    { label: "one", text: "first email" },
    { label: "two", text: "second email" },
    { label: "three", text: "third email" },
  ],
};
const MODELS = { current: "vendor/current", candidate: "vendor/candidate" };

function okResponse(content, usage = { prompt_tokens: 120, completion_tokens: 45 }) {
  return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content } }], usage }) };
}

// A clock that moves 250 ms on every reading, so each call measures 250 ms.
function steppingClock() {
  let time = 0;
  return () => (time += 250);
}

test("fillPrompt puts the input where the placeholder is", () => {
  assert.equal(fillPrompt("Email: {input}", "hello"), "Email: hello");
});

test("buildRequest sends the filled prompt to the model with the output cap", () => {
  const request = buildRequest({ apiKey: KEY, model: "vendor/current", prompt: WORKFLOW.prompt, input: "first email" });
  assert.equal(request.url, OPENROUTER_URL);
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.headers.Authorization, `Bearer ${KEY}`);
  assert.deepEqual(JSON.parse(request.options.body), {
    model: "vendor/current",
    max_tokens: 600,
    messages: [{ role: "user", content: "Triage this.\n\nEmail: first email" }],
  });
  assert.equal(MAX_OUTPUT_TOKENS, 600);
});

test("shapeCell keeps the output text exactly as returned, with reported tokens and measured time", () => {
  const body = { choices: [{ message: { content: "  priority: urgent\n" } }], usage: { prompt_tokens: 200, completion_tokens: 80 } };
  assert.deepEqual(shapeCell(body, 1234), {
    status: "ok",
    output: "  priority: urgent\n",
    input_tokens: 200,
    output_tokens: 80,
    response_ms: 1234,
  });
});

test("shapeCell saves missing token counts as null, not as zero", () => {
  const cell = shapeCell({ choices: [{ message: { content: "an answer" } }] }, 10);
  assert.equal(cell.input_tokens, null);
  assert.equal(cell.output_tokens, null);
});

test("shapeCell marks an answer with no text as not tested", () => {
  assert.deepEqual(shapeCell({ choices: [{ message: { content: "" } }] }, 10), {
    status: "not tested",
    reason: "The model returned no output text.",
  });
  assert.equal(shapeCell({}, 10).status, "not tested");
});

test("runSample makes six calls, one per input and model, and saves each answer", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    const body = JSON.parse(options.body);
    calls.push(`${body.model} <- ${body.messages[0].content.split("Email: ")[1]}`);
    return okResponse(`answer from ${body.model}`);
  };
  const file = await runSample({ fetchImpl, now: steppingClock(), apiKey: KEY, workflow: WORKFLOW, models: MODELS, runDate: "2026-10-03" });

  assert.deepEqual(calls, [
    "vendor/current <- first email",
    "vendor/candidate <- first email",
    "vendor/current <- second email",
    "vendor/candidate <- second email",
    "vendor/current <- third email",
    "vendor/candidate <- third email",
  ]);
  assert.equal(file.run_date, "2026-10-03");
  assert.deepEqual(file.models, MODELS);
  assert.equal(file.results.length, 3);
  assert.deepEqual(file.results[1], {
    input_label: "two",
    current: { status: "ok", output: "answer from vendor/current", input_tokens: 120, output_tokens: 45, response_ms: 250 },
    candidate: { status: "ok", output: "answer from vendor/candidate", input_tokens: 120, output_tokens: 45, response_ms: 250 },
  });
  assert.equal(countTested(file), 6);
});

test("the saved file never holds the API key", async () => {
  const fetchImpl = async () => okResponse("an answer");
  const file = await runSample({ fetchImpl, now: steppingClock(), apiKey: KEY, workflow: WORKFLOW, models: MODELS, runDate: "2026-10-03" });
  assert.equal(JSON.stringify(file).includes(KEY), false);
});

test("a failed call is retried once and saved when the retry answers", async () => {
  let attempts = 0;
  const fetchImpl = async () => (++attempts === 1 ? { ok: false, status: 502 } : okResponse("second try"));
  const cell = await callModel({ fetchImpl, now: steppingClock(), apiKey: KEY, model: "vendor/current", prompt: WORKFLOW.prompt, input: "x" });
  assert.equal(attempts, 2);
  assert.equal(cell.status, "ok");
  assert.equal(cell.output, "second try");
});

test("a call that fails twice stays not tested with the reason, after exactly two attempts", async () => {
  let attempts = 0;
  const fetchImpl = async () => {
    attempts += 1;
    return { ok: false, status: 429 };
  };
  const cell = await callModel({ fetchImpl, now: steppingClock(), apiKey: KEY, model: "vendor/current", prompt: WORKFLOW.prompt, input: "x" });
  assert.equal(attempts, 2);
  assert.deepEqual(cell, { status: "not tested", reason: "OpenRouter answered 429." });
});

test("a call that throws is saved as not tested and the run continues", async () => {
  const fetchImpl = async (url, options) => {
    const body = JSON.parse(options.body);
    if (body.model === "vendor/candidate") throw new Error("The operation timed out");
    return okResponse("an answer");
  };
  const file = await runSample({ fetchImpl, now: steppingClock(), apiKey: KEY, workflow: WORKFLOW, models: MODELS, runDate: "2026-10-03" });
  assert.equal(countTested(file), 3);
  for (const row of file.results) {
    assert.equal(row.current.status, "ok");
    assert.deepEqual(row.candidate, { status: "not tested", reason: "The call failed: The operation timed out" });
  }
});
