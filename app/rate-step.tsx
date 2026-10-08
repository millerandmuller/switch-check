"use client";

import { useEffect, useState } from "react";
import {
  MODEL_SIDES,
  cellState,
  modelFor,
  rowResult,
  summaryLine,
  type ModelSide,
  type PastedOutputs,
  type Rating,
  type Reviews,
  type RowResult,
} from "@/lib/comparison";
import {
  costPer1000Runs,
  costSpeedLine,
  formatSeconds,
  formatUsd,
  type ModelPrices,
} from "@/lib/cost-speed";
import { sampleRunColumn, type SampleOkCell, type SampleResults } from "@/lib/sample-results";
import {
  INPUT_MAX_CHARS,
  preview,
  sampleLabel,
  type SampleWorkflow,
  type WorkflowDraft,
} from "@/lib/workflow";
import { CellReview, RatingLegend } from "./cell-review";
import { SIDE_ROLES, cellKey } from "./outputs-step";
import { RemovedNotice } from "./removed-notice";
import { SampleTag } from "./sample-tag";
import { capsClass, primaryButtonClass } from "./ui";

// Step 5: rating, one input at a time. The inputs sit in a left rail, the two
// models' outputs stand side by side and scroll on their own, and the rating
// stays in sight under each output. Nothing is run here: the outputs were
// pasted or come from one earlier, dated run. The row result and the summary
// line only count the person's ratings and never name a winner.

const PICK_PREVIEW_CHARS = 60;

const RESULT_CHIP: Partial<Record<RowResult, string>> = {
  better: "border-better text-better",
  worse: "border-worse text-worse",
};

// "Compared model: better", coloured only for better and worse.
export function ResultChip({ result }: { result: RowResult }) {
  return (
    <span
      className={`inline-block w-fit border px-2 py-[3px] font-caps text-[10.5px] font-semibold uppercase tracking-[0.05em] ${RESULT_CHIP[result] ?? "border-line"}`}
    >
      Compared model: {result}
    </span>
  );
}

// A figure with its state under it: never a bare number.
// "not measured" is set smaller than an amount, so it does not read as one.
function Stat({ figure, state, measured = true }: { figure: string; state: string; measured?: boolean }) {
  return (
    <div className="flex flex-col">
      <b
        className={`whitespace-nowrap font-display font-medium leading-[1.05] tabular-nums ${measured ? "text-[2rem]" : "text-[1.2rem] leading-[1.6]"}`}
      >
        {figure}
      </b>
      <span className="whitespace-nowrap text-xs text-muted">{state}</span>
    </div>
  );
}

function CostStat({ column, price }: { column: (SampleOkCell | null)[]; price: ModelPrices["models"][string] | undefined }) {
  const cost = costPer1000Runs(column, price);
  if (cost.state === "not measured") return <Stat figure="not measured" state="cost per 1,000 runs" measured={false} />;
  return <Stat figure={formatUsd(cost.usdPer1000Runs)} state="estimated, per 1,000 runs" />;
}

function TimeStat({ cell }: { cell: SampleOkCell | null }) {
  if (cell === null) return <Stat figure="not measured" state="response time, this input" measured={false} />;
  return <Stat figure={`${formatSeconds(cell.response_ms)} s`} state="measured, this input" />;
}

