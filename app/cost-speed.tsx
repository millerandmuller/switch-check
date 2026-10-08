import { MODEL_SIDES, modelFor, type PastedOutputs } from "@/lib/comparison";
import { costSpeedLine, type ModelPrices } from "@/lib/cost-speed";
import { sampleRunColumn, type SampleResults } from "@/lib/sample-results";
import type { WorkflowDraft } from "@/lib/workflow";

// One line per model: an estimated cost and the measured response times of the
// saved sample run, or "not measured" with the reason. The two lines stand
// next to each other and are not compared: no "cheaper", no "faster".
export function CostSpeed({
  draft,
  outputs,
  sampleResults,
  prices,
}: {
  draft: WorkflowDraft;
  outputs: PastedOutputs;
  sampleResults: SampleResults | null;
  // null when config/model-prices.json has not been written yet.
  prices: ModelPrices | null;
}) {
  return (
    <div className="mt-4 border border-line p-3">
      <h3 className="text-sm font-medium">Cost and speed</h3>
      <ul className="mt-2 space-y-2 text-sm">
        {MODEL_SIDES.map((side) => {
          const model = modelFor(draft, side);
          return (
            <li key={side} className="[overflow-wrap:anywhere]">
              <span className="font-mono text-xs">{model}</span>:{" "}
              {costSpeedLine(
                sampleRunColumn(sampleResults, outputs, side, model),
                prices?.models[model],
                prices?.checked_on ?? "",
                sampleResults?.run_date ?? "",
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs text-muted">
        A run is your prompt with one input. The cost is an estimate from a published price, not a
        bill. The times are from a single run and change from run to run.
      </p>
    </div>
  );
}
