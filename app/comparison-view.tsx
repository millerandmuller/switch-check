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
import { capsClass, secondaryButtonClass } from "./ui";

// The comparison table, filled by hand or from the saved sample run. It has
// two modes: "edit" is the outputs step, where the six outputs are pasted;
// "shown" is the rating step, where each output is read and rated. Nothing is
// run here: no model is called, and the table shows only what the person
// pasted or what one earlier, dated run returned. Cost and speed are shown for
// that run only, each figure marked estimated, measured or not measured (see
// lib/cost-speed.ts). Once the comparison is
// shown, the person rates each output; the row result and the summary line
// only count those ratings and never name a winner.

const ROW_PREVIEW_CHARS = 90;

const cellClass = "border-t border-line p-3 align-top";

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
        <span className={`${capsClass} text-gold`}>
          sample run · {sampleRun.date}
        </span>
        <span className="ml-2 text-[11px] text-muted">
          {cellTimeText(sampleRun.cell)}
        </span>
      </>
    );
  }
  return (
    <span className={`${capsClass} text-muted`}>
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
    return <p className="text-sm italic text-muted">not tested</p>;
  }
  return (
    <>
      <SourceTag sampleRun={sampleRun} />
      <p className="mt-2 whitespace-pre-wrap text-sm [overflow-wrap:anywhere]">{output}</p>
      {review}
    </>
  );
}

// The key of one cell, for the list of cells whose review an edit removed.
export function cellKey(inputIndex: number, side: ModelSide): string {
  return `${inputIndex}-${side}`;
}

export function ComparisonView({
  mode,
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
  notOfferedReason,
  clearedCells,
}: {
  mode: "edit" | "shown";
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
  // Why the saved sample results are not offered for this draft, or null.
  notOfferedReason: string | null;
  // Cells whose rating or note was removed because their text was edited.
  clearedCells: string[];
}) {
  const showing = mode === "shown";
  const filled = filledCount(outputs);

  // What the saved run holds for a cell, while the cell still shows it.
  function sampleRunFor(inputIndex: number, side: ModelSide) {
    const cell = sampleRunCell(sampleResults, inputIndex, side, outputs[inputIndex][side]);
    if (sampleResults === null || cell === null) return null;
    return { date: sampleResults.run_date, cell };
  }
  const anyFromSampleRun = outputs.some((_, index) =>
    MODEL_SIDES.some((side) => sampleRunFor(index, side) !== null),
  );

  return (
    <section aria-label="Outputs of both models">
      <RemovedNotice count={removedCount} />
      {!showing && notOfferedReason !== null && (
        <p className="mt-3 text-sm text-muted">{notOfferedReason}</p>
      )}
      {!showing && onLoadSampleResults !== null && sampleResults !== null && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="button" onClick={onLoadSampleResults} className={secondaryButtonClass}>
            Load sample results
          </button>
          <p className="text-sm text-muted">
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
        <p className="mt-1 text-sm text-muted">
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
                <span className="mt-1 block font-mono text-xs font-normal text-muted [overflow-wrap:anywhere]">
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
                  <span className="mt-1 block text-xs font-normal text-muted [overflow-wrap:anywhere]">
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
                      <>
                      <textarea
                        value={outputs[index][side]}
                        onChange={(event) => onOutputChange(index, side, event.target.value)}
                        rows={8}
                        placeholder={`Paste this model's output for input ${position}`}
                        aria-label={`Output of ${modelFor(draft, side)} for input ${position}`}
                        className="w-full border border-line bg-transparent px-3 py-2 font-mono text-sm focus:border-ink"
                      />
                      {clearedCells.includes(cellKey(index, side)) && (
                        <p role="status" className="mt-1 text-sm font-bold">
                          Your rating and note on this output were removed, because its text
                          changed.
                        </p>
                      )}
                      </>
                    )}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>

    </section>
  );
}
