"use client";

import { useState } from "react";
import type { ModelPrices } from "@/lib/cost-speed";
import { ComparisonView } from "./comparison-view";
import { ReadyPanel } from "./ready-panel";
import { SampleTag } from "./sample-tag";
import {
  capsClass,
  fieldClass,
  helperClass,
  invalidFieldClass,
  primaryButtonClass,
  problemClass,
  secondaryButtonClass,
} from "./ui";
import {
  emptyOutputs,
  emptyReviews,
  filledCount,
  outputsAfterDraftChange,
  reviewsAfterOutputChange,
  reviewsAfterOutputsReplaced,
  withNote,
  withOutput,
  withRating,
  type ModelSide,
  type PastedOutputs,
  type Rating,
  type Reviews,
} from "@/lib/comparison";
import {
  INPUT_COUNT,
  INPUT_MAX_CHARS,
  INPUT_PLACEHOLDER,
  draftFromSample,
  emptyDraft,
  findProblems,
  isComplete,
  sampleLabel,
  type DraftProblems,
  type ModelPair,
  type SampleWorkflow,
  type WorkflowDraft,
} from "@/lib/workflow";
import {
  canLoadSampleResults,
  outputsFromSampleResults,
  type SampleResults,
} from "@/lib/sample-results";

const labelClass = `block ${capsClass}`;

function fieldClasses(invalid: boolean) {
  return invalid ? `${fieldClass} ${invalidFieldClass}` : fieldClass;
}

function FieldProblem({ id, message }: { id: string; message: string | null }) {
  if (message === null) return null;
  return (
    <p id={id} role="alert" className={problemClass}>
      {message}
    </p>
  );
}

function InputField({
  position,
  value,
  problem,
  sampleOf,
  onChange,
}: {
  position: number;
  value: string;
  problem: string | null;
  sampleOf: string | null;
  onChange: (value: string) => void;
}) {
  const fieldId = `input-${position}`;
  const problemId = `${fieldId}-problem`;
  const countId = `${fieldId}-count`;
  const over = value.length > INPUT_MAX_CHARS;

  return (
    <div>
      <label htmlFor={fieldId} className={labelClass}>
        Input {position}
        {sampleOf !== null && <SampleTag label={sampleOf} />}
      </label>
      <textarea
        id={fieldId}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={8}
        aria-invalid={problem !== null}
        aria-describedby={problem === null ? countId : `${problemId} ${countId}`}
        className={`${fieldClasses(problem !== null)} font-mono`}
      />
      <p
        id={countId}
        className={
          over
            ? "mt-1 text-xs font-bold text-ink"
            : "mt-1 text-xs text-muted"
        }
      >
        {value.length} / {INPUT_MAX_CHARS}
      </p>
      <FieldProblem id={problemId} message={problem} />
    </div>
  );
}

function ModelPicker({
  id,
  label,
  value,
  candidates,
  invalid,
  describedBy,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  candidates: string[];
  invalid: boolean;
  describedBy: string | undefined;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        className={`${fieldClasses(invalid)} font-mono`}
      >
        {candidates.map((candidate) => (
          <option key={candidate} value={candidate}>
            {candidate}
          </option>
        ))}
      </select>
    </div>
  );
}

// Which screen is showing. The draft, the pasted outputs and the person's
// ratings and notes live above all three, so moving between them loses nothing.
type Step = "form" | "ready" | "compare";

// A configured default that is not on the candidate list would leave a picker
// blank, so fall back to the first candidate rather than show nothing.
function pick(candidates: string[], preferred: string) {
  return candidates.includes(preferred) ? preferred : candidates[0];
}

