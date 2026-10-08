"use client";

import { useEffect, useRef, useState } from "react";
import {
  MODEL_SIDES,
  RATINGS,
  cellState,
  modelFor,
  summaryLine,
  type ModelSide,
  type PastedOutputs,
  type Rating,
  type Reviews,
} from "@/lib/comparison";
import {
  NOT_RUN_REASON,
  costPer1000Runs,
  formatSeconds,
  formatUsd,
  sharedSourceLine,
  type ModelPrices,
} from "@/lib/cost-speed";
import { sampleRunColumn, type SampleOkCell, type SampleResults } from "@/lib/sample-results";
import { sampleLabel, type SampleWorkflow, type WorkflowDraft } from "@/lib/workflow";
import { CellReview, RatingsDisclosure } from "./cell-review";
import { FigureChip } from "./figure-chip";
import { FormattedOutput, RawOutput } from "./formatted-output";
import { InputColumn } from "./input-column";
import { InputTabs } from "./input-tabs";
import { ModelSwitch } from "./model-switch";
import { SIDE_ROLES, cellKey } from "./outputs-step";
import { RemovedNotice } from "./removed-notice";
import { SummaryLine } from "./summary-line";
import { labelClass, primaryButtonCompactClass } from "./ui";

// Step 5: rating, one input at a time. The three inputs are tabs across the
// top. Below them three columns read left to right: the selected input, the
// output of the model in use today, the output of the model to compare with.
// Each output scrolls on its own, with at least 320 px to read in, and the
// page scrolls when the window is too short for that. Nothing is run here: the
// outputs were pasted or come from one earlier, dated run. The row result and
// the summary line only count the person's ratings and never name a winner.

