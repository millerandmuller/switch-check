"use client";

import { useEffect, useRef, useState } from "react";
import {
  MODEL_SIDES,
  cellCount,
  filledCount,
  modelFor,
  type ModelSide,
  type PastedOutputs,
} from "@/lib/comparison";
import { sampleRunCell, type SampleResults } from "@/lib/sample-results";
import {
  filledPrompt,
  preview,
  sampleLabel,
  type SampleWorkflow,
  type WorkflowDraft,
} from "@/lib/workflow";
import { RemovedNotice } from "./removed-notice";
import { SampleTag } from "./sample-tag";
import { capsClass, fieldClass, secondaryButtonClass } from "./ui";

// Step 4: getting both models' outputs, as six tasks in a fixed order. The
// person runs each prompt in their own tool and pastes what came back. This
// page runs nothing.

export const SIDE_ROLES: Record<ModelSide, string> = {
  current: "Model you use today",
  candidate: "Model to compare with",
};

const INPUT_PREVIEW_CHARS = 140;

// The key of one cell, for the list of cells whose review an edit removed.
export function cellKey(inputIndex: number, side: ModelSide): string {
  return `${inputIndex}-${side}`;
}

type CopyState = "copied" | "refused";

function OutputTask({
  taskNumber,
  taskCount,
  inputIndex,
  side,
  model,
  prompt,
  input,
  sampleOf,
  output,
  sampleRunOn,
  reviewCleared,
  onOutputChange,
}: {
  taskNumber: number;
  taskCount: number;
  inputIndex: number;
  side: ModelSide;
  model: string;
  prompt: string;
  input: string;
  // The label of the sample email this input still is, or null.
  sampleOf: string | null;
  output: string;
  // The run date while the box still holds what the saved run returned.
  sampleRunOn: string | null;
  // An edit of this output removed its rating or note.
  reviewCleared: boolean;
  onOutputChange: (value: string) => void;
}) {
  const [copyState, setCopyState] = useState<CopyState | null>(null);
  // When copying is refused, the text appears already selected.
  const byHandRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (copyState !== "refused") return;
    byHandRef.current?.focus();
    byHandRef.current?.select();
  }, [copyState]);
  const position = inputIndex + 1;
  const boxId = `output-${position}-${side}`;
  const filled = filledPrompt(prompt, input);

  async function copy() {
    try {
      await navigator.clipboard.writeText(filled);
      setCopyState("copied");
    } catch {
      // The browser refused (no permission, or not a secure page): show the
      // text so it can be copied by hand.
      setCopyState("refused");
    }
  }

  return (
    <article className="min-w-0 border border-line p-5 focus-within:border-ink focus-within:shadow-focus">
      <p className={`${capsClass} text-gold-text`}>
        Task {taskNumber} of {taskCount}
      </p>
      <h3 className="mt-1 font-caps text-[1.05rem] font-medium">
        Input {position} on the {SIDE_ROLES[side].toLowerCase()}
      </h3>
      <p className="mt-1 font-mono text-[12.5px] [overflow-wrap:anywhere]">{model}</p>
      <p className="mt-2 text-sm text-muted [overflow-wrap:anywhere]">
        {preview(input, INPUT_PREVIEW_CHARS)}
        {sampleOf !== null && <SampleTag label={sampleOf} />}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" onClick={copy} className={secondaryButtonClass}>
          Copy the filled-in prompt
        </button>
        <span role="status" className="text-sm font-bold">
          {copyState === "copied" ? "Copied" : ""}
        </span>
      </div>
      {copyState === "refused" && (
        <div className="mt-3">
          <label htmlFor={`${boxId}-prompt`} className="text-sm font-bold">
            The browser did not allow copying. Copy this text by hand.
          </label>
          <textarea
            id={`${boxId}-prompt`}
            ref={byHandRef}
            readOnly
            rows={6}
            value={filled}
            onFocus={(event) => event.target.select()}
            className={`${fieldClass} font-mono text-[13px]`}
          />
        </div>
      )}
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-muted">Read the filled-in prompt</summary>
        <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap border border-line bg-soft p-3 font-mono text-[12.5px] [overflow-wrap:anywhere]">
          {filled}
        </pre>
      </details>

      <label htmlFor={boxId} className={`mt-4 block ${capsClass}`}>
        Paste what the model returned
        {sampleRunOn !== null && (
          <span className="ml-2 text-gold-text">sample run · {sampleRunOn}</span>
        )}
      </label>
      <textarea
        id={boxId}
        value={output}
        onChange={(event) => onOutputChange(event.target.value)}
        rows={7}
        className={`${fieldClass} font-mono text-[13px]`}
      />
      {reviewCleared && (
        <p role="status" className="mt-1 text-sm font-bold">
          Your rating and note on this output were removed, because its text changed.
        </p>
      )}
    </article>
  );
}