function Panel({
  side,
  model,
  position,
  output,
  column,
  cell,
  prices,
  runDate,
  hiddenOnPhone,
  reviewCleared,
  review,
}: {
  side: ModelSide;
  model: string;
  position: number;
  output: string;
  // This model's column as the saved run knows it (see sampleRunColumn).
  column: (SampleOkCell | null)[];
  // What the saved run holds for this output, or null when it was pasted.
  cell: SampleOkCell | null;
  prices: ModelPrices | null;
  runDate: string;
  // Below the side-by-side width only one model's panel is shown at a time.
  hiddenOnPhone: boolean;
  reviewCleared: boolean;
  review: React.ReactNode;
}) {
  const tested = cellState(output) !== "not tested";
  return (
    <article
      aria-label={`${SIDE_ROLES[side]}, input ${position}`}
      className={`${hiddenOnPhone ? "hidden wide:grid" : "grid"} min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)_auto] border-ink ${side === "candidate" ? "wide:border-l" : ""}`}
    >
      <div className="flex flex-wrap items-end gap-x-8 gap-y-1.5 border-b border-line px-gutter pb-3.5 pt-4">
        <div className="flex min-w-0 flex-[1_1_12rem] flex-col gap-0.5">
          <span className={capsClass}>{SIDE_ROLES[side]}</span>
          <span className="font-mono text-[12.5px] [overflow-wrap:anywhere]">{model}</span>
        </div>
        <CostStat column={column} price={prices?.models[model]} />
        <TimeStat cell={cell} />
        <p className="basis-full text-xs text-muted [overflow-wrap:anywhere]">
          {costSpeedLine(column, prices?.models[model], prices?.checked_on ?? "", runDate)}
        </p>
      </div>

      <div
        role="region"
        aria-label={`Output of ${model} for input ${position}`}
        tabIndex={0}
        className="min-h-0 px-gutter py-5 wide:overflow-auto"
      >
        {tested ? (
          <>
            <p className={`${capsClass} mb-3 ${cell === null ? "text-muted" : "text-gold"}`}>
              {cell === null
                ? "pasted · shown exactly as pasted"
                : `sample run · ${runDate} · shown exactly as returned`}
            </p>
            <pre className="max-w-[72ch] whitespace-pre-wrap font-sans text-base leading-[1.7] [overflow-wrap:anywhere]">
              {output}
            </pre>
          </>
        ) : (
          <p className="italic text-muted">not tested</p>
        )}
      </div>

      <div className="border-t border-line bg-soft px-gutter pb-3.5 pt-3">
        {reviewCleared && (
          <p role="status" className="mb-2 text-sm font-bold">
            Your rating and note on this output were removed, because its text changed.
          </p>
        )}
        {/* An output that is not there gets no rating: a model that was not
            tried cannot be judged. */}
        {tested ? review : <p className="text-sm text-muted">Nothing to rate: no output was pasted.</p>}
      </div>
    </article>
  );
}

function isTextField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  return target instanceof HTMLInputElement && target.type !== "radio";
}

