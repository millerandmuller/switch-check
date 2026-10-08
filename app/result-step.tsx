import {
  MODEL_SIDES,
  RATINGS,
  cellState,
  modelFor,
  rowResult,
  summaryLine,
  type PastedOutputs,
  type Reviews,
} from "@/lib/comparison";
import {
  costPer1000Runs,
  costText,
  responseTimes,
  speedText,
  type ModelPrices,
} from "@/lib/cost-speed";
import { sampleRunColumn, type SampleResults } from "@/lib/sample-results";
import { preview, sampleLabel, type SampleWorkflow, type WorkflowDraft } from "@/lib/workflow";
import { SIDE_ROLES } from "./outputs-step";
import { ResultChip } from "./result-chip";
import { SampleTag } from "./sample-tag";
import { capsClass, secondaryButtonClass } from "./ui";

// The last screen: what the person's ratings add up to, what is known about
// cost and speed, and a place to mark their own decision. The tool suggests
// nothing: no winner, no comparison of the two costs, no preselected choice.
// The decision is shown on this screen and goes nowhere else.

export const DECISIONS = ["Switch", "Stay", "Test more"] as const;
export type Decision = (typeof DECISIONS)[number];

const INPUT_PREVIEW_CHARS = 90;

function ratingLabel(output: string, rating: Reviews[number]["current"]["rating"]): string {
  if (cellState(output) === "not tested") return "not tested";
  return RATINGS.find((entry) => entry.value === rating)?.label ?? "not rated";
}

export function ResultStep({
  headingRef,
  draft,
  sample,
  outputs,
  reviews,
  sampleResults,
  modelPrices,
  decision,
  onDecide,
  onBackToRating,
  onStartNew,
}: {
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  draft: WorkflowDraft;
  sample: SampleWorkflow;
  outputs: PastedOutputs;
  reviews: Reviews;
  sampleResults: SampleResults | null;
  modelPrices: ModelPrices | null;
  // null until the person picks one. Nothing is preselected.
  decision: Decision | null;
  onDecide: (decision: Decision) => void;
  onBackToRating: () => void;
  onStartNew: () => void;
}) {
  const runDate = sampleResults?.run_date ?? "";
  const priceCheckedOn = modelPrices?.checked_on ?? "";

  return (
    <div>
      <p className={`${capsClass} text-gold`}>Step 5 of 5 · Rate and result</p>
      <h2
        ref={headingRef}
        tabIndex={-1}
        className="mt-1 font-display text-[2rem] font-medium leading-tight focus:outline-none"
      >
        The result
      </h2>
      <p className="mt-4 text-balance font-display text-[clamp(1.6rem,3vw,2.6rem)] leading-tight">
        {summaryLine(outputs, reviews)}
      </p>
      <p className="mt-2 text-sm text-muted">
        This line counts your ratings and nothing else. Two outputs with the same rating can still
        differ.
      </p>

      <h3 className={`mt-10 ${capsClass}`}>Cost and speed</h3>
      <div className="mt-3 grid gap-5 wide:grid-cols-2">
        {MODEL_SIDES.map((side) => {
          const model = modelFor(draft, side);
          const column = sampleRunColumn(sampleResults, outputs, side, model);
          return (
            <div key={side} className="min-w-0 border border-line p-5">
              <p className={capsClass}>{SIDE_ROLES[side]}</p>
              <p className="mt-1 font-mono text-[12.5px] [overflow-wrap:anywhere]">{model}</p>
              <p className="mt-3 [overflow-wrap:anywhere]">
                {costText(costPer1000Runs(column, modelPrices?.models[model]), priceCheckedOn, runDate)}
              </p>
              <p className="mt-1 [overflow-wrap:anywhere]">{speedText(responseTimes(column), runDate)}</p>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-muted">
        A run is your prompt with one input. The cost is an estimate from a published price, not a
        bill. The times are from a single run and change from run to run.
      </p>

      <h3 className={`mt-10 ${capsClass}`}>Input by input</h3>
      <ol className="mt-3 grid gap-5 wide:grid-cols-3">
        {draft.inputs.map((input, index) => {
          const sampleOf = sampleLabel(sample, input);
          return (
            <li key={index} className="min-w-0 border border-line p-5">
              <div className="flex items-start gap-3.5">
                <span className="font-display text-[2.1rem] leading-none text-gold">{index + 1}</span>
                <p className="min-w-0 font-caps text-[14.5px] font-medium leading-[1.35] [overflow-wrap:anywhere]">
                  {sampleOf ?? preview(input, INPUT_PREVIEW_CHARS)}
                  {sampleOf !== null && <SampleTag label={sampleOf} />}
                </p>
              </div>
              <p className="mt-3">
                <ResultChip result={rowResult(outputs[index], reviews[index])} />
              </p>
              <dl className="mt-3 space-y-2 text-sm">
                {MODEL_SIDES.map((side) => {
                  const review = reviews[index][side];
                  return (
                    <div key={side}>
                      <dt className="text-muted">{SIDE_ROLES[side]}</dt>
                      <dd className="[overflow-wrap:anywhere]">
                        <b>{ratingLabel(outputs[index][side], review.rating)}</b>
                        {review.note !== "" && <span>. Your note: {review.note}</span>}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </li>
          );
        })}
      </ol>

      <h3 className={`mt-10 ${capsClass}`}>Your decision</h3>
      <p className="mt-2 max-w-[72ch] text-sm text-muted">
        The choice is yours and Switch Check does not suggest one. It is shown on this screen
        only: it is not saved or sent, and reloading the page empties it.
      </p>
      <div role="group" aria-label="Your decision" className="mt-3 flex flex-wrap gap-3">
        {DECISIONS.map((choice) => (
          <button
            key={choice}
            type="button"
            aria-pressed={decision === choice}
            onClick={() => onDecide(choice)}
            className={`cursor-pointer border px-6 py-3.5 font-caps text-[13px] font-semibold uppercase tracking-[0.05em] ${decision === choice ? "border-ink bg-ink text-ground" : "border-line bg-ground hover:border-ink"}`}
          >
            {choice}
          </button>
        ))}
      </div>
      <p aria-live="polite" className="mt-3 min-h-[1.6em] font-display text-xl">
        {decision === null ? "" : `Your decision: ${decision}.`}
      </p>

      <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-line pt-5">
        <button type="button" onClick={onBackToRating} className={secondaryButtonClass}>
          Back to rating
        </button>
        <button type="button" onClick={onStartNew} className={secondaryButtonClass}>
          Start a new comparison
        </button>
      </div>
    </div>
  );
}