export function OutputsStep({
  draft,
  sample,
  outputs,
  sampleResults,
  removedCount,
  clearedCells,
  notOfferedReason,
  onLoadSampleResults,
  onOutputChange,
}: {
  draft: WorkflowDraft;
  sample: SampleWorkflow;
  outputs: PastedOutputs;
  sampleResults: SampleResults | null;
  // How many outputs the last edit of the draft removed.
  removedCount: number;
  // Cells whose rating or note was removed because their text was edited.
  clearedCells: string[];
  // Why the saved sample results are not offered for this draft, or null.
  notOfferedReason: string | null;
  // null when the saved sample results do not belong to this draft.
  onLoadSampleResults: (() => void) | null;
  onOutputChange: (inputIndex: number, side: ModelSide, value: string) => void;
}) {
  const total = cellCount(outputs);
  const filled = filledCount(outputs);
  const runDate = (inputIndex: number, side: ModelSide) =>
    sampleRunCell(sampleResults, inputIndex, side, outputs[inputIndex][side]) === null
      ? null
      : (sampleResults?.run_date ?? null);
  const anyFromSampleRun = outputs.some((_, index) =>
    MODEL_SIDES.some((side) => runDate(index, side) !== null),
  );

  return (
    <section aria-label="Outputs of both models">
      <RemovedNotice count={removedCount} />

      {/* Where the outputs come from. Today that is the person's own tools,
          plus the saved run for the sample. This block is the one place for
          any other way of getting them. */}
      <div className="mt-6 border border-line bg-soft p-5">
        <p className={capsClass}>Where the outputs come from</p>
        <p className="mt-2 max-w-[72ch]">
          You run each prompt in your own tool for that model, then paste what it returned here.
          Copy the filled-in prompt of a task, run it there, and paste the whole answer into the
          box.
        </p>
        {onLoadSampleResults !== null && sampleResults !== null && (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="button" onClick={onLoadSampleResults} className={secondaryButtonClass}>
              Load sample results
            </button>
            <p className="text-sm text-muted">
              Real outputs from one run of this sample on {sampleResults.run_date}.
            </p>
          </div>
        )}
        {notOfferedReason !== null && <p className="mt-3 text-sm text-muted">{notOfferedReason}</p>}
      </div>

      <p aria-live="polite" className="mt-6 font-bold">
        {filled} of {total} {anyFromSampleRun ? "filled" : "pasted"}
      </p>

      <div className="mt-3 grid gap-5 wide:grid-cols-2">
        {draft.inputs.flatMap((input, inputIndex) =>
          MODEL_SIDES.map((side, sideIndex) => (
            <OutputTask
              key={cellKey(inputIndex, side)}
              taskNumber={inputIndex * MODEL_SIDES.length + sideIndex + 1}
              taskCount={total}
              inputIndex={inputIndex}
              side={side}
              model={modelFor(draft, side)}
              prompt={draft.prompt}
              input={input}
              sampleOf={sampleLabel(sample, input)}
              output={outputs[inputIndex][side]}
              sampleRunOn={runDate(inputIndex, side)}
              reviewCleared={clearedCells.includes(cellKey(inputIndex, side))}
              onOutputChange={(value) => onOutputChange(inputIndex, side, value)}
            />
          )),
        )}
      </div>
    </section>
  );
}
