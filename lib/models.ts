// What the page and the server know about the models, read from
// config/candidates.json and config/model-prices.json. The files are passed in
// (not imported here) so the tests can use the shipped files or small fakes.

import type { ModelPrice } from "./cost-speed.ts";

export type ModelInfo = { id: string; name: string; provider: string };

export type ProviderColours = Record<string, { background: string; text: string }>;

export type ModelConfig = {
  candidates: ModelInfo[];
  default_models: string[];
  default_current: string;
  writer: ModelInfo;
  judges: ModelInfo[];
  providers: ProviderColours;
};

export type ModelPrices = {
  source_url: string;
  checked_on: string;
  models: Record<string, ModelPrice>;
};

// The name to show for an id. An id outside the config reads as itself, so a
// stray id is visible rather than blank.
export function modelName(config: ModelConfig, id: string): string {
  const all = [...config.candidates, config.writer, ...config.judges];
  return all.find((model) => model.id === id)?.name ?? id;
}

export function providerOf(config: ModelConfig, id: string): string {
  const all = [...config.candidates, config.writer, ...config.judges];
  return all.find((model) => model.id === id)?.provider ?? "";
}

// Problems with the two config files, one sentence each. Empty means they
// agree: at most six candidates, defaults among them, and a dated price for
// every model the app can call.
export function configProblems(config: ModelConfig, prices: ModelPrices): string[] {
  const problems: string[] = [];
  const ids = config.candidates.map((model) => model.id);
  if (config.candidates.length > 6) problems.push("More than six candidate models.");
  if (new Set(ids).size !== ids.length) problems.push("A candidate id is listed twice.");
  for (const id of config.default_models) {
    if (!ids.includes(id)) problems.push(`Default model ${id} is not a candidate.`);
  }
  if (!config.default_models.includes(config.default_current)) {
    problems.push("The default current model is not among the default models.");
  }
  const callable = [...config.candidates, config.writer, ...config.judges];
  for (const model of callable) {
    const price = prices.models[model.id];
    if (price === undefined || !price.listed) {
      problems.push(`${model.id} has no listed price in model-prices.json.`);
    } else if (price.input_per_million === null || price.output_per_million === null) {
      problems.push(`${model.id} has a listing but no price.`);
    }
    if (config.providers[model.provider] === undefined) {
      problems.push(`No colour for provider ${model.provider}.`);
    }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(prices.checked_on)) problems.push("The price check has no date.");
  return problems;
}