export function RateStep({
  headingRef,
  draft,
  sample,
  outputs,
  reviews,
  sampleResults,
  modelPrices,
  removedCount,
  clearedCells,
  onRatingChange,
  onNoteChange,
  onSeeResult,
}: {
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  draft: WorkflowDraft;
  sample: SampleWorkflow;
  outputs: PastedOutputs;
  reviews: Reviews;
  sampleResults: SampleResults | null;
  modelPrices: ModelPrices | null;
  // How many outputs the last edit of the draft removed.
  removedCount: number;
  // Cells whose rating or note was removed because their text was edited.
  clearedCells: string[];
  onRatingChange: (inputIndex: number, side: ModelSide, rating: Rating) => void;
  onNoteChange: (inputIndex: number, side: ModelSide, note: string) => void;
  onSeeResult: () => void;
}) {
  const [selected, setSelected] = useState(0);
  // Which model's output shows below the side-by-side width.
  const [phoneSide, setPhoneSide] = useState<ModelSide>("current");
  const inputCount = draft.inputs.length;
  const last = selected === inputCount - 1;

  // Keys 1, 2, 3 switch the input, unless the person is typing in a field.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || isTextField(event.target)) return;
      const position = Number(event.key);
      if (Number.isInteger(position) && position >= 1 && position <= inputCount) {
        setSelected(position - 1);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [inputCount]);

  const columns = {
    current: sampleRunColumn(sampleResults, outputs, "current", draft.currentModel),
    candidate: sampleRunColumn(sampleResults, outputs, "candidate", draft.candidateModel),
  };
  const anyFromSampleRun = MODEL_SIDES.some((side) => columns[side].some((cell) => cell !== null));
  const runDate = sampleResults?.run_date ?? "";
  const input = draft.inputs[selected];
  const position = selected + 1;
  const selectedSampleOf = sampleLabel(sample, input);

  return (
    <main className="grid min-h-0 w-full flex-1 wide:grid-cols-[minmax(280px,22vw)_minmax(0,1fr)] wide:grid-rows-[minmax(0,1fr)]">
      <aside className="flex min-h-0 flex-col gap-4 border-b border-line bg-[repeating-linear-gradient(90deg,transparent_0_27px,color-mix(in_srgb,var(--color-gold)_16%,transparent)_27px_28px)] px-gutter py-5 wide:overflow-auto wide:border-b-0 wide:border-r">
        <span className={capsClass}>Three inputs · pick one</span>
        <div className="flex flex-col gap-2.5">
          {draft.inputs.map((text, index) => {
            const sampleOf = sampleLabel(sample, text);
            const isSelected = index === selected;
            return (
              <button
                key={index}
                type="button"
                aria-pressed={isSelected}
                onClick={() => setSelected(index)}
                className={`grid cursor-pointer grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3.5 gap-y-0.5 border bg-ground px-4 py-3.5 text-left ${isSelected ? "border-ink shadow-focus" : "border-line hover:border-ink"}`}
              >
                <span className="row-span-2 font-display text-[2.1rem] leading-none text-gold">
                  {index + 1}
                </span>
                <b className="font-caps text-[14.5px] font-medium leading-[1.35] [overflow-wrap:anywhere]">
                  {sampleOf ?? preview(text, PICK_PREVIEW_CHARS)}
                  {sampleOf !== null && <SampleTag label={sampleOf} />}
                </b>
                <span className="mt-1.5">
                  <ResultChip result={rowResult(outputs[index], reviews[index])} />
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex flex-col gap-2 border border-line bg-ground px-[18px] py-4">
          <span className={`${capsClass} text-gold`}>
            Input {position} · {input.length.toLocaleString("en-US")} of{" "}
            {INPUT_MAX_CHARS.toLocaleString("en-US")} characters
            {selectedSampleOf !== null && <SampleTag label={selectedSampleOf} />}
          </span>
          <pre className="whitespace-pre-wrap font-sans text-[14.5px] leading-[1.6] [overflow-wrap:anywhere]">
            {input}
          </pre>
        </div>
        <p className="hidden text-[12.5px] text-muted wide:block">
          Keys:{" "}
          {draft.inputs.map((_, index) => (
            <kbd key={index} className="mr-1 border border-line bg-ground px-[5px] py-px font-mono text-[11px]">
              {index + 1}
            </kbd>
          ))}
          switch the input.
        </p>
      </aside>

      <section
        aria-labelledby="rate-heading"
        className="grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)_auto]"
      >
        <div className="grid items-center gap-x-10 gap-y-3 border-b border-line px-gutter py-4 wide:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
          <div className="min-w-0">
            <h2
              id="rate-heading"
              ref={headingRef}
              tabIndex={-1}
              className={`${capsClass} text-gold focus:outline-none`}
            >
              Step 5 of 5 · Rate and result
            </h2>
            <p
              aria-live="polite"
              className="mt-1 text-balance font-display text-[clamp(1.25rem,1.7vw,1.7rem)] leading-tight"
            >
              {summaryLine(outputs, reviews)}
            </p>
            <p className="mt-1 text-[13px] text-muted">
              Read each output and rate it. The line above counts your ratings and nothing else.
              {anyFromSampleRun && sampleResults !== null && (
                <>
                  {" "}
                  Outputs tagged sample run come from one run of{" "}
                  <span className="font-mono text-xs">{sampleResults.models.current}</span> and{" "}
                  <span className="font-mono text-xs">{sampleResults.models.candidate}</span>{" "}
                  through OpenRouter on {sampleResults.run_date}.
                </>
              )}
            </p>
            <RemovedNotice count={removedCount} />
          </div>
          <RatingLegend />
          <div
            role="group"
            aria-label="Which model's output to show"
            className="flex w-fit max-w-full flex-wrap gap-1 rounded-[22px] bg-soft p-1 wide:hidden"
          >
            {MODEL_SIDES.map((side) => (
              <button
                key={side}
                type="button"
                aria-pressed={phoneSide === side}
                onClick={() => setPhoneSide(side)}
                className={`cursor-pointer rounded-full px-4 py-2 text-sm ${phoneSide === side ? "bg-ink font-bold text-ground" : "text-muted"}`}
              >
                {SIDE_ROLES[side]}
              </button>
            ))}
          </div>
        </div>

        {/* Keyed by the input, so each input starts scrolled to the top. */}
        <div key={selected} className="grid min-h-0 wide:grid-cols-2">
          {MODEL_SIDES.map((side) => (
            <Panel
              key={side}
              side={side}
              model={modelFor(draft, side)}
              position={position}
              output={outputs[selected][side]}
              column={columns[side]}
              cell={columns[side][selected]}
              prices={modelPrices}
              runDate={runDate}
              hiddenOnPhone={phoneSide !== side}
              reviewCleared={clearedCells.includes(cellKey(selected, side))}
              review={
                <CellReview
                  cellId={`review-${position}-${side}`}
                  model={modelFor(draft, side)}
                  position={position}
                  review={reviews[selected][side]}
                  onRatingChange={(rating) => onRatingChange(selected, side, rating)}
                  onNoteChange={(note) => onNoteChange(selected, side, note)}
                />
              }
            />
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-ink px-gutter py-3">
          <p className="text-sm text-muted">
            Input {position} of {inputCount}
          </p>
          {/* One button for both labels, so keyboard focus stays on it when
              the last input is reached. */}
          <button
            type="button"
            onClick={last ? onSeeResult : () => setSelected(selected + 1)}
            className={primaryButtonClass}
          >
            {last ? "See the result" : "Next input"}
          </button>
        </div>
      </section>
    </main>
  );
}
