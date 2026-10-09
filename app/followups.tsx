import type { FollowupState, RunState } from "@/lib/events";
import { figure } from "@/lib/figure";
import { modelName, type ModelConfig } from "@/lib/models";
import type { ModelSummary } from "@/lib/verdict";
import { Elapsed } from "./elapsed";
import { FigureChip } from "./figure-chip";
import { primaryButtonClass, secondaryButtonClass } from "./ui";

// How many checks a follow-up passed, over how many it was asked, counting
// only the cases that were answered. null while nothing is judged.
export function tally(followup: FollowupState, checkCount: number): { passed: number; total: number; answered: number } | null {
  const answered = Object.values(followup.cells).filter((cell) => cell.status === "answered").length;
  const results = Object.values(followup.judged).flat();
  if (results.length === 0 || results.some((result) => result.pass === null)) return null;
  return { passed: results.filter((result) => result.pass === true).length, total: answered * checkCount, answered };
}

function Counts({ label, passed, total }: { label: string; passed: number; total: number }) {
  return <FigureChip fig={figure(`${passed} of ${total}`, "judged")} text={`${passed} of ${total}`} unit={label} />;
}

// Your words as typed, on the recommended model, against the written prompt on
// the same model with the same checks. If the written prompt does not do
// better, it says so in the same place.
export function WordsCompare({
  state,
  summaries,
  config,
  startedAt,
  waitingForVerdict,
}: {
  state: RunState;
  summaries: ModelSummary[];
  config: ModelConfig;
  startedAt: number | null;
  waitingForVerdict: boolean;
}) {
  const words = state.words;
  if (state.plan === null) return null;
  if (words.model === null) {
    if (state.source !== "live") return null;
    return (
      <section className="card p-5" aria-labelledby="words-heading">
        <h2 id="words-heading" className="font-display text-[1.25rem] font-semibold">
          Your words as typed against the written prompt
        </h2>
        <p className="mt-1 text-[14px] text-muted">{waitingForVerdict ? "Starts when the verdict is ready." : "Not started."}</p>
      </section>
    );
  }
  const name = modelName(config, words.model);
  const mine = tally(words, state.plan.checks.length);
  const written = summaries.find((summary) => summary.id === words.model);
  return (
    <section className="card p-5" aria-labelledby="words-heading">
      <h2 id="words-heading" className="font-display text-[1.25rem] font-semibold">
        Your words as typed against the written prompt
      </h2>
      <p className="text-[12.5px] text-muted">
        Your task exactly as you typed it, with each test case under it, run on {name} and marked with the same checks.
      </p>
      {words.running && (
        <p className="mt-2 flex items-baseline gap-2 text-[15px]" role="status">
          <span aria-hidden className="text-accent">
            •
          </span>
          Running your words as typed on {name}, three calls, then judging
          <span className="text-muted">
            <Elapsed since={startedAt} />
          </span>
        </p>
      )}
      {words.failed !== null && <p className="mt-2 text-[15px]">Your words as typed could not be tested on {name}: {words.failed}</p>}
      {mine !== null && written?.passed != null && (
        <>
          <p className="mt-2 text-[15.5px] font-medium" data-testid="words-sentence">
            Your words as typed: {mine.passed} of {mine.total}. The written prompt: {written.passed} of {written.total}.
            {mine.answered < state.plan.testCases.length ? ` Your words were answered on ${mine.answered} of ${state.plan.testCases.length} test cases.` : ""}
            {written.passed <= mine.passed && mine.answered === written.answered ? " The written prompt did not do better here." : ""}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Counts label="your words as typed" passed={mine.passed} total={mine.total} />
            <Counts label="the written prompt" passed={written.passed} total={written.total} />
          </div>
        </>
      )}
    </section>
  );
}

// The prompt shaped for the recommended model, not tested in the main run.
// "Test it" runs it on that model alone and shows whether the checks moved.
export function ShapedPrompt({
  state,
  summaries,
  config,
  canTest,
  testStartedAt,
  onTest,
  onCopy,
  copied,
}: {
  state: RunState;
  summaries: ModelSummary[];
  config: ModelConfig;
  canTest: boolean;
  testStartedAt: number | null;
  onTest: () => void;
  onCopy: () => void;
  copied: boolean;
}) {
  if (state.plan === null) return null;
  if (state.shape === null && state.shapeFailed === null) return null;
  const variant = state.variant;
  const name = state.shape ? modelName(config, state.shape.model) : "";
  const tested = tally(variant, state.plan.checks.length);
  const before = state.shape ? summaries.find((summary) => summary.id === state.shape?.model) : undefined;
  return (
    <section className="card p-5" aria-labelledby="shape-heading">
      <h2 id="shape-heading" className="font-display text-[1.25rem] font-semibold">
        {state.shape ? `A prompt shaped for ${name}` : "A prompt shaped for the recommended model"}
      </h2>
      {state.shapeFailed !== null && <p className="mt-1 text-[14.5px]">A shaped prompt could not be written: {state.shapeFailed}</p>}
      {state.shape && (
        <>
          <p className="text-[12.5px] text-muted">
            Generated. {variant.model === null ? <><b>Not tested in this check:</b> the comparison above used one prompt for every model.</> : <>The comparison above used one prompt for every model. This one was tested separately, on {name} only.</>}
          </p>
          <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-xl bg-chip px-3.5 py-2.5 font-mono text-[12.5px] leading-[1.6] [overflow-wrap:anywhere]" tabIndex={0}>
            {state.shape.prompt}
          </pre>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button type="button" onClick={onCopy} className={secondaryButtonClass}>
              {copied ? "Copied" : "Copy this prompt"}
            </button>
            {variant.model === null && (
              <button type="button" onClick={onTest} disabled={!canTest} className={`${primaryButtonClass} !px-5 !py-2 text-[14px] disabled:cursor-not-allowed disabled:opacity-60`}>
                Test it
              </button>
            )}
            {variant.model === null && !canTest && (
              <span className="text-[12.5px] text-muted">
                {state.source === "live" ? "Available once the run has finished." : "A recorded run cannot start a live test. Run a check to test it."}
              </span>
            )}
          </div>
          {variant.running && (
            <p className="mt-2 flex items-baseline gap-2 text-[15px]" role="status">
              <span aria-hidden className="text-accent">
                •
              </span>
              Running the shaped prompt on {name}, three calls, then judging
              <span className="text-muted">
                <Elapsed since={testStartedAt} />
              </span>
            </p>
          )}
          {variant.failed !== null && <p className="mt-2 text-[15px]">The shaped prompt could not be tested: {variant.failed}</p>}
          {tested !== null && before?.passed != null && (
            <>
              <p className="mt-2 text-[15.5px] font-medium" data-testid="variant-sentence">
                With the shaped prompt: {tested.passed} of {tested.total}. With the shared prompt: {before.passed} of {before.total}.{" "}
                {tested.passed === before.passed ? "The checks did not move." : tested.passed > before.passed ? "The checks moved up." : "The checks moved down."} One run of three test cases.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Counts label="the shaped prompt" passed={tested.passed} total={tested.total} />
                <Counts label="the shared prompt" passed={before.passed} total={before.total} />
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}
