// What each route does, as functions that take plain values and return either
// a refusal or a stream of events. The route files only read the request and
// write the response. Everything that decides whether money is spent is here
// and is tested with a fake model and a memory store.
//
// Order of checks for a new check: understand the request, answer from the
// cache if the same ask was finished today (free, no count), refuse if no key
// or no store, take one from the visitor's and the site's daily allowance,
// and only then call a model.

import { asRecordedEvents, initialState, reduce, type RunEvent, type RunState } from "../events.ts";
import { parseCheckRequest, parseFollowupRequest } from "../request.ts";
import type { TaskPlan } from "../run-types.ts";
import type { Deps } from "./deps.ts";
import {
  addToCache,
  cacheKey,
  claimFollowup,
  consumeCheck,
  loadShapedPrompt,
  loadTicket,
  newTicketId,
  peekLimits,
  readCache,
  saveShapedPrompt,
  saveTicket,
  writeCache,
  type Limits,
} from "./guard.ts";
import { runCheck, runPromptTest, runShape, wordsTemplate } from "./pipeline.ts";
import type { Store } from "./store.ts";

export type Services = {
  store: Store | null;
  // null when no model key is set: only cached runs can be served.
  deps: Deps | null;
  now: () => number;
  newRunId: () => string;
};

export type Reject = {
  kind: "reject";
  status: number;
  // "limit" and "unavailable" make the page offer the recorded examples.
  reason: "input" | "limit" | "unavailable" | "gone" | "used";
  error: string;
};

export type Streamed = { kind: "stream"; events: AsyncGenerator<RunEvent> };

export type Handled = Reject | Streamed;

const EXAMPLES_OFFER = "Here are three recorded examples.";

function reject(status: number, reason: Reject["reason"], error: string): Reject {
  return { kind: "reject", status, reason, error };
}

// The cache key ignores which model the visitor uses today, so a cached run
// carries the first visitor's. The replay is told this visitor's instead, and
// the verdict event is dropped: the page works the verdict out from the run,
// with this visitor's model, by the same rule the server used.
export function forThisVisitor(events: RunEvent[], current: string): RunEvent[] {
  return events
    .filter((event) => event.type !== "verdict")
    .map((event) => (event.type === "start" ? { ...event, current } : event));
}

async function* replayEvents(events: RunEvent[]): AsyncGenerator<RunEvent> {
  yield* events;
}

// A run is worth keeping for the next visitor only if it finished cleanly:
// a verdict, a judge that worked, and every model answering.
export function isCacheable(state: RunState): boolean {
  if (state.serverVerdict === null || state.error !== null || state.judgeFailed !== null) return false;
  return Object.values(state.cells).every((byCase) => Object.values(byCase).every((cell) => cell.status === "answered"));
}

export async function handleCheck(raw: unknown, visitor: string, services: Services): Promise<Handled> {
  const { store, deps } = services;
  const allowed = deps?.config.candidates.map((model) => model.id) ?? [];
  const parsed = parseCheckRequest(raw, allowed.length > 0 ? allowed : candidateIdsFrom(raw));
  if (!parsed.ok) return reject(400, "input", parsed.error);
  const request = parsed.value;

  // A repeat of the same ask is answered from the cache: no model, no count.
  const key = request.kind === "fresh" ? cacheKey(request.task, request.models) : null;
  if (request.kind === "fresh" && key !== null) {
    const cached = await readCache(store, key);
    if (cached !== null) {
      return { kind: "stream", events: replayEvents(forThisVisitor(asRecordedEvents([...cached.events, ...cached.extra], "cached"), request.current)) };
    }
  }

  if (deps === null) return reject(503, "unavailable", `Live runs are not switched on here. ${EXAMPLES_OFFER}`);
  if (store === null) return reject(503, "unavailable", `Live runs are paused while the limits cannot be checked. ${EXAMPLES_OFFER}`);

  let job: { task: string; models: string[]; current: string; plan?: TaskPlan };
  if (request.kind === "rerun") {
    const ticket = await loadTicket(store, request.ticket);
    if (ticket === null) return reject(410, "gone", "This run can no longer be repeated. Start a new check.");
    const testCases = ticket.plan.testCases.map((testCase, index) => ({
      id: testCase.id,
      input: request.testCases[index],
      edited: request.testCases[index] !== testCase.input || undefined,
    }));
    job = { task: ticket.task, models: ticket.models, current: ticket.current, plan: { ...ticket.plan, testCases } };
  } else {
    job = { task: request.task, models: request.models, current: request.current };
  }

  const taken = await consumeCheck(store, visitor, services.now());
  if (!taken.ok) {
    if (taken.reason === "visitor") return reject(429, "limit", `Your free checks for today are used up. ${EXAMPLES_OFFER}`);
    if (taken.reason === "site") return reject(429, "limit", `Today's free runs are used up. ${EXAMPLES_OFFER}`);
    return reject(503, "unavailable", `Live runs are paused while the limits cannot be checked. ${EXAMPLES_OFFER}`);
  }

  return { kind: "stream", events: liveCheck(services, deps, store, job, key) };
}

