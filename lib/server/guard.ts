// What stands between a visitor and the model account: daily counts for the
// site and for each visitor, the cache of finished runs, and the tickets that
// let a finished run be extended and repeated. All of it goes through a Store,
// so a test can use memory.
//
// Two rules decide the failure modes. A store that cannot be reached means no
// live run (the page offers the recorded examples). A visitor is known only
// by a keyed hash of their address, never by the address.

import { createHash, createHmac, randomBytes } from "node:crypto";
import type { RunEvent } from "../events.ts";
import { LIMITS } from "../limits.ts";
import type { JudgeCase } from "../judging.ts";
import type { TaskPlan } from "../run-types.ts";
import type { FollowupKind } from "../request.ts";
import type { Store } from "./store.ts";

const DAY_SECONDS = 86_400;

export function dayKey(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

export function nextResetIso(nowMs: number): string {
  const next = new Date(`${dayKey(nowMs)}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString();
}

export function visitorId(address: string, secret: string): string {
  return createHmac("sha256", secret).update(address).digest("hex").slice(0, 24);
}

export type Limits = { live: boolean; visitorLeft: number; siteLeft: number; resetsAt: string };

export type Consume =
  | { ok: true; visitorLeft: number; siteLeft: number }
  | { ok: false; reason: "visitor" | "site" | "unavailable" };

// Where a day's counts live. The scope is the environment the run happened in.
// A preview and the live site share one store, so without it a check run on a
// preview came off the live site's allowance for that day.
export function siteLimitKey(scope: string, day: string): string {
  return `limit:${scope}:site:${day}`;
}

export function visitorLimitKey(scope: string, day: string, visitor: string): string {
  return `limit:${scope}:v:${day}:${visitor}`;
}

// Takes one check from the visitor's allowance and the site's. The visitor's
// count goes first, so a visitor who is out does not use up the site's.
export async function consumeCheck(store: Store | null, scope: string, visitor: string, nowMs: number): Promise<Consume> {
  if (store === null) return { ok: false, reason: "unavailable" };
  const day = dayKey(nowMs);
  try {
    const visitorCount = await store.incr(visitorLimitKey(scope, day, visitor), DAY_SECONDS);
    if (visitorCount > LIMITS.dailyChecksVisitor) return { ok: false, reason: "visitor" };
    const siteCount = await store.incr(siteLimitKey(scope, day), DAY_SECONDS);
    if (siteCount > LIMITS.dailyChecksSite) return { ok: false, reason: "site" };
    return { ok: true, visitorLeft: LIMITS.dailyChecksVisitor - visitorCount, siteLeft: LIMITS.dailyChecksSite - siteCount };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

// What is left today, without taking anything.
export async function peekLimits(store: Store | null, scope: string, visitor: string, nowMs: number): Promise<Limits> {
  const resetsAt = nextResetIso(nowMs);
  if (store === null) return { live: false, visitorLeft: 0, siteLeft: 0, resetsAt };
  const day = dayKey(nowMs);
  try {
    const visitorCount = Number((await store.get(visitorLimitKey(scope, day, visitor))) ?? 0);
    const siteCount = Number((await store.get(siteLimitKey(scope, day))) ?? 0);
    const visitorLeft = Math.max(0, LIMITS.dailyChecksVisitor - visitorCount);
    const siteLeft = Math.max(0, LIMITS.dailyChecksSite - siteCount);
    return { live: visitorLeft > 0 && siteLeft > 0, visitorLeft, siteLeft, resetsAt };
  } catch {
    return { live: false, visitorLeft: 0, siteLeft: 0, resetsAt };
  }
}

// The cache key is the task and the chosen models, nothing else. Whitespace
// runs are squashed and the models sorted, so the same ask is the same key.
// The version changes when the prompts or the verdict rule do. The scope is
// the environment, for the same reason the daily counts carry it: one store
// is shared, and a run finished on a preview must never be served as the live
// site's own finished run.
const CACHE_VERSION = "v1";

export function cacheKey(scope: string, task: string, models: string[]): string {
  const normal = JSON.stringify({ task: task.trim().replace(/\s+/g, " "), models: [...models].sort() });
  return `cache:${scope}:${CACHE_VERSION}:${createHash("sha256").update(normal).digest("hex")}`;
}

// A ticket lets a finished run be extended and repeated, so it belongs to the
// environment that ran it, exactly like the cache entry it points at.
export function ticketKey(scope: string, id: string, part?: string): string {
  return `ticket:${scope}:${id}${part === undefined ? "" : `:${part}`}`;
}

export type CacheEntry = { events: RunEvent[]; extra: RunEvent[] };

export async function readCache(store: Store | null, key: string): Promise<CacheEntry | null> {
  if (store === null) return null;
  try {
    const raw = await store.get(key);
    return raw === null ? null : (JSON.parse(raw) as CacheEntry);
  } catch {
    return null;
  }
}

export async function writeCache(store: Store | null, key: string, entry: CacheEntry): Promise<void> {
  if (store === null) return;
  try {
    await store.set(key, JSON.stringify(entry), LIMITS.cacheSeconds);
  } catch {
    // A cache that cannot be written costs the next visitor a run, nothing more.
  }
}

// A follow-up that finished is added to the cached run, so the next visitor
// sees "your words" and the shaped prompt as well.
export async function addToCache(store: Store | null, key: string, events: RunEvent[]): Promise<void> {
  if (store === null) return;
  const entry = await readCache(store, key);
  if (entry === null) return;
  await writeCache(store, key, { events: entry.events, extra: [...entry.extra, ...events] });
}

export type Ticket = {
  task: string;
  plan: TaskPlan;
  models: string[];
  current: string;
  // The cache entry this run was stored under, or null for a repeat.
  cacheKey: string | null;
  // The answers, kept only when no judge answered, so they can be marked
  // again later without calling a single model a second time.
  unjudged?: JudgeCase[];
};

export function newTicketId(): string {
  return randomBytes(16).toString("hex");
}

export async function saveTicket(store: Store, scope: string, id: string, ticket: Ticket): Promise<void> {
  await store.set(ticketKey(scope, id), JSON.stringify(ticket), LIMITS.ticketSeconds);
}

export async function loadTicket(store: Store | null, scope: string, id: string): Promise<Ticket | null> {
  if (store === null) return null;
  try {
    const raw = await store.get(ticketKey(scope, id));
    return raw === null ? null : (JSON.parse(raw) as Ticket);
  } catch {
    return null;
  }
}

// Each follow-up of a ticket can be started once. false means it already was.
export async function claimFollowup(store: Store, scope: string, id: string, kind: FollowupKind): Promise<boolean> {
  return store.setIfAbsent(ticketKey(scope, id, kind), "1", LIMITS.ticketSeconds);
}

export async function saveShapedPrompt(store: Store, scope: string, id: string, prompt: string): Promise<void> {
  await store.set(ticketKey(scope, id, "shaped"), prompt, LIMITS.ticketSeconds);
}

export async function loadShapedPrompt(store: Store, scope: string, id: string): Promise<string | null> {
  return store.get(ticketKey(scope, id, "shaped"));
}
