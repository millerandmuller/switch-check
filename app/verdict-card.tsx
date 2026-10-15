import type { RunState } from "@/lib/events";
import { sourceNote } from "@/lib/format";
import { figure } from "@/lib/figure";
import type { VerdictResult } from "@/lib/verdict";
import { secondaryButtonClass } from "./ui";
import { FigureChip } from "./figure-chip";

const DECISION_WORDS = { switch: "Switch", stay: "Stay", "test-more": "Test more" } as const;

// Where the run came from, in words a reader cannot miss. A recording is never
// presented as a run that just happened.
function SourceLine({ state, recordedTask, nowMs }: { state: RunState; recordedTask: string | null; nowMs: number }) {
  const note = sourceNote(state.source, state.at, recordedTask, nowMs);
  if (note === null) return null;
  return (
    <p className="rounded-2xl bg-chip px-4 py-2.5 text-[14px]" role="note">
      <b>{note.lead}</b> {note.rest}
    </p>
  );
}

export function VerdictCard({
  state,
  result,
  changeNote,
  recordedTask,
  onCopy,
  copied,
  names,
  nowMs,
  verdictRef,
}: {
  state: RunState;
  result: VerdictResult | null;
  changeNote: string | null;
  recordedTask: string | null;
  onCopy: () => void;
  copied: boolean;
  names: Record<string, string>;
  nowMs: number;
  verdictRef: React.RefObject<HTMLElement | null>;
}) {
  if (result === null) return null;
  return (
    <section ref={verdictRef} id="verdict" tabIndex={-1} aria-labelledby="verdict-heading" className="card flex flex-col gap-3 p-5 ring-1 ring-accent/40 focus:outline-none focus:shadow-none">
      <SourceLine state={state} recordedTask={recordedTask} nowMs={nowMs} />
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
          <div>
            <button type="button" onClick={onCopy} className={secondaryButtonClass}>
              {copied ? "Copied" : "Copy this verdict"}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
