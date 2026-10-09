// Builds the real services for a route from the environment. The only place
// the model key is read. A missing key is not an error: it means only cached
// runs and recorded examples can be served.

import { liveDeps } from "./live-deps.ts";
import type { Services } from "./handlers.ts";
import { storeFromEnv } from "./store.ts";

export type Environment = Record<string, string | undefined>;

export function servicesFromEnv(env: Environment): Services {
  const key = env.OPENROUTER_API_KEY;
  return {
    store: storeFromEnv(env),
    deps: key ? liveDeps(key) : null,
    now: Date.now,
    newRunId: () => crypto.randomUUID(),
  };
}

// What keys the visitor hash. A separate value if one is set; otherwise the
// model key, which is already secret and never leaves the server.
export function limitSecret(env: Environment): string {
  return env.LIMIT_SALT || env.OPENROUTER_API_KEY || "development-only";
}
