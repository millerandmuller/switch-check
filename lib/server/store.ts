// The small key-value store behind the limits, the cache and the tickets of a
// run. In production it is the Redis store attached to the Vercel project
// (Upstash, reached over its REST interface with plain fetch: no library).
// In development with no store attached it is memory. In production with no
// store it is nothing, and everything that spends money refuses to run.

export interface Store {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  // True when the key was absent and is now set.
  setIfAbsent(key: string, value: string, ttlSeconds: number): Promise<boolean>;
  // Adds one and returns the new count. The key expires ttlSeconds after the
  // first increment.
  incr(key: string, ttlSeconds: number): Promise<number>;
}

export function memoryStore(now: () => number = Date.now): Store {
  const entries = new Map<string, { value: string; expiresAt: number }>();
  const live = (key: string) => {
    const entry = entries.get(key);
    if (entry === undefined) return undefined;
    if (entry.expiresAt <= now()) {
      entries.delete(key);
      return undefined;
    }
    return entry;
  };
  return {
    async get(key) {
      return live(key)?.value ?? null;
    },
    async set(key, value, ttlSeconds) {
      entries.set(key, { value, expiresAt: now() + ttlSeconds * 1000 });
    },
    async setIfAbsent(key, value, ttlSeconds) {
      if (live(key) !== undefined) return false;
      entries.set(key, { value, expiresAt: now() + ttlSeconds * 1000 });
      return true;
    },
    async incr(key, ttlSeconds) {
      const existing = live(key);
      if (existing === undefined) {
        entries.set(key, { value: "1", expiresAt: now() + ttlSeconds * 1000 });
        return 1;
      }
      const next = Number(existing.value) + 1;
      entries.set(key, { value: String(next), expiresAt: existing.expiresAt });
      return next;
    },
  };
}

type Reply = { result?: unknown; error?: unknown };

export function restStore(
  url: string,
  token: string,
  fetchImpl: (url: string, init: RequestInit) => Promise<Response> = fetch,
): Store {
  async function post(path: string, body: unknown): Promise<unknown> {
    const response = await fetchImpl(`${url.replace(/\/$/, "")}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5_000),
    });
    // Neither the token nor the URL goes into an error message.
    if (!response.ok) throw new Error(`The store answered ${response.status}.`);
    return response.json();
  }
  async function command(args: (string | number)[]): Promise<unknown> {
    const reply = (await post("", args)) as Reply;
    if (reply.error !== undefined) throw new Error("The store refused a command.");
    return reply.result;
  }
  return {
    async get(key) {
      const result = await command(["GET", key]);
      return typeof result === "string" ? result : null;
    },
    async set(key, value, ttlSeconds) {
      await command(["SET", key, value, "EX", ttlSeconds]);
    },
    async setIfAbsent(key, value, ttlSeconds) {
      return (await command(["SET", key, value, "EX", ttlSeconds, "NX"])) === "OK";
    },
    async incr(key, ttlSeconds) {
      const replies = (await post("/pipeline", [
        ["INCR", key],
        ["EXPIRE", key, ttlSeconds, "NX"],
      ])) as Reply[];
      const count = replies?.[0]?.result;
      if (typeof count !== "number" || replies[0]?.error !== undefined) throw new Error("The store did not count.");
      return count;
    },
  };
}

let developmentStore: Store | undefined;

// null means no store: the caller must treat that as "do not spend".
export function storeFromEnv(env: Record<string, string | undefined>): Store | null {
  const url = env.KV_REST_API_URL;
  const token = env.KV_REST_API_TOKEN;
  if (url && token) return restStore(url, token);
  if (env.NODE_ENV !== "production") {
    developmentStore ??= memoryStore();
    return developmentStore;
  }
  return null;
}
