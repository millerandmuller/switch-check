"use client";

import { useState } from "react";
import { ComparisonView } from "./comparison-view";
import { ReadyPanel } from "./ready-panel";
import { SampleTag } from "./sample-tag";
import {
  emptyOutputs,
  emptyReviews,
  reviewsAfterOutputChange,
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

const labelClass = "block text-sm font-medium";
const helperClass = "mt-1 text-sm text-zinc-600 dark:text-zinc-400";
const fieldClass =
  "mt-2 w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:focus:border-zinc-400";
const invalidFieldClass = "border-red-600 dark:border-red-500";

function fieldClasses(invalid: boolean) {
  return invalid ? `${fieldClass} ${invalidFieldClass}` : fieldClass;
}

const secondaryButtonClass =
  "rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900";

function FieldProblem({ id, message }: { id: string; message: string | null }) {
  if (message === null) return null;
  return (
    <p id={id} role="alert" className="mt-2 text-sm text-red-700 dark:text-red-400">
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
            ? "mt-1 text-xs text-red-700 dark:text-red-400"
            : "mt-1 text-xs text-zinc-500 dark:text-zinc-500"
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
}: {
  candidates: string[];
  defaultPair: ModelPair;
  sample: SampleWorkflow;
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

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAttempted(true);
    if (isComplete(problems)) setStep("ready");
  }

  function updateOutput(inputIndex: number, side: ModelSide, value: string) {
    // The review is cleared against the outputs as they are before this change.
    setReviews((current) => reviewsAfterOutputChange(current, outputs, inputIndex, side, value));
    setOutputs((current) => withOutput(current, inputIndex, side, value));
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

      <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-zinc-200 pt-5 dark:border-zinc-800">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Nothing is saved unless you choose to share the result.
        </p>
        <button
          type="submit"
          className="rounded-md bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          Continue
        </button>
      </div>
    </form>
  );
}
