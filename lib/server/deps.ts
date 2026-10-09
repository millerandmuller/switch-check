// What the server-side steps need from outside, passed in so a test can use a
// fake model and a fixed clock. Nothing here reads the environment.

import { LIMITS } from "../limits.ts";
import type { ModelConfig, ModelPrices } from "../models.ts";
import type { CompleteRequest, Completion } from "./openrouter.ts";

export type Deps = {
  complete: (request: CompleteRequest) => Promise<Completion>;
  now: () => number;
  random: () => number;
  config: ModelConfig;
  prices: ModelPrices;
};

const MIN_TIMEOUT_MS = 1_000;

// How long one call may take: the per-call limit, or what is left of the
// route's allowance, whichever is shorter.
export function timeoutFor(deps: Pick<Deps, "now">, deadline: number): number {
  return Math.max(MIN_TIMEOUT_MS, Math.min(LIMITS.callTimeoutMs, Math.floor(deadline - deps.now())));
}

// The route's total allowance, less a margin to send the last events.
export function routeBudgetMs(): number {
  return LIMITS.routeMaxSeconds * 1000 - 5_000;
}
