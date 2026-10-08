import {
  MODEL_SIDES,
  RATINGS,
  cellState,
  inputsMissingRating,
  modelFor,
  rowResult,
  summaryLine,
  type PastedOutputs,
  type Reviews,
} from "@/lib/comparison";
import {
  costPer1000Runs,
  costText,
  formatSeconds,
  formatUsd,
  responseTimes,
  sharedSourceLine,
  speedText,
  type ModelPrices,
  type RunColumn,
} from "@/lib/cost-speed";
import { sampleRunColumn, type SampleResults } from "@/lib/sample-results";
import { preview, sampleLabel, type SampleWorkflow, type WorkflowDraft } from "@/lib/workflow";
import { FigureChip } from "./figure-chip";
import { SIDE_ROLES } from "./outputs-step";
import { ResultChip } from "./result-chip";
import { SampleTag } from "./sample-tag";
import { SummaryLine } from "./summary-line";
import { labelClass, secondaryButtonClass } from "./ui";

// The last screen: what the person's ratings add up to, what is known about
// cost and speed, and a place to mark their own decision. The tool suggests
// nothing: no winner, no comparison of the two costs, no preselected choice.
// The decision is shown on this screen and goes nowhere else.

export const DECISIONS = ["Switch", "Stay", "Test more"] as const;
export type Decision = (typeof DECISIONS)[number];

const INPUT_PREVIEW_CHARS = 90;

