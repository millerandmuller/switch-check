"use client";

import { useState } from "react";
import {
  MODEL_SIDES,
  cellCount,
  cellState,
  filledCount,
  modelFor,
  rowResult,
  summaryLine,
  type ModelSide,
  type PastedOutputs,
  type Rating,
  type Reviews,
} from "@/lib/comparison";
import { cellTimeText, type ModelPrices } from "@/lib/cost-speed";
import { sampleRunCell, type SampleOkCell, type SampleResults } from "@/lib/sample-results";
import { preview, sampleLabel, type SampleWorkflow, type WorkflowDraft } from "@/lib/workflow";
import { CellReview, RatingLegend } from "./cell-review";
import { CostSpeed } from "./cost-speed";
import { RemovedNotice } from "./removed-notice";
import { SampleTag } from "./sample-tag";

// The comparison table, filled by hand or from the saved sample run. Nothing is
// run here: no model is called, and the table shows only what the person
// pasted or what one earlier, dated run returned. Cost and speed are shown for
// that run only, each figure marked estimated, measured or not measured (see
// lib/cost-speed.ts). Once the comparison is
// shown, the person rates each output; the row result and the summary line
// only count those ratings and never name a winner.

const ROW_PREVIEW_CHARS = 90;

const primaryButtonClass =
  "rounded-md bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300";
const secondaryButtonClass =
  "rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900";
const cellClass = "border-t border-zinc-200 p-3 align-top dark:border-zinc-800";

const SIDE_ROLES: Record<ModelSide, string> = {
  current: "Model you use today",
  candidate: "Model to compare with",
};

// Says where an output came from: pasted by hand, or returned by the saved
// sample run on the given date. The two are never shown the same way. Only an
// output the run returned carries a response time: a pasted one was not timed.
function SourceTag({ sampleRun }: { sampleRun: { date: string; cell: SampleOkCell } | null }) {
  if (sampleRun !== null) {
    return (
      <>
        <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
          sample run · {sampleRun.date}
        </span>
        <span className="ml-2 text-[11px] text-zinc-600 dark:text-zinc-400">
          {cellTimeText(sampleRun.cell)}
        </span>
      </>
    );
  }
  return (
    <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-sky-900 dark:bg-sky-950 dark:text-sky-200">
      pasted
    </span>
  );
}

// A cell with no output gets no rating and no note field: a model that was
// not tried cannot be judged.
function ReadOnlyCell({
  output,
  sampleRun,
  review,
}: {
  output: string;
  sampleRun: { date: string; cell: SampleOkCell } | null;
  review: React.ReactNode;
}) {
  if (cellState(output) === "not tested") {
    return <p className="text-sm italic text-zinc-500 dark:text-zinc-500">not tested</p>;
  }
  return (
    <>
      <SourceTag sampleRun={sampleRun} />
      <p className="mt-2 whitespace-pre-wrap text-sm [overflow-wrap:anywhere]">{output}</p>
      {review}
    </>
  );
}