// Without a configured list (no key) the request is judged against the ids it
// names, so the cache can still answer; a model that is not offered cannot
// have been cached.
function candidateIdsFrom(raw: unknown): string[] {
  const models = typeof raw === "object" && raw !== null ? (raw as { models?: unknown }).models : undefined;
  return Array.isArray(models) ? models.filter((id): id is string => typeof id === "string") : [];
}

async function* liveCheck(
  services: Services,
  deps: Deps,
  store: Store,
  job: { task: string; models: string[]; current: string; plan?: TaskPlan },
  key: string | null,
): AsyncGenerator<RunEvent> {
  let state = initialState();
  const seen: RunEvent[] = [];
  for await (const event of runCheck(deps, job, services.newRunId())) {
    if (event.type === "done" && state.plan !== null && state.error === null) {
      // The ticket goes out before the end of the stream, so the page can
      // ask for the follow-ups the moment the verdict lands.
      const id = newTicketId();
      try {
        await saveTicket(store, id, { task: job.task, plan: state.plan, models: job.models, current: job.current, cacheKey: key });
        yield { type: "ticket", id };
      } catch {
        // No ticket: the run is complete, only the follow-ups are unavailable.
      }
    }
    state = reduce(state, event);
    seen.push(event);
    yield event;
  }
  if (key !== null && isCacheable(state)) await writeCache(store, key, { events: seen, extra: [] });
}

export async function handleFollowup(raw: unknown, services: Services): Promise<Handled> {
  const { store, deps } = services;
  const parsed = parseFollowupRequest(raw);
  if (!parsed.ok) return reject(400, "input", parsed.error);
  const { ticket: ticketId, kind, model } = parsed.value;
  if (deps === null || store === null) return reject(503, "unavailable", "Live runs are paused.");

  const ticket = await loadTicket(store, ticketId);
  if (ticket === null) return reject(410, "gone", "This run can no longer be extended. Start a new check.");
  if (!ticket.models.includes(model)) return reject(400, "input", "That model was not part of this run.");

  let shaped: string | null = null;
  if (kind === "variant") {
    shaped = await loadShapedPrompt(store, ticketId);
    if (shaped === null) return reject(409, "used", "There is no shaped prompt to test yet.");
  }
  if (!(await claimFollowup(store, ticketId, kind))) return reject(409, "used", "That has already been run for this check.");

  async function* stream(): AsyncGenerator<RunEvent> {
    const collected: RunEvent[] = [];
    const run =
      kind === "words"
        ? runPromptTest(deps as Deps, { kind: "words", template: wordsTemplate(ticket!.task), plan: ticket!.plan, model, models: ticket!.models })
        : kind === "shape"
          ? runShape(deps as Deps, { plan: ticket!.plan, model })
          : runPromptTest(deps as Deps, { kind: "variant", template: shaped as string, plan: ticket!.plan, model, models: ticket!.models });
    for await (const event of run) {
      if (event.type === "shape") await saveShapedPrompt(store as Store, ticketId, event.prompt);
      collected.push(event);
      yield event;
    }
    // Your words and the shaped prompt join the cached run. Testing the shaped
    // prompt stays live only.
    if (ticket!.cacheKey !== null && kind !== "variant" && !collected.some((event) => event.type === "followup-failed")) {
      await addToCache(store, ticket!.cacheKey, collected);
    }
  }
  return { kind: "stream", events: stream() };
}

export async function handleStatus(visitor: string, services: Services): Promise<Limits & { keyed: boolean }> {
  const limits = await peekLimits(services.store, visitor, services.now());
  const keyed = services.deps !== null;
  return { ...limits, live: limits.live && keyed, keyed };
}

