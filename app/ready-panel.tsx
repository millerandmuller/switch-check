import { preview, sampleLabel, type SampleWorkflow, type WorkflowDraft } from "@/lib/workflow";
import { RemovedNotice } from "./removed-notice";
import { SampleTag } from "./sample-tag";

// The Ready state shows what will be compared, and nothing else. It holds no
// model output, no timing and no cost, because nothing has been run yet.

const PREVIEW_CHARS = 180;

function ModelRow({ role, model }: { role: string; model: string }) {
  return (
    <div>
      <dt className="text-sm text-zinc-600 dark:text-zinc-400">{role}</dt>
      <dd className="mt-1 font-mono text-sm text-zinc-900 dark:text-zinc-100">{model}</dd>
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
      className="rounded-lg border border-zinc-300 p-5 dark:border-zinc-700"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="ready-heading" className="text-xl font-semibold tracking-tight">
          Ready to compare
        </h2>
        <button
          type="button"
          onClick={onEdit}
          className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          Edit
        </button>
      </div>
      <RemovedNotice count={removedCount} />

      <h3 className="mt-5 text-sm font-medium text-zinc-600 dark:text-zinc-400">Your prompt</h3>
      <p className="mt-2 whitespace-pre-wrap rounded-md bg-zinc-100 p-3 text-sm dark:bg-zinc-900">
        {draft.prompt}
      </p>

      <h3 className="mt-5 text-sm font-medium text-zinc-600 dark:text-zinc-400">Inputs (3)</h3>
      <ol className="mt-2 grid gap-3 sm:grid-cols-3">
        {draft.inputs.map((input, index) => {
          const sampleOf = sampleLabel(sample, input);
          return (
            <li
              key={index}
              className="rounded-md border border-zinc-200 p-3 text-sm dark:border-zinc-800"
            >
              <span className="font-medium">{index + 1}</span>
              {sampleOf !== null && <SampleTag label={sampleOf} />}
              <p className="mt-1 whitespace-pre-wrap text-zinc-700 dark:text-zinc-300">
                {preview(input, PREVIEW_CHARS)}
              </p>
              <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-500">
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

      <div className="mt-5 flex justify-end border-t border-zinc-200 pt-4 dark:border-zinc-800">
        <button
          type="button"
          onClick={onCompare}
          className="rounded-md bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          Continue to compare
        </button>
      </div>
    </section>
  );
}
