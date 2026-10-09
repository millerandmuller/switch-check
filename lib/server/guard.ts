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

// Takes one check from the visitor's allowance and the site's. The visitor's
// count goes first, so a visitor who is out does not use up the site's.
export async function consumeCheck(store: Store | null, visitor: string, nowMs: number): Promise<Consume> {
  if (store === null) return { ok: false, reason: "unavailable" };
  const day = dayKey(nowMs);
  try {
    const visitorCount = await store.incr(`limit:v:${day}:${visitor}`, DAY_SECONDS);
    if (visitorCount > LIMITS.dailyChecksVisitor) return { ok: false, reason: "visitor" };
    const siteCount = await store.incr(`limit:site:${day}`, DAY_SECONDS);
    if (siteCount > LIMITS.dailyChecksSite) return { ok: false, reason: "site" };
    return { ok: true, visitorLeft: LIMITS.dailyChecksVisitor - visitorCount, siteLeft: LIMITS.dailyChecksSite - siteCount };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

// What is left today, without taking anything.
export async function peekLimits(store: Store | null, visitor: string, nowMs: number): Promise<Limits> {
  const resetsAt = nextResetIso(nowMs);
  if (store === null) return { live: false, visitorLeft: 0, siteLeft: 0, resetsAt };
  const day = dayKey(nowMs);
  try {
    const visitorCount = Number((await store.get(`limit:v:${day}:${visitor}`)) ?? 0);
    const siteCount = Number((await store.get(`limit:site:${day}`)) ?? 0);
    const visitorLeft = Math.max(0, LIMITS.dailyChecksVisitor - visitorCount);
    const siteLeft = Math.max(0, LIMITS.dailyChecksSite - siteCount);
    return { live: visitorLeft > 0 && siteLeft > 0, visitorLeft, siteLeft, resetsAt };
  } catch {
    return { live: false, visitorLeft: 0, siteLeft: 0, resetsAt };
  }
}

// The cache key is the task and the chosen models, nothing else. Whitespace
// runs are squashed and the models sorted, so the same ask is the same key.
// The version changes when the prompts or the verdict rule do.
const CACHE_VERSION = "v1";

export function cacheKey(task: string, models: string[]): string {
  const normal = JSON.stringify({ task: task.trim().replace(/\s+/g, " "), models: [...models].sort() });
  return `cache:${CACHE_VERSION}:${createHash("sha256").update(normal).digest("hex")}`;
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
};

export function newTicketId(): string {
  return randomBytes(16).toString("hex");
}

export async function saveTicket(store: Store, id: string, ticket: Ticket): Promise<void> {
  await store.set(`ticket:${id}`, JSON.stringify(ticket), LIMITS.ticketSeconds);
}

export async function loadTicket(store: Store | null, id: string): Promise<Ticket | null> {
  if (store === null) return null;
  try {
    const raw = await store.get(`ticket:${id}`);
    return raw === null ? null : (JSON.parse(raw) as Ticket);
  } catch {
    return null;
  }
}

// Each follow-up of a ticket can be started once. false means it already was.
export async function claimFollowup(store: Store, id: string, kind: FollowupKind): Promise<boolean> {
  return store.setIfAbsent(`ticket:${id}:${kind}`, "1", LIMITS.ticketSeconds);
}

export async function saveShapedPrompt(store: Store, id: string, prompt: string): Promise<void> {
  await store.set(`ticket:${id}:shaped`, prompt, LIMITS.ticketSeconds);
}

export async function loadShapedPrompt(store: Store, id: string): Promise<string | null> {
  return store.get(`ticket:${id}:shaped`);
}