// One model's cost and response times as two chips, each with its state word
// and unit beneath the figure. The full sentences, with the price source and
// the dates, are in the disclosure below the cards.
function ResultFigures({
  column,
  price,
}: {
  column: RunColumn;
  price: ModelPrices["models"][string] | undefined;
}) {
  const cost = costPer1000Runs(column, price);
  const speed = responseTimes(column);
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {cost.state === "estimated" ? (
        <FigureChip figure={formatUsd(cost.usdPer1000Runs)} note="estimated · per 1,000 runs" />
      ) : (
        <FigureChip figure="cost not measured" note={cost.reason} />
      )}
      {speed.state === "measured" ? (
        <FigureChip
          figure={
            formatSeconds(speed.fastestMs) === formatSeconds(speed.slowestMs)
              ? `${formatSeconds(speed.fastestMs)} s`
              : `${formatSeconds(speed.fastestMs)} to ${formatSeconds(speed.slowestMs)} s`
          }
          note={`measured · one run, ${speed.basedOn} of ${speed.inputs} inputs`}
        />
      ) : (
        <FigureChip figure="time not measured" note={speed.reason} />
      )}
    </div>
  );
}

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
  onRateInput,
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
  // Back to the rating screen, on this input (0 is the first).
  onRateInput: (index: number) => void;
  onStartNew: () => void;
}) {
  const runDate = sampleResults?.run_date ?? "";
  const priceCheckedOn = modelPrices?.checked_on ?? "";

  const columns = MODEL_SIDES.map((side) => {
    const model = modelFor(draft, side);
    return { side, model, column: sampleRunColumn(sampleResults, outputs, side, model) };
  });
  // The cost and time sentences and the footnote about them are only true of
  // figures that exist: with nothing measured they are not shown.
  const anyMeasured = columns.some(({ column }) => column.some((cell) => cell !== null));
  const missing = inputsMissingRating(outputs, reviews);

  return (
    <div>
      <p className={labelClass}>Step 5 of 5 · The result</p>
      <h2
        ref={headingRef}
        tabIndex={-1}
        className="mt-1 font-display text-[2rem] font-semibold leading-tight tracking-[-0.02em] focus:outline-none focus:shadow-none"
      >
        The result
      </h2>
      <p className="mt-4 text-balance font-display text-[clamp(1.6rem,3vw,2.6rem)] leading-tight">
        <SummaryLine text={summaryLine(outputs, reviews)} />
      </p>
      <p className="mt-2 text-sm text-muted">
        This line counts your ratings and nothing else. Two outputs with the same rating can still
        differ.
      </p>

      <h3 className={`mt-10 ${labelClass} font-semibold`}>Cost and speed</h3>
      <div className="mt-3 grid gap-5 wide:grid-cols-2">
        {columns.map(({ side, model, column }) => (
          <div key={side} className="card min-w-0 p-5">
            <p className="text-[13px] font-semibold">{SIDE_ROLES[side]}</p>
            <p className="mt-1 font-mono text-[12.5px] [overflow-wrap:anywhere]">{model}</p>
            {anyMeasured ? (
              <ResultFigures column={column} price={modelPrices?.models[model]} />
            ) : (
              <p className="mt-3">cost and response time not measured</p>
            )}
          </div>
        ))}
      </div>
      {anyMeasured ? (
        <>
          <p className="mt-2 text-xs text-muted">
            A run is your prompt with one input. The cost is an estimate from a published price, not
            a bill. The times are from a single run and change from run to run.
          </p>
          <details className="mt-2 text-[13px] text-muted">
            <summary className="cursor-pointer text-[13.5px] font-semibold text-ink">
              How these figures were worked out
            </summary>
            <ul className="mt-1.5 space-y-1.5">
              {columns.map(({ side, model, column }) => (
                <li key={side} className="[overflow-wrap:anywhere]">
                  <b className="font-semibold">{SIDE_ROLES[side]}</b> ({model}):{" "}
                  {costText(costPer1000Runs(column, modelPrices?.models[model]), priceCheckedOn, runDate)}.{" "}
                  {speedText(responseTimes(column), runDate)}.
                </li>
              ))}
            </ul>
          </details>
        </>
      ) : (
        <p className="mt-2 text-xs text-muted">
          {sharedSourceLine(
            columns.map(({ model, column }) => ({ model, column, price: modelPrices?.models[model] })),
            priceCheckedOn,
            runDate,
          )}
        </p>
      )}

      <h3 className={`mt-10 ${labelClass} font-semibold`}>Input by input</h3>
      <ol className="mt-3 grid gap-5 wide:grid-cols-3">
        {draft.inputs.map((input, index) => {
          const sampleOf = sampleLabel(sample, input);
          return (
            <li key={index} className="card min-w-0 p-5">
              <div className="flex items-start gap-3.5">
                <span className="font-display text-[2.1rem] font-light leading-none text-accent">{index + 1}</span>
                <p className="min-w-0 text-[14.5px] font-semibold leading-[1.35] [overflow-wrap:anywhere]">
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
                        <b className="font-semibold">{ratingLabel(outputs[index][side], review.rating)}</b>
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

      {missing.length > 0 ? (
        <>
          <h3 className={`mt-10 ${labelClass} font-semibold`}>Still to rate</h3>
          <p className="mt-2 max-w-[72ch] text-sm text-muted">
            Your decision opens when every output that was tested has a rating. An output that was
            not tested does not hold it back.
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {missing.map(({ index, sides }) => (
              <li key={index} className="flex flex-wrap items-center gap-3 text-sm">
                <span>
                  <b className="font-semibold">Input {index + 1}</b>: no rating on{" "}
                  {sides.map((side) => SIDE_ROLES[side].toLowerCase()).join(" and ")}.
                </span>
                <button type="button" onClick={() => onRateInput(index)} className={secondaryButtonClass}>
                  Rate input {index + 1}
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <h3 className={`mt-10 ${labelClass} font-semibold`}>Your decision</h3>
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
                className={`cursor-pointer rounded-full px-6 py-3 text-[15px] font-semibold ${decision === choice ? "bg-accent text-on-accent" : "border border-accent/35 bg-chip text-ink hover:border-accent hover:bg-accent/15"}`}
              >
                {choice}
              </button>
            ))}
          </div>
          <p aria-live="polite" className="mt-3 min-h-[1.6em] font-display text-xl font-semibold">
            {decision === null ? "" : `Your decision: ${decision}.`}
          </p>
        </>
      )}

      <div className="mt-8 flex flex-wrap items-center gap-3">
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