export function ComparisonView({
  draft,
  sample,
  outputs,
  reviews,
  sampleResults,
  modelPrices,
  removedCount,
  onOutputChange,
  onRatingChange,
  onNoteChange,
  onLoadSampleResults,
  onBack,
}: {
  draft: WorkflowDraft;
  sample: SampleWorkflow;
  outputs: PastedOutputs;
  reviews: Reviews;
  sampleResults: SampleResults | null;
  modelPrices: ModelPrices | null;
  // How many outputs the last edit of the draft removed from this table.
  removedCount: number;
  onOutputChange: (inputIndex: number, side: ModelSide, value: string) => void;
  onRatingChange: (inputIndex: number, side: ModelSide, rating: Rating) => void;
  onNoteChange: (inputIndex: number, side: ModelSide, note: string) => void;
  // null when the saved sample results do not belong to this draft.
  onLoadSampleResults: (() => void) | null;
  onBack: () => void;
}) {
  const [showing, setShowing] = useState(false);
  // The refusal appears only after Show comparison was pressed on an empty
  // table, and goes away by itself once anything is pasted.
  const [attempted, setAttempted] = useState(false);

  const filled = filledCount(outputs);
  const refused = attempted && filled === 0;

  // What the saved run holds for a cell, while the cell still shows it.
  function sampleRunFor(inputIndex: number, side: ModelSide) {
    const cell = sampleRunCell(sampleResults, inputIndex, side, outputs[inputIndex][side]);
    if (sampleResults === null || cell === null) return null;
    return { date: sampleResults.run_date, cell };
  }
  const anyFromSampleRun = outputs.some((_, index) =>
    MODEL_SIDES.some((side) => sampleRunFor(index, side) !== null),
  );

  function loadSampleResults() {
    if (onLoadSampleResults === null) return;
    onLoadSampleResults();
    setShowing(true);
  }

  function showComparison() {
    setAttempted(true);
    if (filled > 0) setShowing(true);
  }

  return (
    <section aria-labelledby="comparison-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="comparison-heading" className="text-xl font-semibold tracking-tight">
          Compare outputs
        </h2>
        <button type="button" onClick={onBack} className={secondaryButtonClass}>
          Back
        </button>
      </div>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Run your prompt on each model yourself and paste what it returned. Nothing is run from this
        page.
      </p>
      <RemovedNotice count={removedCount} />
      {onLoadSampleResults !== null && sampleResults !== null && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="button" onClick={loadSampleResults} className={secondaryButtonClass}>
            Load sample results
          </button>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Real outputs from one run of this sample on {sampleResults.run_date}. Loading replaces
            what is in the table.
          </p>
        </div>
      )}
      <p aria-live="polite" className="mt-4 text-sm font-medium">
        {filled} of {cellCount(outputs)} outputs {anyFromSampleRun ? "filled" : "pasted"}
        {showing && <span className="mt-1 block">{summaryLine(outputs, reviews)}</span>}
      </p>
      {anyFromSampleRun && sampleResults !== null && (
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Outputs tagged sample run come from one run of{" "}
          <span className="font-mono text-xs">{sampleResults.models.current}</span> and{" "}
          <span className="font-mono text-xs">{sampleResults.models.candidate}</span> through
          OpenRouter on {sampleResults.run_date}, shown exactly as returned.
        </p>
      )}
      <CostSpeed
        draft={draft}
        outputs={outputs}
        sampleResults={sampleResults}
        prices={modelPrices}
      />
      {showing && <RatingLegend />}

      <table className="mt-3 w-full table-fixed border-collapse text-left">
        <thead>
          <tr>
            <th scope="col" className="w-1/5 p-3 align-bottom text-sm font-medium">
              Input
            </th>
            {MODEL_SIDES.map((side) => (
              <th key={side} scope="col" className="p-3 align-bottom text-sm font-medium">
                {SIDE_ROLES[side]}
                <span className="mt-1 block font-mono text-xs font-normal text-zinc-600 [overflow-wrap:anywhere] dark:text-zinc-400">
                  {modelFor(draft, side)}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {draft.inputs.map((input, index) => {
            const position = index + 1;
            const sampleOf = sampleLabel(sample, input);
            return (
              <tr key={index}>
                <th scope="row" className={`${cellClass} text-sm font-medium`}>
                  Input {position}
                  {sampleOf !== null && <SampleTag label={sampleOf} />}
                  <span className="mt-1 block text-xs font-normal text-zinc-600 [overflow-wrap:anywhere] dark:text-zinc-400">
                    {preview(input, ROW_PREVIEW_CHARS)}
                  </span>
                  {showing && (
                    <span className="mt-2 block text-xs font-normal">
                      Compared model:{" "}
                      <span className="font-semibold">
                        {rowResult(outputs[index], reviews[index])}
                      </span>
                    </span>
                  )}
                </th>
                {MODEL_SIDES.map((side) => (
                  <td key={side} className={cellClass}>
                    {showing ? (
                      <ReadOnlyCell
                        output={outputs[index][side]}
                        sampleRun={sampleRunFor(index, side)}
                        review={
                          <CellReview
                            cellId={`review-${position}-${side}`}
                            model={modelFor(draft, side)}
                            position={position}
                            review={reviews[index][side]}
                            onRatingChange={(rating) => onRatingChange(index, side, rating)}
                            onNoteChange={(note) => onNoteChange(index, side, note)}
                          />
                        }
                      />
                    ) : (
                      <textarea
                        value={outputs[index][side]}
                        onChange={(event) => onOutputChange(index, side, event.target.value)}
                        rows={8}
                        placeholder={`Paste this model's output for input ${position}`}
                        aria-label={`Output of ${modelFor(draft, side)} for input ${position}`}
                        className="w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 font-mono text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:focus:border-zinc-400"
                      />
                    )}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="mt-5 flex flex-wrap items-center justify-end gap-4 border-t border-zinc-200 pt-5 dark:border-zinc-800">
        {refused && (
          <p role="alert" className="text-sm text-red-700 dark:text-red-400">
            There is nothing to compare yet, so paste at least one output first.
          </p>
        )}
        {showing ? (
          <button type="button" onClick={() => setShowing(false)} className={secondaryButtonClass}>
            Edit outputs
          </button>
        ) : (
          <button type="button" onClick={showComparison} className={primaryButtonClass}>
            Show comparison
          </button>
        )}
      </div>
    </section>
  );
}
