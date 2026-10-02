"use client";

import { useState } from "react";
import {
  MODEL_SIDES,
  cellCount,
  cellState,
  filledCount,
  type ModelSide,
  type PastedOutputs,
} from "@/lib/comparison";
import { preview, sampleLabel, type SampleWorkflow, type WorkflowDraft } from "@/lib/workflow";
import { SampleTag } from "./sample-tag";

// The comparison table, filled by hand. Nothing is run here: no model is
// called, and the table shows only what the person pasted. Speed and cost are
// not on this screen because nobody measured them.

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

function modelFor(draft: WorkflowDraft, side: ModelSide) {
  return side === "current" ? draft.currentModel : draft.candidateModel;
}

// Marks an output that was pasted by hand, so it is never confused with one
// the tool fetched itself once a live runner exists.
function PastedTag() {
  return (
    <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-sky-900 dark:bg-sky-950 dark:text-sky-200">
      pasted
    </span>
  );
}

function ReadOnlyCell({ output }: { output: string }) {
  if (cellState(output) === "not tested") {
    return <p className="text-sm italic text-zinc-500 dark:text-zinc-500">not tested</p>;
  }
  return (
    <>
      <PastedTag />
      <p className="mt-2 whitespace-pre-wrap text-sm [overflow-wrap:anywhere]">{output}</p>
    </>
  );
}

export function ComparisonView({
  draft,
  sample,
  outputs,
  onOutputChange,
  onBack,
}: {
  draft: WorkflowDraft;
  sample: SampleWorkflow;
  outputs: PastedOutputs;
  onOutputChange: (inputIndex: number, side: ModelSide, value: string) => void;
  onBack: () => void;
}) {
  const [showing, setShowing] = useState(false);
  // The refusal appears only after Show comparison was pressed on an empty
  // table, and goes away by itself once anything is pasted.
  const [attempted, setAttempted] = useState(false);

  const filled = filledCount(outputs);
  const refused = attempted && filled === 0;

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
      <p aria-live="polite" className="mt-4 text-sm font-medium">
        {filled} of {cellCount(outputs)} outputs pasted
      </p>

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
                </th>
                {MODEL_SIDES.map((side) => (
                  <td key={side} className={cellClass}>
                    {showing ? (
                      <ReadOnlyCell output={outputs[index][side]} />
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