// Cost and response time in the header of one output, as two chips.
function Figures({
  column,
  price,
  cell,
}: {
  column: (SampleOkCell | null)[];
  price: ModelPrices["models"][string] | undefined;
  cell: SampleOkCell | null;
}) {
  const cost = costPer1000Runs(column, price);
  // Nothing measured for this model: say so once, with the reason once.
  if (cost.state === "not measured" && cell === null) {
    return (
      <div className="flex flex-wrap gap-1.5">
        <FigureChip figure="cost and time not measured" note={cost.reason} />
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {cost.state === "estimated" ? (
        <FigureChip figure={formatUsd(cost.usdPer1000Runs)} note="estimated · per 1,000 runs" />
      ) : (
        <FigureChip figure="cost not measured" note={cost.reason} />
      )}
      {cell === null ? (
        <FigureChip figure="time not measured" note={NOT_RUN_REASON} />
      ) : (
        <FigureChip figure={`${formatSeconds(cell.response_ms)} s`} note="measured · this input" />
      )}
    </div>
  );
}

// Marks the heading of an output, so Next input can move focus to the first one.
const OUTPUT_HEADING = "data-output-heading";

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
  raw,
  onToggleRaw,
  reviewCleared,
  review,
  switcher,
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
  // Whether this card shows the stored characters as they are, not formatted.
  raw: boolean;
  onToggleRaw: () => void;
  reviewCleared: boolean;
  review: React.ReactNode;
  // Below the side-by-side width: the switch between the two models.
  switcher: React.ReactNode;
}) {
  const tested = cellState(output) !== "not tested";
  return (
    <article
      aria-label={`${SIDE_ROLES[side]}, input ${position}`}
      className={`card ${hiddenOnPhone ? "hidden wide:flex" : "flex"} min-w-0 flex-col`}
    >
      {/* Role and model, then the two figures with their state words. Each
          part stays whole; a narrow column wraps between them, not inside. */}
      <div className="flex flex-col gap-1 px-4 pb-1 pt-2">
        <h3
          {...{ [OUTPUT_HEADING]: side }}
          tabIndex={-1}
          className="flex flex-wrap items-baseline gap-x-2.5"
        >
          <span className="font-display text-[1.05rem] font-semibold tracking-[-0.01em]">
            {SIDE_ROLES[side]}
          </span>
          <span className="font-mono text-[12px] text-muted [overflow-wrap:anywhere]">{model}</span>
        </h3>
        <Figures column={column} price={prices?.models[model]} cell={cell} />
      </div>

      {tested && (
        <div className="flex items-baseline justify-between gap-3 px-5 leading-tight">
          {/* The tag says what the view is: formatting is a display change,
              so only the raw view is "exactly as returned". */}
          <p className="text-[12.5px] font-medium text-muted">
            {cell === null
              ? raw
                ? "pasted · shown exactly as pasted"
                : "pasted · formatted for reading"
              : raw
                ? `sample run · ${runDate} · shown exactly as returned`
                : `sample run · ${runDate} · formatted for reading`}
          </p>
          <button
            type="button"
            onClick={onToggleRaw}
            className="flex-none cursor-pointer text-[12.5px] font-medium text-muted underline underline-offset-[3px] hover:text-ink"
          >
            {raw ? "Show formatted" : "Show raw"}
          </button>
        </div>
      )}
      <div
        role="region"
        aria-label={`Output of ${model} for input ${position}`}
        tabIndex={0}
        className="px-5 pb-2 pt-1 wide:min-h-[320px] wide:flex-[1_1_320px] wide:overflow-auto"
      >
        {tested ? (
          raw ? (
            <RawOutput text={output} />
          ) : (
            <FormattedOutput text={output} />
          )
        ) : (
          <p className="italic text-muted">not tested</p>
        )}
      </div>

      <div className="px-4 pb-2.5 pt-1.5">
        {switcher}
        {reviewCleared && (
          <p role="status" className="mb-2 text-sm font-semibold">
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

function isNarrow(): boolean {
  return window.matchMedia("(max-width: 999px)").matches;
}

function isTextField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  return target instanceof HTMLInputElement && target.type !== "radio";
}

function anyRated(reviews: Reviews): boolean {
  return reviews.some((pair) => MODEL_SIDES.some((side) => pair[side].rating !== null));
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
  selected,
  onSelect,
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
  // The input on show. It lives above this screen so the result screen can
  // send the person back to a particular input.
  selected: number;
  onSelect: (index: number) => void;
  onSeeResult: () => void;
}) {
  // Which model's output shows below the side-by-side width.
  const [phoneSide, setPhoneSide] = useState<ModelSide>("current");
  // Which cards show the stored characters instead of formatted text.
  const [rawSides, setRawSides] = useState<Record<ModelSide, boolean>>({ current: false, candidate: false });
  // "What the ratings mean" is open until the first rating of the session.
  const [legendOpen, setLegendOpen] = useState(() => !anyRated(reviews));
  const inputCount = draft.inputs.length;
  const last = selected === inputCount - 1;

  // Keys 1, 2, 3 switch the input, unless the person is typing in a field.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || isTextField(event.target)) return;
      const position = Number(event.key);
      if (Number.isInteger(position) && position >= 1 && position <= inputCount) {
        onSelect(position - 1);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [inputCount, onSelect]);

  // Below the side-by-side width: the input where Next input already pointed
  // out an unrated model once, so a second press moves on.
  const [nudgedInput, setNudgedInput] = useState<number | null>(null);
  const focusOutputAfterNext = useRef(false);
  // Next input moves focus to the heading of the first output shown, so the
  // next Tab starts at the outputs, not back at the button. On a phone the
  // page also goes to the top of the next input.
  useEffect(() => {
    if (!focusOutputAfterNext.current) return;
    focusOutputAfterNext.current = false;
    const narrow = isNarrow();
    const headings = [...document.querySelectorAll<HTMLElement>(`[${OUTPUT_HEADING}]`)];
    headings.find((heading) => heading.offsetParent !== null)?.focus({ preventScroll: narrow });
    if (narrow) window.scrollTo(0, 0);
  }, [selected]);

  // The model left unrated on the input on show, if any: the first tested
  // output without a rating.
  const unratedSide = MODEL_SIDES.find(
    (side) => cellState(outputs[selected][side]) === "pasted" && reviews[selected][side].rating === null,
  );

  function goToNextInput() {
    // Below 1,000 px one output shows at a time: say once that the other one
    // is unrated before moving on, and show it.
    if (isNarrow() && unratedSide !== undefined && nudgedInput !== selected) {
      setNudgedInput(selected);
      setPhoneSide(unratedSide);
      focusOutputAfterNext.current = false;
      return;
    }
    focusOutputAfterNext.current = true;
    setPhoneSide("current");
    onSelect(selected + 1);
  }

  const statusOf = (side: ModelSide): string => {
    if (cellState(outputs[selected][side]) === "not tested") return "not tested";
    return RATINGS.find((entry) => entry.value === reviews[selected][side].rating)?.label ?? "not rated";
  };

  function rate(inputIndex: number, side: ModelSide, rating: Rating) {
    if (!anyRated(reviews)) setLegendOpen(false);
    onRatingChange(inputIndex, side, rating);
  }

  const columns = {
    current: sampleRunColumn(sampleResults, outputs, "current", draft.currentModel),
    candidate: sampleRunColumn(sampleResults, outputs, "candidate", draft.candidateModel),
  };
  const runDate = sampleResults?.run_date ?? "";
  const sourceLine = sharedSourceLine(
    MODEL_SIDES.map((side) => ({
      model: modelFor(draft, side),
      column: columns[side],
      price: modelPrices?.models[modelFor(draft, side)],
    })),
    modelPrices?.checked_on ?? "",
    runDate,
  );
  const input = draft.inputs[selected];
  const position = selected + 1;
  const anyFigures = MODEL_SIDES.some((side) => columns[side].some((cell) => cell !== null));

  return (
    <main className="relative flex w-full flex-1 flex-col px-gutter pb-2.5 pt-1">
      <div className="panel flex flex-1 flex-col gap-1 p-2.5">
        <section
          aria-labelledby="rate-heading"
          className="grid items-start gap-x-8 gap-y-1 px-1 wide:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]"
        >
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-0 wide:col-span-2">
            <h2
              id="rate-heading"
              ref={headingRef}
              tabIndex={-1}
              className={`${labelClass} font-semibold focus:outline-none focus:shadow-none`}
            >
              Step 5 of 5 · Rate the outputs
            </h2>
            <p className="text-[12.5px] text-muted">
              Read each output and rate it. The line below counts your ratings and nothing else.
              <span className="hidden wide:inline">
                {" "}
                Keys{" "}
                {draft.inputs.map((_, index) => (
                  <kbd key={index} className="mr-1 rounded-md bg-chip px-[5px] py-px font-mono text-xs">
                    {index + 1}
                  </kbd>
                ))}
                switch the input.
              </span>
            </p>
          </div>
          {/* Two lines tall at every length, so rating never moves the panels. */}
          <p
            aria-live="polite"
            className="min-h-[2.9rem] min-w-0 text-balance font-display text-[1.25rem] leading-[1.2]"
          >
            <SummaryLine text={summaryLine(outputs, reviews)} />
          </p>
          <div className="min-w-0">
            <RatingsDisclosure open={legendOpen} onToggle={setLegendOpen} />
          </div>
          {removedCount > 0 && (
            <div className="wide:col-span-2">
              <RemovedNotice count={removedCount} />
            </div>
          )}
        </section>

        <InputTabs
          inputs={draft.inputs}
          sample={sample}
          outputs={outputs}
          reviews={reviews}
          selected={selected}
          onSelect={onSelect}
        />

        <div className="flex flex-1 flex-col gap-3 wide:grid wide:grid-cols-[minmax(300px,25%)_minmax(0,1fr)_minmax(0,1fr)] wide:grid-rows-[1fr]">
          {/* Keyed by the input, so each input starts scrolled to the top. */}
          <InputColumn
            key={`input-${selected}`}
            prompt={draft.prompt}
            input={input}
            position={position}
            sampleOf={sampleLabel(sample, input)}
          />
          {MODEL_SIDES.map((side) => (
            <Panel
              key={`${selected}-${side}`}
              side={side}
              model={modelFor(draft, side)}
              position={position}
              output={outputs[selected][side]}
              column={columns[side]}
              cell={columns[side][selected]}
              prices={modelPrices}
              runDate={runDate}
              hiddenOnPhone={phoneSide !== side}
              raw={rawSides[side]}
              onToggleRaw={() => setRawSides((current) => ({ ...current, [side]: !current[side] }))}
              reviewCleared={clearedCells.includes(cellKey(selected, side))}
              switcher={
                <ModelSwitch
                  shown={phoneSide}
                  status={{ current: statusOf("current"), candidate: statusOf("candidate") }}
                  unratedNudge={nudgedInput === selected && unratedSide !== undefined ? unratedSide : null}
                  onShow={setPhoneSide}
                />
              }
              review={
                <CellReview
                  cellId={`review-${position}-${side}`}
                  model={modelFor(draft, side)}
                  position={position}
                  review={reviews[selected][side]}
                  onRatingChange={(rating) => rate(selected, side, rating)}
                  onNoteChange={(note) => onNoteChange(selected, side, note)}
                />
              }
            />
          ))}
        </div>

        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 px-1">
          {/* Where the figures above come from, closed until asked for. */}
          <details className="min-w-0 max-w-[90ch] flex-1 basis-[22rem] self-center text-[13px] text-muted">
            <summary className="cursor-pointer text-[13.5px] font-semibold text-ink">
              How these figures were worked out
            </summary>
            <p className="mt-1.5 [overflow-wrap:anywhere]">
              {sourceLine}
              {anyFigures &&
                " The cost is an estimate from a published price, not a bill. The times are from a single run and change from run to run."}
            </p>
          </details>
          <p className="self-center text-[13px] text-muted wide:ml-auto">
            Nothing is saved. Reloading this page empties it.
          </p>
          <div className="flex items-center gap-3">
            <p className="text-sm text-muted">
              Input {position} of {inputCount}
            </p>
            {/* One button for both labels, so keyboard focus stays on it when
                the last input is reached. */}
            <button
              type="button"
              onClick={last ? onSeeResult : goToNextInput}
              className={primaryButtonCompactClass}
            >
              {last ? "See the result" : "Next input"}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
