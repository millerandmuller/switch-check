// The one place a model is called. Server only: the key is read by the caller
// from the environment and passed in, and it only ever travels in the request
// header. No import of this file may reach client code.
//
// Carried over from scripts/lib/sample-run.mjs: output text is kept exactly as
// returned, token counts are the API's own, and a call that fails is a result,
// not an exception. New: a deadline per call, a flag for a cut-off answer,
// and the same reasoning budget for every model so none is favoured.

import { billedOutputTokens, LIMITS } from "../limits.ts";

export const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

// A call that fails fast may be tried once more, but only if it failed within
// this long and enough of the time allowance is left.
const RETRY_IF_FAILED_WITHIN_MS = 8_000;
const RETRY_NEEDS_MS_LEFT = 6_000;
const MAX_REASON_CHARS = 140;

export type CompleteRequest = {
  model: string;
  prompt: string;
  maxTokens: number;
  // Hard limit for this call, in milliseconds.
  timeoutMs: number;
};

export type Completion =
  | {
      status: "ok";
      text: string;
      inputTokens: number | null;
      outputTokens: number | null;
      ms: number;
      truncated: boolean;
    }
  | { status: "failed"; reason: string; timedOut: boolean; ms: number };

export type Fetch = (url: string, init: RequestInit) => Promise<Response>;

export type Transport = { fetchImpl: Fetch; now: () => number; apiKey: string };

export function buildRequest(apiKey: string, request: Pick<CompleteRequest, "model" | "prompt" | "maxTokens">) {
  return {
    url: OPENROUTER_URL,
    options: {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: request.model,
        // On most providers this one cap covers hidden reasoning and the
        // visible answer together, so the answer's allowance is asked for
        // with the reasoning allowance on top of it. Without that, a model
        // that reasons spends the lot on reasoning and returns nothing.
        max_tokens: billedOutputTokens(request.maxTokens),
        // A hard reasoning budget, the same for every model so none is
        // favoured, and never an effort: an effort is not a budget. Measured
        // on this prompt set, `effort: "low"` let DeepSeek V4.1 Flash spend
        // every token it was given on reasoning (600 of 600, then 1,624 of
        // 1,624) and return no answer at all, while a 1,024-token budget had
        // it stop at 873 and answer. The documented fields are `effort` or
        // `max_tokens`, not both. `exclude` keeps the reasoning out of the
        // reply; it does not make it free, and it is billed as output either
        // way (openrouter.ai/docs/use-cases/reasoning-tokens).
        reasoning: { max_tokens: LIMITS.maxReasoningTokens, exclude: true },
        messages: [{ role: "user", content: request.prompt }],
      }),
    },
  };
}

function tokenCount(value: unknown): number | null {
  return Number.isInteger(value) ? (value as number) : null;
}

type ApiBody = {
  choices?: { message?: { content?: unknown }; finish_reason?: unknown }[];
  usage?: {
    prompt_tokens?: unknown;
    completion_tokens?: unknown;
    // Reasoning tokens are part of completion_tokens, broken out here.
    completion_tokens_details?: { reasoning_tokens?: unknown };
  };
  error?: { message?: unknown };
};

// Turns one API answer into a completion. The text is kept exactly as
// returned. A reply with no text is a failure with a reason, not an empty cell.
// The output count stays the API's own completion_tokens, which already holds
// the reasoning tokens, so hidden reasoning is paid for in the cost figure.
export function shapeCompletion(body: ApiBody, ms: number): Completion {
  const choice = body?.choices?.[0];
  const text = choice?.message?.content;
  const truncated = choice?.finish_reason === "length";
  const reasoningTokens = tokenCount(body.usage?.completion_tokens_details?.reasoning_tokens);
  if (typeof text !== "string" || text.trim() === "") {
    // A model can still reason past its own allowance. Say so plainly: the
    // cell stays not tested, and the reason names where the tokens went.
    const reason =
      reasoningTokens !== null && reasoningTokens > 0
        ? `The model spent its token allowance on hidden reasoning (${reasoningTokens.toLocaleString("en-US")} tokens) and wrote no answer.`
        : truncated
          ? "The model used its whole token allowance before writing an answer."
          : "The model returned no output text.";
    return { status: "failed", reason, timedOut: false, ms };
  }
  return {
    status: "ok",
    text,
    inputTokens: tokenCount(body.usage?.prompt_tokens),
    outputTokens: tokenCount(body.usage?.completion_tokens),
    ms,
    truncated,
  };
}

// Anything shaped like a key or a bearer token is removed before a reason is
// shown, in case an upstream error echoes what it was sent.
export function redact(text: string, exactKey?: string): string {
  // The exact key, even if line breaks or spaces were put between its characters.
  const compact = exactKey?.replace(/\s/g, "");
  const spaced = compact
    ? new RegExp(Array.from(compact, (char) => char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s*"), "g")
    : null;
  const cleared = spaced ? text.replace(spaced, "[removed]") : text;
  return cleared.replace(/sk-[A-Za-z0-9_-]{8,}/g, "[removed]").replace(/Bearer\s+\S+/gi, "Bearer [removed]");
}

function shortReason(value: unknown, exactKey?: string): string {
  // Redact before squashing whitespace, so a key split across lines is whole.
  const text = typeof value === "string" ? redact(value, exactKey).replace(/\s+/g, " ").trim() : "";
  return text.length > MAX_REASON_CHARS ? `${text.slice(0, MAX_REASON_CHARS)}...` : text;
}

async function callOnce(transport: Transport, request: CompleteRequest, timeoutMs: number): Promise<Completion> {
  const startedAt = transport.now();
  const built = buildRequest(transport.apiKey, request);
  // The clock stops after the body is read, not when the headers arrive:
  // OpenRouter can send headers before the model has finished.
  const elapsed = () => Math.round(transport.now() - startedAt);
  try {
    const response = await transport.fetchImpl(built.url, {
      ...built.options,
      signal: AbortSignal.timeout(Math.max(1, timeoutMs)),
    });
    if (!response.ok) {
      let detail = "";
      try {
        detail = shortReason(((await response.json()) as ApiBody)?.error?.message, transport.apiKey);
      } catch {
        // No readable body: the status alone is the reason.
      }
      return { status: "failed", reason: `OpenRouter answered ${response.status}${detail ? `: ${detail}` : "."}`, timedOut: false, ms: elapsed() };
    }
    const body = (await response.json()) as ApiBody;
    return shapeCompletion(body, elapsed());
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      return { status: "failed", reason: `No answer within ${Math.round(timeoutMs / 1000)} seconds.`, timedOut: true, ms: elapsed() };
    }
    // The reason is the error's own message. It never holds the key: the key
    // only travels in the request header.
    return { status: "failed", reason: `The call failed: ${redact(error instanceof Error ? error.message : "unknown error", transport.apiKey)}`, timedOut: false, ms: elapsed() };
  }
}

// One call, with one retry when it failed quickly and there is time left.
export async function complete(transport: Transport, request: CompleteRequest): Promise<Completion> {
  const startedAt = transport.now();
  const first = await callOnce(transport, request, request.timeoutMs);
  if (first.status === "ok" || first.timedOut) return first;
  const used = transport.now() - startedAt;
  const left = request.timeoutMs - used;
  if (used > RETRY_IF_FAILED_WITHIN_MS || left < RETRY_NEEDS_MS_LEFT) return first;
  // The time kept is the answering call's own, not the failed try before it.
  return callOnce(transport, request, left);
}
