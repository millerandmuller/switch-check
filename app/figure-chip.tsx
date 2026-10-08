// One figure as a rounded chip: the figure large, its state word and unit
// small beneath it, always together. A figure that was not measured says so in
// the large line and gives its reason beneath, so a bare number never stands
// alone. Used on the rating screen and on the result screen.
export function FigureChip({ figure, note }: { figure: string; note: string }) {
  return (
    <div className="flex min-w-0 flex-col rounded-xl bg-chip px-2 py-px leading-tight">
      <b className="whitespace-nowrap font-display text-[1.05rem] font-semibold tabular-nums">{figure}</b>
      <span className="text-[11px] text-muted">{note}</span>
    </div>
  );
}
