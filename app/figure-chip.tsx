import { stateCaption, type Figure } from "@/lib/figure";

// One figure as a rounded chip: the figure large, its state word and unit
// small beneath it, always together. The chip takes a Figure, not a string, so
// a number cannot be drawn without its state: stateCaption throws on anything
// that is not one. `text` is how the value reads; `unit` is what it counts.
export function FigureChip({ fig, text, unit }: { fig: Figure<unknown>; text: string; unit?: string }) {
  const caption = stateCaption(fig);
  return (
    <div className="flex min-w-0 flex-col rounded-xl bg-chip px-2 py-px leading-tight">
      <b className="whitespace-nowrap font-display text-[1.05rem] font-semibold tabular-nums">{text}</b>
      <span className="text-[11px] text-muted">{unit ? `${unit} · ${caption}` : caption}</span>
    </div>
  );
}
