import { preview, sampleLabel, type SampleWorkflow, type WorkflowDraft } from "@/lib/workflow";
import { RemovedNotice } from "./removed-notice";
import { SampleTag } from "./sample-tag";
import { primaryButtonClass, secondaryButtonClass } from "./ui";

// The Ready state shows what will be compared, and nothing else. It holds no
// model output, no timing and no cost, because nothing has been run yet.

const PREVIEW_CHARS = 180;

function ModelRow({ role, model }: { role: string; model: string }) {
  return (
    <div>
      <dt className="text-sm text-muted">{role}</dt>
      <dd className="mt-1 font-mono text-sm text-ink">{model}</dd>
    </div>
  );
}

export function ReadyPanel({
  draft,
  sample,
  removedCount,
  onEdit,
  onCompare,
}: {
  draft: WorkflowDraft;
  sample: SampleWorkflow;
  // How many outputs this edit of the draft removed from the comparison.
  removedCount: number;
  onEdit: () => void;
  onCompare: () => void;
}) {
  return (
    <section
      aria-labelledby="ready-heading"
      className="border border-line p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="ready-heading" className="font-display text-2xl font-medium">
          Ready to compare
        </h2>
        <button
          type="button"
          onClick={onEdit}
          className={secondaryButtonClass}
        >
          Edit
        </button>
      </div>
      <RemovedNotice count={removedCount} />

      <h3 className="mt-5 text-sm font-medium text-muted">Your prompt</h3>
      <p className="mt-2 whitespace-pre-wrap bg-soft p-3 text-sm">
        {draft.prompt}
      </p>

      <h3 className="mt-5 text-sm font-medium text-muted">Inputs (3)</h3>
      <ol className="mt-2 grid gap-3 sm:grid-cols-3">
        {draft.inputs.map((input, index) => {
          const sampleOf = sampleLabel(sample, input);
          return (
            <li
              key={index}
              className="border border-line p-3 text-sm"
            >
              <span className="font-medium">{index + 1}</span>
              {sampleOf !== null && <SampleTag label={sampleOf} />}
              <p className="mt-1 whitespace-pre-wrap text-ink">
                {preview(input, PREVIEW_CHARS)}
              </p>
              <p className="mt-2 text-xs text-muted">
                {input.length.toLocaleString("en-US")} characters
              </p>
            </li>
          );
        })}
      </ol>

      <dl className="mt-5 grid gap-3 sm:grid-cols-2">
        <ModelRow role="Model you use today" model={draft.currentModel} />
        <ModelRow role="Model to compare with" model={draft.candidateModel} />
      </dl>

      <div className="mt-5 flex justify-end border-t border-line pt-4">
        <button
          type="button"
          onClick={onCompare}
          className={primaryButtonClass}
        >
          Continue to compare
        </button>
      </div>
    </section>
  );
}