export function WorkflowForm({
  candidates,
  defaultPair,
  sample,
  sampleResults,
  modelPrices,
}: {
  candidates: string[];
  defaultPair: ModelPair;
  sample: SampleWorkflow;
  sampleResults: SampleResults | null;
  modelPrices: ModelPrices | null;
}) {
  const currentDefault = pick(candidates, defaultPair.current);
  const candidateDefault = pick(candidates, defaultPair.candidate);
  const [draft, setDraft] = useState<WorkflowDraft>(() =>
    emptyDraft(currentDefault, candidateDefault),
  );
  // Refusals appear only after the person has pressed Continue once, then stay
  // live while they fix things. Pressing Continue never runs a model.
  const [attempted, setAttempted] = useState(false);
  const [step, setStep] = useState<Step>("form");
  const [outputs, setOutputs] = useState<PastedOutputs>(() => emptyOutputs(INPUT_COUNT));
  const [reviews, setReviews] = useState<Reviews>(() => emptyReviews(INPUT_COUNT));
  // The draft the outputs in the table belong to: the one last continued with.
  // null until the first Continue, when the table is still empty.
  const [comparedDraft, setComparedDraft] = useState<WorkflowDraft | null>(null);
  // How many outputs the last Continue removed, for the notice on the next screens.
  const [removedCount, setRemovedCount] = useState(0);

  const problems = findProblems(draft);
  const shown: DraftProblems | null = attempted ? problems : null;

  function updatePrompt(prompt: string) {
    setDraft((current) => ({ ...current, prompt }));
  }

  function updateInput(index: number, value: string) {
    setDraft((current) => ({
      ...current,
      inputs: current.inputs.map((input, position) => (position === index ? value : input)),
    }));
  }

  function fillFromSample() {
    setDraft(draftFromSample(sample, currentDefault, candidateDefault));
    setAttempted(false);
  }

  // Outputs stay only under the prompt, input and model they were produced
  // with. Checked on Continue, not on every keystroke, so a change that is
  // undone before continuing removes nothing.
  function dropOutputsOfChangedDraft(before: WorkflowDraft) {
    const kept = outputsAfterDraftChange(outputs, before, draft);
    setRemovedCount(filledCount(outputs) - filledCount(kept));
    setReviews((current) => reviewsAfterOutputsReplaced(current, outputs, kept));
    setOutputs(kept);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAttempted(true);
    if (!isComplete(problems)) return;
    if (comparedDraft !== null) dropOutputsOfChangedDraft(comparedDraft);
    setComparedDraft(draft);
    setStep("ready");
  }

  function updateOutput(inputIndex: number, side: ModelSide, value: string) {
    // The review is cleared against the outputs as they are before this change.
    setReviews((current) => reviewsAfterOutputChange(current, outputs, inputIndex, side, value));
    setOutputs((current) => withOutput(current, inputIndex, side, value));
    setRemovedCount(0);
  }

  // Offered only while the draft is the unchanged sample workflow on the pair
  // the saved run used, so saved outputs never sit under other inputs or models.
  function loadSampleResults() {
    if (sampleResults === null) return;
    const loaded = outputsFromSampleResults(sampleResults);
    setReviews((current) => reviewsAfterOutputsReplaced(current, outputs, loaded));
    setOutputs(loaded);
    setRemovedCount(0);
  }

  function updateRating(inputIndex: number, side: ModelSide, rating: Rating) {
    setReviews((current) => withRating(current, inputIndex, side, rating));
  }

  function updateNote(inputIndex: number, side: ModelSide, note: string) {
    setReviews((current) => withNote(current, inputIndex, side, note));
  }

  if (step === "ready") {
    return (
      <ReadyPanel
        draft={draft}
        sample={sample}
        removedCount={removedCount}
        onEdit={() => setStep("form")}
        onCompare={() => setStep("compare")}
      />
    );
  }

  if (step === "compare") {
    return (
      <ComparisonView
        draft={draft}
        sample={sample}
        outputs={outputs}
        reviews={reviews}
        sampleResults={sampleResults}
        modelPrices={modelPrices}
        removedCount={removedCount}
        onLoadSampleResults={
          canLoadSampleResults(draft, sample, sampleResults) ? loadSampleResults : null
        }
        onOutputChange={updateOutput}
        onRatingChange={updateRating}
        onNoteChange={updateNote}
        onBack={() => setStep("ready")}
      />
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div>
        <label htmlFor="prompt" className={labelClass}>
          Your prompt
        </label>
        <p className={helperClass}>
          Use <code className="font-mono">{INPUT_PLACEHOLDER}</code> where the real input goes
        </p>
        <textarea
          id="prompt"
          value={draft.prompt}
          onChange={(event) => updatePrompt(event.target.value)}
          rows={8}
          aria-invalid={shown?.prompt != null}
          aria-describedby={shown?.prompt == null ? undefined : "prompt-problem"}
          className={`${fieldClasses(shown?.prompt != null)} font-mono`}
        />
        <FieldProblem id="prompt-problem" message={shown?.prompt ?? null} />
      </div>

      <fieldset className="mt-8">
        <legend className={labelClass}>Inputs (3)</legend>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <p className={helperClass}>
            Up to {INPUT_MAX_CHARS.toLocaleString("en-US")} characters each
          </p>
          <button type="button" onClick={fillFromSample} className={secondaryButtonClass}>
            Use sample workflow
          </button>
        </div>
        <div className="mt-3 grid gap-5 sm:grid-cols-3">
          {draft.inputs.map((input, index) => (
            <InputField
              key={index}
              position={index + 1}
              value={input}
              problem={shown?.inputs[index] ?? null}
              sampleOf={sampleLabel(sample, input)}
              onChange={(value) => updateInput(index, value)}
            />
          ))}
        </div>
      </fieldset>

      <div className="mt-8 grid gap-5 sm:grid-cols-2">
        <ModelPicker
          id="current-model"
          label="Model you use today"
          value={draft.currentModel}
          candidates={candidates}
          invalid={shown?.models != null}
          describedBy={shown?.models == null ? undefined : "models-problem"}
          onChange={(currentModel) => setDraft((current) => ({ ...current, currentModel }))}
        />
        <ModelPicker
          id="candidate-model"
          label="Model to compare with"
          value={draft.candidateModel}
          candidates={candidates}
          invalid={shown?.models != null}
          describedBy={shown?.models == null ? undefined : "models-problem"}
          onChange={(candidateModel) => setDraft((current) => ({ ...current, candidateModel }))}
        />
      </div>
      <FieldProblem id="models-problem" message={shown?.models ?? null} />

      <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-5">
        <p className="text-sm text-muted">
          Nothing is saved unless you choose to share the result.
        </p>
        <button
          type="submit"
          className={primaryButtonClass}
        >
          Continue
        </button>
      </div>
    </form>
  );
}
