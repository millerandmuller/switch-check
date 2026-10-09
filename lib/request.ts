// Checks the body of a request before anything is spent on it. The messages
// are the ones the page shows, so they are written for the person, not for a
// log. Pure: the allowed model ids are passed in.

import { LIMITS } from "./limits.ts";

export type CheckRequest =
  | { kind: "fresh"; task: string; models: string[]; current: string }
  | { kind: "rerun"; ticket: string; testCases: string[] };

export type FollowupKind = "words" | "shape" | "variant";
export const FOLLOWUP_KINDS: readonly FollowupKind[] = ["words", "shape", "variant"];

export type FollowupRequest = { ticket: string; kind: FollowupKind; model: string };

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

const TICKET_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

function record(body: unknown): Record<string, unknown> | null {
  return typeof body === "object" && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
}

export function parseCheckRequest(body: unknown, allowedModelIds: string[]): Parsed<CheckRequest> {
  const input = record(body);
  if (input === null) return { ok: false, error: "The request was not understood." };

  if (input.rerun !== undefined) {
    const rerun = record(input.rerun);
    if (rerun === null) return { ok: false, error: "The request was not understood." };
    const ticket = rerun.ticket;
    if (typeof ticket !== "string" || !TICKET_PATTERN.test(ticket)) {
      return { ok: false, error: "This run can no longer be repeated. Start a new check." };
    }
    const cases = rerun.testCases;
    if (!Array.isArray(cases) || cases.length !== LIMITS.testCases) {
      return { ok: false, error: `Run again needs exactly ${LIMITS.testCases} test cases.` };
    }
    const trimmed = cases.map((entry) => (typeof entry === "string" ? entry.trim() : ""));
    const empty = trimmed.findIndex((entry) => entry === "");
    if (empty !== -1) return { ok: false, error: `Test case ${empty + 1} is empty.` };
    const long = trimmed.findIndex((entry) => Array.from(entry).length > LIMITS.maxTestCaseChars);
    if (long !== -1) {
      return { ok: false, error: `Test case ${long + 1} is longer than ${LIMITS.maxTestCaseChars.toLocaleString("en-US")} characters.` };
    }
    return { ok: true, value: { kind: "rerun", ticket, testCases: trimmed } };
  }

  const task = typeof input.task === "string" ? input.task.trim() : "";
  if (task === "") return { ok: false, error: "Type what you want a model to do." };
  const taskChars = Array.from(task).length;
  if (taskChars > LIMITS.maxTaskChars) {
    return {
      ok: false,
      error: `The task is ${taskChars.toLocaleString("en-US")} characters; the limit is ${LIMITS.maxTaskChars.toLocaleString("en-US")}.`,
    };
  }

  const models = input.models;
  if (!Array.isArray(models) || models.some((id) => typeof id !== "string")) {
    return { ok: false, error: "Pick the models to compare." };
  }
  const ids = models as string[];
  if (new Set(ids).size !== ids.length) return { ok: false, error: "A model was picked twice." };
  const unknown = ids.find((id) => !allowedModelIds.includes(id));
  if (unknown !== undefined) return { ok: false, error: "That model is not offered." };
  if (ids.length < LIMITS.minModels) return { ok: false, error: `Pick at least ${LIMITS.minModels} models.` };
  if (ids.length > LIMITS.maxModels) return { ok: false, error: `Pick at most ${LIMITS.maxModels} models.` };

  const current = input.current;
  if (typeof current !== "string" || !ids.includes(current)) {
    return { ok: false, error: "The model you use today must be one of the models picked." };
  }
  return { ok: true, value: { kind: "fresh", task, models: ids, current } };
}

export function parseFollowupRequest(body: unknown): Parsed<FollowupRequest> {
  const input = record(body);
  if (input === null) return { ok: false, error: "The request was not understood." };
  const { ticket, kind, model } = input;
  if (typeof ticket !== "string" || !TICKET_PATTERN.test(ticket)) {
    return { ok: false, error: "This run can no longer be extended. Start a new check." };
  }
  if (typeof kind !== "string" || !(FOLLOWUP_KINDS as readonly string[]).includes(kind)) {
    return { ok: false, error: "That follow-up is not offered." };
  }
  if (typeof model !== "string" || model === "") return { ok: false, error: "A model is needed." };
  return { ok: true, value: { ticket, kind: kind as FollowupKind, model } };
}
