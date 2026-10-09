import type { RunState } from "@/lib/events";
import { ageText, dateOnly } from "@/lib/format";
import { figure } from "@/lib/figure";
import type { VerdictResult } from "@/lib/verdict";
import { FigureChip } from "./figure-chip";

const DECISION_WORDS = { switch: "Switch", stay: "Stay", "test-more": "Test more" } as const;

// Where the run came from, in words a reader cannot miss. A recording is never
// presented as a run that just happened.
function SourceLine({ state, nowMs }: { state: RunState; nowMs: number }) {
  if (state.source === "recorded" && state.at !== null) {
    return (
      <p className="rounded-2xl bg-chip px-4 py-2.5 text-[14px]" role="note">
        <b>Recorded on {dateOnly(state.at)}.</b> Nothing on this page was run just now. Times read recorded, not measured.
      </p>
    );
  }
  if (state.source === "cached" && state.at !== null) {
    return (
      <p className="rounded-2xl bg-chip px-4 py-2.5 text-[14px]" role="note">
        <b>{ageText(state.at, nowMs) === "just now" ? "Replayed from earlier today" : `Recorded ${ageText(state.at, nowMs)}`}.</b> The same task on the same models was checked earlier today, so this is that run, shown again. Nothing was run just now.
      </p>
    );
  }
  return null;
}

export function VerdictCard({
  state,
  result,
  changeNote,
  names,
  nowMs,
  verdictRef,
}: {
  state: RunState;
  result: VerdictResult | null;
  changeNote: string | null;
  names: Record<string, string>;
  nowMs: number;
  verdictRef: React.RefObject<HTMLElement | null>;
}) {
  if (result === null) return null;
  return (
    <section ref={verdictRef} id="verdict" tabIndex={-1} aria-labelledby="verdict-heading" className="card flex flex-col gap-3 p-5 ring-1 ring-accent/40 focus:outline-none focus:shadow-none">
      <SourceLine state={state} nowMs={nowMs} />
      {result.waiting ? (
        <>
          <h2 id="verdict-heading" className="font-display text-[1.25rem] font-semibold">
            The verdict is waiting
          </h2>
          <p className="text-[15.5px]" role="status">
            {result.reason}
          </p>
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <h2 id="verdict-heading" className="text-[13.5px] font-semibold uppercase tracking-wide text-muted">
              Verdict
            </h2>
            <span className="rounded-full bg-accent px-3 py-0.5 text-[13px] font-semibold text-on-accent">{DECISION_WORDS[result.verdict.decision]}</span>
          </div>
          <p className="text-balance font-display text-[clamp(1.35rem,2.6vw,2rem)] font-semibold leading-snug tracking-[-0.01em]" data-testid="verdict-reason">
            {result.verdict.reason}
          </p>
          <p className="text-[14px] text-muted">{result.verdict.evidence}</p>
          {changeNote !== null && (
            <p className="rounded-2xl bg-chip px-4 py-2 text-[14px] font-semibold" role="status">
              {changeNote}
            </p>
          )}
          <div className="flex flex-wrap gap-2" aria-label="The figures behind this sentence">
            {result.verdict.figures.map((item) => (
              <FigureChip key={`${item.label}-${item.text}`} fig={figure(item.text, item.state, item.note)} text={item.text} unit={item.label} />
            ))}
          </div>
          {result.verdict.quote && (
            <p className="text-[14.5px] leading-snug">
              <b>Where they differed.</b> {names[result.verdict.quote.modelId] ?? result.verdict.quote.modelId} failed the check “
              {result.verdict.quote.checkQuestion}” on this line: “{result.verdict.quote.line}”
            </p>
          )}
        </>
      )}
    </section>
  );
}
