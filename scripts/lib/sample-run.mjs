// Request building and result shaping for the one-off sample run. No network
// or file access of its own: the caller passes in fetch and the clock, so the
// unit test runs against a fake fetch.

export const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
export const MAX_OUTPUT_TOKENS = 600;
export const CALL_TIMEOUT_MS = 60_000;
export const INPUT_PLACEHOLDER = "{input}";
export const MODEL_SIDES = ["current", "candidate"];

export function fillPrompt(prompt, input) {
  return prompt.split(INPUT_PLACEHOLDER).join(input);
}

// Every call carries the output cap, so one run stays a few cents.
export function buildRequest({ apiKey, model, prompt, input }) {
  return {
    url: OPENROUTER_URL,
    options: {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        max_tokens: MAX_OUTPUT_TOKENS,
        messages: [{ role: "user", content: fillPrompt(prompt, input) }],
      }),
    },
  };
}

function notTested(reason) {
  return { status: "not tested", reason };
}

function tokenCount(value) {
  return Number.isInteger(value) ? value : null;
}

// Turns one API answer into a saved cell. The output text is kept exactly as
// returned. Token counts are the API's own; a missing count stays null.
export function shapeCell(body, responseMs) {
  const output = body?.choices?.[0]?.message?.content;
  if (typeof output !== "string" || output.trim() === "") {
    return notTested("The model returned no output text.");
  }
  return {
    status: "ok",
    output,
    input_tokens: tokenCount(body.usage?.prompt_tokens),
    output_tokens: tokenCount(body.usage?.completion_tokens),
    response_ms: responseMs,
  };
}

async function callOnce({ fetchImpl, now, request }) {
  const startedAt = now();
  try {
    const response = await fetchImpl(request.url, {
      ...request.options,
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    });
    if (!response.ok) return notTested(`OpenRouter answered ${response.status}.`);
    const body = await response.json();
    return shapeCell(body, Math.round(now() - startedAt));
  } catch (error) {
    // The reason is the error's own message. It never holds the key: the key
    // only travels in the request header.
    return notTested(`The call failed: ${error.message}`);
  }
}

// A failed call is retried once. If it fails again it stays not tested, with
// the reason of the second failure.
export async function callModel({ fetchImpl, now, apiKey, model, prompt, input }) {
  const request = buildRequest({ apiKey, model, prompt, input });
  const first = await callOnce({ fetchImpl, now, request });
  if (first.status === "ok") return first;
  return callOnce({ fetchImpl, now, request });
}

// Runs every input on both models, one call at a time, and returns the file
// content. A cell that errors is saved as not tested and the run continues.
export async function runSample({ fetchImpl, now, apiKey, workflow, models, runDate }) {
  const results = [];
  for (const input of workflow.inputs) {
    const row = { input_label: input.label };
    for (const side of MODEL_SIDES) {
      row[side] = await callModel({
        fetchImpl,
        now,
        apiKey,
        model: models[side],
        prompt: workflow.prompt,
        input: input.text,
      });
    }
    results.push(row);
  }
  return {
    note: "One real run of the sample workflow through OpenRouter. Outputs are saved exactly as the models returned them. Token counts are as the API reported them, response times are as the script measured them.",
    run_date: runDate,
    workflow_id: workflow.id,
    max_tokens: MAX_OUTPUT_TOKENS,
    models: { current: models.current, candidate: models.candidate },
    results,
  };
}

export function countTested(file) {
  return file.results
    .flatMap((row) => MODEL_SIDES.map((side) => row[side]))
    .filter((cell) => cell.status === "ok").length;
}
