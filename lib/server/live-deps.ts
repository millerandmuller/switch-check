// The real dependencies: the shipped config files, the real clock and the
// real network. The only file besides the routes that knows about the
// environment key, and it takes the key as an argument rather than reading it.

import candidates from "../../config/candidates.json" with { type: "json" };
import prices from "../../config/model-prices.json" with { type: "json" };
import type { ModelConfig, ModelPrices } from "../models.ts";
import type { Deps } from "./deps.ts";
import { complete } from "./openrouter.ts";

export const modelConfig = candidates as unknown as ModelConfig;
export const modelPrices = prices as unknown as ModelPrices;

export function liveDeps(apiKey: string): Deps {
  const transport = { fetchImpl: fetch, now: Date.now, apiKey };
  return {
    complete: (request) => complete(transport, request),
    now: Date.now,
    random: Math.random,
    config: modelConfig,
    prices: modelPrices,
  };
}
