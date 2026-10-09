// Turns what the prompt writer returned into a TaskPlan, or says what is
// wrong with it. The writer is a model, so nothing it returns is trusted:
// ids are assigned here, counts are enforced here, and a prompt without its
// input slot is refused.

import { LIMITS } from "./limits.ts";
import { INPUT_SLOT, type TaskPlan } from "./run-types.ts";

export type PlanParse = { ok: true; plan: TaskPlan } | { ok: false; error: string };

const MAX_ADDITIONS = 6;
const MAX_ADDITION_CHARS = 160;
const MAX_CHECK_CHARS = 220;
const MAX_PROMPT_CHARS = 4000;
const MAX_SLICE_CHARS = 280;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

// Pulls the first JSON object out of a model's reply, which may be wrapped in
// a code fence or in a sentence. null when there is none.
export function extractJson(reply: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(reply);
  const candidates = fenced ? [fenced[1], reply] : [reply];
  for (const candidate of candidates) {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start === -1 || end <= start) continue;
    try {
      return JSON.parse(candidate.slice(start, end + 1));
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

export function parsePlan(raw: unknown): PlanParse {
  if (typeof raw !== "object" || raw === null) return { ok: false, error: "The reply was not a JSON object." };
  const body = raw as Record<string, unknown>;

  const prompt = text(body.prompt);
  if (prompt === "") return { ok: false, error: "The prompt is missing." };
  if (prompt.length > MAX_PROMPT_CHARS) return { ok: false, error: `The prompt is longer than ${MAX_PROMPT_CHARS} characters.` };
  const slots = prompt.split(INPUT_SLOT).length - 1;
  if (slots !== 1) {
    return { ok: false, error: `The prompt must contain ${INPUT_SLOT} exactly once; it has ${slots}.` };
  }

  const inputs = list(body.testInputs).map(text);
  if (inputs.length !== LIMITS.testCases || inputs.some((input) => input === "")) {
    return { ok: false, error: `There must be exactly ${LIMITS.testCases} non-empty test inputs.` };
  }
  const tooLong = inputs.findIndex((input) => Array.from(input).length > LIMITS.maxTestCaseChars);
  if (tooLong !== -1) {
    return { ok: false, error: `Test input ${tooLong + 1} is longer than ${LIMITS.maxTestCaseChars.toLocaleString("en-US")} characters.` };
  }
  if (new Set(inputs).size !== inputs.length) return { ok: false, error: "Two test inputs are identical." };

  const questions = list(body.checks).map(text);
  if (questions.length < LIMITS.minChecks || questions.length > LIMITS.maxChecks || questions.some((q) => q === "")) {
    return { ok: false, error: `There must be ${LIMITS.minChecks} to ${LIMITS.maxChecks} non-empty checks.` };
  }
  if (questions.some((question) => question.length > MAX_CHECK_CHARS)) {
    return { ok: false, error: `A check is longer than ${MAX_CHECK_CHARS} characters.` };
  }
  if (new Set(questions.map((q) => q.toLowerCase())).size !== questions.length) {
    return { ok: false, error: "Two checks are identical." };
  }

  const additions = list(body.additions).map(text).filter((line) => line !== "");
  if (additions.length === 0) return { ok: false, error: "There is no list of what was added to the person's words." };
  if (additions.length > MAX_ADDITIONS || additions.some((line) => line.length > MAX_ADDITION_CHARS)) {
    return { ok: false, error: "The list of additions is too long." };
  }

  const taskClass = body.taskClass;
  if (taskClass !== "one-response" && taskClass !== "project") {
    return { ok: false, error: 'taskClass must be "one-response" or "project".' };
  }
  let slice: TaskPlan["slice"];
  if (taskClass === "project") {
    const sliceBody = (typeof body.slice === "object" && body.slice !== null ? body.slice : {}) as Record<string, unknown>;
    const tested = text(sliceBody.tested);
    const notTested = text(sliceBody.notTested);
    if (tested === "" || notTested === "") {
      return { ok: false, error: "A project needs a slice with what was tested and what was not." };
    }
    if (tested.length > MAX_SLICE_CHARS || notTested.length > MAX_SLICE_CHARS) {
      return { ok: false, error: "The slice description is too long." };
    }
    slice = { tested, notTested };
  }

  return {
    ok: true,
    plan: {
      prompt,
      additions,
      testCases: inputs.map((input, index) => ({ id: `t${index + 1}`, input })),
      checks: questions.map((question, index) => ({ id: `c${index + 1}`, question })),
      taskClass,
      ...(slice === undefined ? {} : { slice }),
    },
  };
}

// The prompt with one test input in its slot. Split and join, not a pattern
// replace, so a "$&" in the input is not read as a command.
export function fillPrompt(prompt: string, input: string): string {
  return prompt.split(INPUT_SLOT).join(input);
}
