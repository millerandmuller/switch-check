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
import { SIDE_ROLES } from "./outputs-step";
import { RemovedNotice } from "./removed-notice";
import { SampleTag } from "./sample-tag";
import { capsClass } from "./ui";

// The comparison table of the rating step: each output is read and rated here.
// The outputs were pasted by hand or loaded from the saved sample run. Nothing
// is run here: no model is called, and the table shows only what the person
// pasted or what one earlier, dated run returned. Cost and speed are shown for
// that run only, each figure marked estimated, measured or not measured (see
// lib/cost-speed.ts). Once the comparison is
// shown, the person rates each output; the row result and the summary line
// only count those ratings and never name a winner.

const ROW_PREVIEW_CHARS = 90;

const cellClass = "border-t border-line p-3 align-top";

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

export function ComparisonView({
  draft,
  sample,
  outputs,
  reviews,
  sampleResults,
  modelPrices,
  removedCount,
  onRatingChange,
  onNoteChange,
}: {
  draft: WorkflowDraft;
  sample: SampleWorkflow;
  outputs: PastedOutputs;
  reviews: Reviews;
  sampleResults: SampleResults | null;
  modelPrices: ModelPrices | null;
  // How many outputs the last edit of the draft removed from this table.
  removedCount: number;
  onRatingChange: (inputIndex: number, side: ModelSide, rating: Rating) => void;
  onNoteChange: (inputIndex: number, side: ModelSide, note: string) => void;
}) {
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
      <p aria-live="polite" className="mt-4 text-sm font-medium">
        {filled} of {cellCount(outputs)} outputs {anyFromSampleRun ? "filled" : "pasted"}
        <span className="mt-1 block">{summaryLine(outputs, reviews)}</span>
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
      <RatingLegend />

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
                  <span className="mt-2 block text-xs font-normal">
                    Compared model:{" "}
                    <span className="font-semibold">{rowResult(outputs[index], reviews[index])}</span>
                  </span>
                </th>
                {MODEL_SIDES.map((side) => (
                  <td key={side} className={cellClass}>
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
