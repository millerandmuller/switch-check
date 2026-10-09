import { formatUsd } from "@/lib/cost-speed";
import type { ModelConfig, ModelPrices } from "@/lib/models";
import { LIMITS } from "@/lib/limits";
import { tileOrder, type Selection } from "@/lib/selection";
import { ProviderMark } from "./provider-mark";

// The models to compare, as tiles grouped by provider. Each shows the
// provider mark, the model's plain name and its price in small type. Ticking
// is a real checkbox, so the keyboard and screen readers get it for free.
export function ModelTiles({
  config,
  prices,
  selection,
  disabled,
  onToggle,
}: {
  config: ModelConfig;
  prices: ModelPrices;
  selection: Selection;
  disabled: boolean;
  onToggle: (id: string) => void;
}) {
  const ordered = tileOrder(config.candidates, (id) => {
    const price = prices.models[id];
    return price?.listed ? (price.output_per_million ?? Infinity) : Infinity;
  });
  const full = selection.models.length >= LIMITS.maxModels;
  return (
    <fieldset className="mt-5" disabled={disabled}>
      <legend className="text-[13.5px] font-medium text-muted">
        Models to compare ({selection.models.length} of up to {LIMITS.maxModels})
      </legend>
      <ul className="mt-2 grid gap-2.5 sm:grid-cols-2 wide:grid-cols-3">
        {ordered.map((model) => {
          const ticked = selection.models.includes(model.id);
          const price = prices.models[model.id];
          const isCurrent = model.id === selection.current;
          const blocked = (!ticked && full) || (ticked && isCurrent);
          return (
            <li key={model.id}>
              <label
                className={`card flex h-full cursor-pointer flex-col gap-1 px-4 py-3 ring-2 ${ticked ? "ring-accent" : "ring-transparent"} ${blocked && !ticked ? "opacity-60" : ""}`}
              >
                <span className="flex items-center justify-between gap-2">
                  <ProviderMark provider={model.provider} colours={config.providers} />
                  <input
                    type="checkbox"
                    checked={ticked}
                    onChange={() => onToggle(model.id)}
                    aria-describedby={`price-${model.id}`}
                    className="h-4 w-4 accent-[var(--color-accent)]"
                  />
                </span>
                <span className="font-display text-[1.12rem] font-semibold leading-tight">{model.name}</span>
                <span id={`price-${model.id}`} className="text-[12px] leading-snug text-muted">
                  {price?.listed && price.input_per_million !== null && price.output_per_million !== null
                    ? `${formatUsd(price.input_per_million)} in, ${formatUsd(price.output_per_million)} out per 1M tokens, published price`
                    : "No published price"}
                  {isCurrent ? " · the one you use today" : ""}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[12.5px] text-muted">
        Prices are OpenRouter&apos;s published prices, checked {prices.checked_on}.
      </p>
    </fieldset>
  );
}
