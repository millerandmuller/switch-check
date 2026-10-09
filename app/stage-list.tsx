import type { RunState, StageId } from "@/lib/events";
import { STAGES } from "@/lib/events";
import { formatMs } from "@/lib/format";
import { Elapsed } from "./elapsed";

// What the page is doing, in order, each stage with its own timer. A stage
// that is running always has a name beside its timer: no bare spinner.
function lineFor(stage: StageId, state: RunState): { running: string; done: string } {
  const count = state.models.length;
  switch (stage) {
    case "plan":
      return { running: "Writing the prompt and three test cases", done: "Wrote the prompt and three test cases" };
    case "grid":
      return {
        running: `Asking ${count} models, three test cases each`,
        done: `Got the answers from ${count} models`,
      };
    case "judge":
      return { running: "Judging, with the model names hidden", done: `Judged by ${state.judge?.name ?? "the judge"}, names hidden` };
    case "verdict":
      return { running: "Working out the verdict", done: "Worked out the verdict" };
  }
}

export function StageList({ state, started }: { state: RunState; started: Partial<Record<StageId, number>> }) {
  return (
    <ol className="flex flex-col gap-1.5" aria-label="Progress">
      {STAGES.map((stage) => {
        const { status, ms } = state.stages[stage];
        const text = lineFor(stage, state);
        return (
          <li key={stage} className="flex items-baseline gap-3 text-[15px]">
            <span aria-hidden className="w-4 text-center font-semibold text-accent">
              {status === "done" ? "✓" : status === "running" ? "•" : "○"}
            </span>
            <span className={status === "waiting" ? "text-muted" : "font-medium"}>
              {status === "done" ? text.done : text.running}
              {status === "waiting" && <span className="sr-only"> (waiting)</span>}
            </span>
            {status === "running" && (
              <span className="text-[13px] text-muted">
                <Elapsed since={started[stage] ?? null} />
              </span>
            )}
            {status === "done" && ms !== null && <span className="text-[13px] text-muted tabular-nums">{formatMs(ms)}</span>}
          </li>
        );
      })}
    </ol>
  );
}
