// Which models are ticked, and which one the person uses today. Pure rules for
// the tiles: two to four models, and the model used today is always one of them.

import { LIMITS } from "./limits.ts";

export type Selection = { models: string[]; current: string };

// Makes `current` part of the list. If that pushes the list over the maximum,
// the last model that is not `current` is dropped.
export function withCurrent(models: string[], current: string): string[] {
  const list = models.includes(current) ? [...models] : [...models, current];
  while (list.length > LIMITS.maxModels) {
    const at = list.findLastIndex((id) => id !== current);
    list.splice(at, 1);
  }
  return list;
}

export function setCurrent(selection: Selection, current: string): Selection {
  return { models: withCurrent(selection.models, current), current };
}

export type ToggleResult = { selection: Selection; refused: "current" | "minimum" | "maximum" | null };

// Ticks or unticks one model. The model used today cannot be unticked, there
// are never fewer than two, and never more than four.
export function toggleModel(selection: Selection, id: string): ToggleResult {
  const ticked = selection.models.includes(id);
  if (ticked) {
    if (id === selection.current) return { selection, refused: "current" };
    if (selection.models.length <= LIMITS.minModels) return { selection, refused: "minimum" };
    return { selection: { ...selection, models: selection.models.filter((m) => m !== id) }, refused: null };
  }
  if (selection.models.length >= LIMITS.maxModels) return { selection, refused: "maximum" };
  return { selection: { ...selection, models: [...selection.models, id] }, refused: null };
}

// Tile order for display: grouped by provider in the order providers first
// appear in the config, then cheaper first inside a group.
export function tileOrder<T extends { id: string; provider: string }>(
  models: T[],
  outputPrice: (id: string) => number,
): T[] {
  const providerRank = new Map<string, number>();
  for (const model of models) if (!providerRank.has(model.provider)) providerRank.set(model.provider, providerRank.size);
  return [...models].sort(
    (a, b) => (providerRank.get(a.provider) as number) - (providerRank.get(b.provider) as number) || outputPrice(a.id) - outputPrice(b.id),
  );
}
