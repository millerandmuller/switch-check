"use client";

import { useEffect, useRef, useState } from "react";
import {
  MODEL_SIDES,
  cellCount,
  emptyOutputs,
  emptyReviews,
  filledCount,
  outputsAfterDraftChange,
  reviewsAfterOutputChange,
  removalOnDraftChange,
  reviewsAfterOutputsReplaced,
  rowResult,
  withNote,
  withOutput,
  withRating,
  type ModelSide,
  type PastedOutputs,
  type Rating,
  type Reviews,
} from "@/lib/comparison";
import type { ModelPrices } from "@/lib/cost-speed";
import { hasTypedDraft, isReachable, stepsInBar, type FlowFacts, type StepId } from "@/lib/flow";
import {
  canLoadSampleResults,
  outputsFromSampleResults,
  sampleRunCell,
  type SampleResults,
} from "@/lib/sample-results";
import {
  INPUT_COUNT,
  draftFromSample,
  emptyDraft,
  findProblems,
  sampleLabel,
  type ModelPair,
  type SampleWorkflow,
  type WorkflowDraft,
} from "@/lib/workflow";
import { AskFirst } from "./ask-first";
import { InputsStep } from "./inputs-step";
import { OutputsStep, cellKey } from "./outputs-step";
import { RateStep } from "./rate-step";
import { ResultStep, type Decision } from "./result-step";
import { SetupStep } from "./setup-step";
import { StartStep } from "./start-step";
import { StepBar } from "./step-bar";
import { StepHeading } from "./step-heading";
import { RemovalWarning, plural, removalSentence } from "./removal-warning";
import { primaryButtonClass, problemClass, secondaryButtonClass } from "./ui";

// A configured default that is not on the candidate list would leave a picker
// blank, so fall back to the first candidate rather than show nothing.
function pick(candidates: string[], preferred: string) {
  return candidates.includes(preferred) ? preferred : candidates[0];
}

// An action that would replace or remove the person's work, waiting for their
// answer. Each one is asked about in the page before anything changes.
type Pending = "see example" | "empty draft" | "use sample" | "load results" | "new comparison";

const QUESTIONS: Record<Pending, { question: string; replaceLabel: string; keepLabel: string }> = {
  "see example": {
    question:
      "Opening the example replaces your prompt, your inputs, your outputs and your ratings with the sample.",
    replaceLabel: "Replace my work with the example",
    keepLabel: "Keep mine",
  },
  "empty draft": {
    question: "Starting on your own prompt empties the prompt, the inputs, the outputs and the ratings.",
    replaceLabel: "Empty everything",
    keepLabel: "Keep mine",
  },
  "use sample": {
    question: "The sample workflow replaces the prompt, the three inputs and both models you chose.",
    replaceLabel: "Replace my draft",
    keepLabel: "Keep mine",
  },
  "new comparison": {
    question:
      "Starting a new comparison empties the prompt, the inputs, the outputs, the ratings and your decision.",
    replaceLabel: "Empty everything",
    keepLabel: "Keep mine",
  },
  "load results": {
    question:
      "Loading the sample results replaces the outputs you pasted, and removes the ratings and notes on them.",
    replaceLabel: "Replace my outputs",
    keepLabel: "Keep mine",
  },
};

const STEP_TITLES: Record<StepId, { title: string; job: string }> = {
  start: {
    title: "Should you switch models?",
    job: "Compare the model you use today with a newer one on your own prompt and three inputs. For now you run both models yourself and paste what they returned. Switch Check puts the outputs side by side and counts your ratings. The decision stays yours: switch, stay, or test more.",
  },
  setup: {
    title: "Prompt and models",
    job: "Paste the prompt you already use and pick the two models: the one you use today and the one to compare it with.",
  },
  inputs: {
    title: "Inputs",
    job: "Add three real inputs. Each one is put into the prompt in place of {input}, so both models read exactly the same thing.",
  },
  outputs: {
    title: "Outputs",
    job: "Get both models' outputs for all three inputs, one task at a time. Nothing is run from this page.",
  },
  rate: {
    title: "Rate and result",
    job: "Read each output and rate it. The line above counts your ratings and nothing else.",
  },
};

// The whole guided flow. The draft, the outputs and the person's ratings and
// notes live here, above all five steps, so moving between steps loses
// nothing. Nothing is saved anywhere: a reload empties the page.
export function FlowShell({
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

  const [step, setStep] = useState<StepId>("start");
  const [draft, setDraft] = useState<WorkflowDraft>(() =>
    emptyDraft(currentDefault, candidateDefault),
  );
  const [outputs, setOutputs] = useState<PastedOutputs>(() => emptyOutputs(INPUT_COUNT));
  const [reviews, setReviews] = useState<Reviews>(() => emptyReviews(INPUT_COUNT));
  // The draft the outputs belong to: the one the outputs step was last opened
  // with. null until then, when there are no outputs yet.
  const [comparedDraft, setComparedDraft] = useState<WorkflowDraft | null>(null);
  // How many outputs the last change of the draft removed, for the notice.
  const [removedCount, setRemovedCount] = useState(0);
  // Refusals appear only after the step's main button was pressed once, then
  // stay live while the person fixes things.
  const [attempted, setAttempted] = useState<StepId[]>([]);
  const [pending, setPending] = useState<Pending | null>(null);
  // Cells whose rating or note an edit of the output removed (see cellKey).
  const [clearedCells, setClearedCells] = useState<string[]>([]);
  // The result screen is the second half of the last step.
  const [showResult, setShowResult] = useState(false);
  // The input on show on the rating screen, kept when the result screen is
  // opened, so Back to rating returns to the input the person left.
  const [ratingInput, setRatingInput] = useState(0);
  // Steps whose content came with the example and that the person has not
  // gone through themselves. The step bar says so instead of "done".
  const [exampleSteps, setExampleSteps] = useState<StepId[]>([]);
  // The person's own decision on the result screen. Never preselected, never
  // saved or sent.
  const [decision, setDecision] = useState<Decision | null>(null);

  const problems = findProblems(draft);
  const facts: FlowFacts = {
    problems,
    filledOutputs: filledCount(outputs),
    rowResults: outputs.map((pair, index) => rowResult(pair, reviews[index])),
  };
  const filled = facts.filledOutputs;
  const total = cellCount(outputs);
  // What continuing would remove right now: nothing until the outputs step was
  // opened once, and nothing while the draft is the one the outputs belong to.
  const noRemoval = { outputs: 0, ratings: 0 };
  const removal =
    comparedDraft === null ? noRemoval : removalOnDraftChange(outputs, reviews, comparedDraft, draft);
  const continueLabel = (label: string) =>
    removal.outputs === 0 ? label : `Continue and remove ${plural(removal.outputs, "output")}`;

  // Focus follows the step: after each change it sits on the new heading.
  const headingRef = useRef<HTMLHeadingElement>(null);
  const screen = showResult ? "result" : step;
  const focusedScreen = useRef(screen);
  useEffect(() => {
    if (focusedScreen.current === screen) return;
    focusedScreen.current = screen;
    headingRef.current?.focus();
    window.scrollTo(0, 0);
  }, [screen]);

  // Outputs stay only under the prompt, input and model they were produced
  // with. Checked when the outputs or the rating step is opened, not on every
  // keystroke, so a change that is undone before then removes nothing.
  function dropOutputsOfChangedDraft(before: WorkflowDraft) {
    const kept = outputsAfterDraftChange(outputs, before, draft);
    setRemovedCount(filledCount(outputs) - filledCount(kept));
    setReviews((current) => reviewsAfterOutputsReplaced(current, outputs, kept));
    setOutputs(kept);
    return kept;
  }

  function open(target: StepId) {
    if (!isReachable(target, facts)) return;
    if (target === "outputs" || target === "rate") {
      const kept = comparedDraft === null ? outputs : dropOutputsOfChangedDraft(comparedDraft);
      setComparedDraft(draft);
      // The removal may have left nothing to rate: then stop at the outputs.
      if (target === "rate" && filledCount(kept) === 0) {
        setStep("outputs");
        return;
      }
    }
    setPending(null);
    setShowResult(false);
    setStep(target);
  }

  // The main button of a step: show what is wrong, or go on.
  function continueTo(target: StepId) {
    setAttempted((current) => (current.includes(step) ? current : [...current, step]));
    setExampleSteps((current) => current.filter((id) => id !== step));
    open(target);
  }

  function replaceEverything(nextDraft: WorkflowDraft, nextOutputs: PastedOutputs) {
    setDraft(nextDraft);
    setOutputs(nextOutputs);
    setReviews(emptyReviews(INPUT_COUNT));
    setComparedDraft(filledCount(nextOutputs) > 0 ? nextDraft : null);
    setRemovedCount(0);
    setAttempted([]);
    setClearedCells([]);
    setShowResult(false);
    setDecision(null);
    setRatingInput(0);
    setExampleSteps([]);
  }

  const hasWork = hasTypedDraft(draft, sample) || pastedCount() > 0 || ratedCount() > 0;

  // Outputs the person pasted or edited themselves: filled cells that do not
  // hold exactly what the saved run returned.
  function pastedCount() {
    return outputs.reduce(
      (count, pair, index) =>
        count +
        MODEL_SIDES.filter(
          (side) =>
            pair[side].trim() !== "" && sampleRunCell(sampleResults, index, side, pair[side]) === null,
        ).length,
      0,
    );
  }

  function ratedCount() {
    return reviews.reduce(
      (count, pair) =>
        count + MODEL_SIDES.filter((side) => pair[side].rating !== null || pair[side].note !== "").length,
      0,
    );
  }

  // See a finished example: the sample workflow on the pair the saved run
  // used, with that run's outputs and nothing rated.
  function seeExample() {
    if (sampleResults === null) {
      replaceEverything(draftFromSample(sample, currentDefault, candidateDefault), emptyOutputs(INPUT_COUNT));
      setExampleSteps(["setup", "inputs"]);
      setStep("outputs");
      return;
    }
    const exampleDraft = draftFromSample(
      sample,
      sampleResults.models.current,
      sampleResults.models.candidate,
    );
    replaceEverything(exampleDraft, outputsFromSampleResults(sampleResults));
    setExampleSteps(["setup", "inputs", "outputs"]);
    setStep("rate");
  }

  function startOwnPrompt() {
    replaceEverything(emptyDraft(currentDefault, candidateDefault), emptyOutputs(INPUT_COUNT));
    setStep("setup");
  }

  function startNewComparison() {
    replaceEverything(emptyDraft(currentDefault, candidateDefault), emptyOutputs(INPUT_COUNT));
    setStep("start");
  }

  function fillFromSample() {
    setDraft(draftFromSample(sample, currentDefault, candidateDefault));
    setAttempted([]);
  }

  // Offered only while the draft is the unchanged sample workflow on the pair
  // the saved run used, so saved outputs never sit under other inputs or models.
  function loadSampleResults() {
    if (sampleResults === null) return;
    const loaded = outputsFromSampleResults(sampleResults);
    setReviews((current) => reviewsAfterOutputsReplaced(current, outputs, loaded));
    setOutputs(loaded);
    setRemovedCount(0);
    setClearedCells([]);
  }

  // "Undo my change" puts back the fields of this step that the outputs were
  // made with. Only the draft changes; no output was removed yet.
  function undoSetupChange() {
    if (comparedDraft === null) return;
    setDraft((current) => ({
      ...current,
      prompt: comparedDraft.prompt,
      currentModel: comparedDraft.currentModel,
      candidateModel: comparedDraft.candidateModel,
    }));
  }

  function undoInputsChange() {
    if (comparedDraft === null) return;
    setDraft((current) => ({ ...current, inputs: comparedDraft.inputs }));
  }

  const actions: Record<Pending, () => void> = {
    "see example": seeExample,
    "empty draft": startOwnPrompt,
    "use sample": fillFromSample,
    "load results": loadSampleResults,
    "new comparison": startNewComparison,
  };

  // Runs the action at once when it loses nothing, and asks first otherwise.
  function askOrDo(action: Pending, losesWork: boolean) {
    if (losesWork) {
      setPending(action);
      return;
    }
    actions[action]();
  }

  function answer(replace: boolean) {
    const action = pending;
    setPending(null);
    if (action === null) return;
    // The question goes away with its buttons, so focus returns to the heading.
    headingRef.current?.focus();
    if (replace) {
      actions[action]();
      return;
    }
    // Keeping the work on Start still moves on: into the comparison as it is.
    if (action === "empty draft") setStep("setup");
  }

  function updateOutput(inputIndex: number, side: ModelSide, value: string) {
    const review = reviews[inputIndex][side];
    const hadReview = review.rating !== null || review.note !== "";
    if (hadReview && outputs[inputIndex][side] !== value) {
      setClearedCells((current) => [...current, cellKey(inputIndex, side)]);
    }
    // The review is cleared against the outputs as they are before this change.
    setReviews((current) => reviewsAfterOutputChange(current, outputs, inputIndex, side, value));
    setOutputs((current) => withOutput(current, inputIndex, side, value));
    setRemovedCount(0);
  }

  function updateRating(inputIndex: number, side: ModelSide, rating: Rating) {
    setReviews((current) => withRating(current, inputIndex, side, rating));
    setClearedCells((current) => current.filter((key) => key !== cellKey(inputIndex, side)));
  }

  function updateNote(inputIndex: number, side: ModelSide, note: string) {
    setReviews((current) => withNote(current, inputIndex, side, note));
  }

  const canLoad = canLoadSampleResults(draft, sample, sampleResults);
  // Said only to someone who is on the sample: for any other draft the saved
  // results were never on offer.
  const onSample =
    draft.prompt === sample.prompt || draft.inputs.some((input) => sampleLabel(sample, input) !== null);
  const notOfferedReason =
    sampleResults !== null && !canLoad && onSample
      ? `The saved sample results belong to the unchanged sample workflow on ${sampleResults.models.current} and ${sampleResults.models.candidate}, so they are not offered for this draft.`
      : null;

  const position = stepsInBar(step, facts).findIndex((entry) => entry.id === step) + 1;
  const shown = (id: StepId) => (attempted.includes(id) ? problems : null);
  const ask = pending === null ? null : QUESTIONS[pending];
  // The sample workflow also replaces what the outputs were made with, so it
  // names what that removes when the person continues.
  const sampleRemoval =
    comparedDraft === null
      ? noRemoval
      : removalOnDraftChange(
          outputs,
          reviews,
          comparedDraft,
          draftFromSample(sample, currentDefault, candidateDefault),
        );
  const askQuestion =
    ask === null
      ? ""
      : pending === "use sample" && sampleRemoval.outputs > 0
        ? `${ask.question} Continuing afterwards also removes ${removalSentence(sampleRemoval)}.`
        : ask.question;

  return (
    <div className={`ground flex min-h-dvh flex-col ${screen === "rate" ? "wide:h-dvh" : ""}`}>
      {/* Decoration only: the name also stands in the header. */}
      {screen === "start" && (
        <div aria-hidden className="wordmark-box">
          <div className="wordmark">Switch Check</div>
        </div>
      )}
      <header className={`relative flex flex-wrap items-center gap-x-7 gap-y-2 px-gutter wide:flex-nowrap ${screen === "rate" ? "py-1" : "py-3"}`}>
        <h1 className="whitespace-nowrap font-display text-[1.3rem] font-semibold tracking-[-0.01em]">
          Switch Check <span className="font-light text-muted">your call</span>
        </h1>
        <StepBar steps={stepsInBar(step, facts)} fromExample={exampleSteps} onOpen={open} />
        {screen !== "start" && screen !== "rate" && (
          <p className="text-[13px] leading-tight text-muted wide:ml-auto wide:max-w-[15rem] wide:text-right">
            Nothing is saved. Reloading this page empties it.
          </p>
        )}
      </header>

      {screen === "result" && (
        <main className="relative w-full flex-1 px-gutter pb-12 pt-4">
          <div className="panel p-[clamp(16px,2.4vw,34px)]">
          <ResultStep
            headingRef={headingRef}
            draft={draft}
            sample={sample}
            outputs={outputs}
            reviews={reviews}
            sampleResults={sampleResults}
            modelPrices={modelPrices}
            decision={decision}
            onDecide={setDecision}
            onBackToRating={() => setShowResult(false)}
            onRateInput={(index) => {
              setRatingInput(index);
              setShowResult(false);
            }}
            onStartNew={() => askOrDo("new comparison", true)}
          />
          {ask !== null && (
            <AskFirst
              question={askQuestion}
              replaceLabel={ask.replaceLabel}
              keepLabel={ask.keepLabel}
              onReplace={() => answer(true)}
              onKeep={() => answer(false)}
            />
          )}
          </div>
        </main>
      )}

      {screen === "rate" && (
        <>
          {ask !== null && (
            <div className="relative px-gutter pb-4">
              <AskFirst
                question={askQuestion}
                replaceLabel={ask.replaceLabel}
                keepLabel={ask.keepLabel}
                onReplace={() => answer(true)}
                onKeep={() => answer(false)}
              />
            </div>
          )}
          <RateStep
            headingRef={headingRef}
            draft={draft}
            sample={sample}
            outputs={outputs}
            reviews={reviews}
            sampleResults={sampleResults}
            modelPrices={modelPrices}
            removedCount={removedCount}
            clearedCells={clearedCells}
            onRatingChange={updateRating}
            onNoteChange={updateNote}
            selected={ratingInput}
            onSelect={setRatingInput}
            onSeeResult={() => setShowResult(true)}
          />
        </>
      )}

      {screen === "start" && (
        <main className="relative w-full flex-1 px-gutter pb-12 pt-4">
          <StartStep
            headingRef={headingRef}
            title={STEP_TITLES.start.title}
            job={STEP_TITLES.start.job}
            exampleRunDate={sampleResults?.run_date ?? null}
            onSeeExample={() => askOrDo("see example", hasWork)}
            onOwnPrompt={() => askOrDo("empty draft", hasWork)}
            ask={
              ask === null ? null : (
                <AskFirst
                  question={askQuestion}
                  replaceLabel={ask.replaceLabel}
                  keepLabel={ask.keepLabel}
                  onReplace={() => answer(true)}
                  onKeep={() => answer(false)}
                />
              )
            }
          />
        </main>
      )}

      {screen !== "rate" && screen !== "result" && screen !== "start" && (
      <main className="relative w-full flex-1 px-gutter pb-12 pt-4">
        <div className="panel p-[clamp(16px,2.4vw,34px)]">
        <StepHeading
          headingRef={headingRef}
          position={position}
          title={STEP_TITLES[step].title}
          job={STEP_TITLES[step].job}
        />
        {ask !== null && (
          <AskFirst
            question={askQuestion}
            replaceLabel={ask.replaceLabel}
            keepLabel={ask.keepLabel}
            onReplace={() => answer(true)}
            onKeep={() => answer(false)}
          />
        )}

        {step === "setup" && (
          <>
            <SetupStep
              draft={draft}
              problems={shown("setup")}
              candidates={candidates}
              onPromptChange={(prompt) => setDraft((current) => ({ ...current, prompt }))}
              onCurrentModelChange={(currentModel) =>
                setDraft((current) => ({ ...current, currentModel }))
              }
              onCandidateModelChange={(candidateModel) =>
                setDraft((current) => ({ ...current, candidateModel }))
              }
              onUseSample={() => askOrDo("use sample", hasTypedDraft(draft, sample))}
            />
            <StepFooter back={<BackButton label="Back to start" onClick={() => open("start")} />}>
              {removal.outputs > 0 && <RemovalWarning removal={removal} onUndo={undoSetupChange} />}
              <button type="button" onClick={() => continueTo("inputs")} className={primaryButtonClass}>
                {continueLabel("Continue to inputs")}
              </button>
            </StepFooter>
          </>
        )}

        {step === "inputs" && (
          <>
            <InputsStep
              draft={draft}
              problems={shown("inputs")}
              sample={sample}
              onInputChange={(index, value) =>
                setDraft((current) => ({
                  ...current,
                  inputs: current.inputs.map((input, at) => (at === index ? value : input)),
                }))
              }
            />
            <StepFooter back={<BackButton label="Back to prompt and models" onClick={() => open("setup")} />}>
              {removal.outputs > 0 && <RemovalWarning removal={removal} onUndo={undoInputsChange} />}
              <button type="button" onClick={() => continueTo("outputs")} className={primaryButtonClass}>
                {continueLabel("Continue to outputs")}
              </button>
            </StepFooter>
          </>
        )}

        {step === "outputs" && (
          <OutputsStep
            draft={draft}
            sample={sample}
            outputs={outputs}
            sampleResults={sampleResults}
            removedCount={removedCount}
            clearedCells={clearedCells}
            notOfferedReason={notOfferedReason}
            onLoadSampleResults={canLoad ? () => askOrDo("load results", pastedCount() > 0) : null}
            onOutputChange={updateOutput}
          />
        )}

        {step === "outputs" && (
          <StepFooter back={<BackButton label="Back to inputs" onClick={() => open("inputs")} />}>
            {attempted.includes("outputs") && filled === 0 && (
              <p role="alert" className={problemClass}>
                There is nothing to compare yet, so paste at least one output first.
              </p>
            )}
            {filled > 0 && filled < total && (
              <p className="text-sm text-muted">
                {total - filled} of {total} are empty and will read not tested.
              </p>
            )}
            <button type="button" onClick={() => continueTo("rate")} className={primaryButtonClass}>
              Continue to rating
            </button>
          </StepFooter>
        )}
        </div>
      </main>
      )}
    </div>
  );
}

// The bottom of a step: at most one main button, with what it needs to say
// next to it.
function StepFooter({
  back,
  children,
}: {
  // A button that names where it goes, at the left edge.
  back?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-8 flex flex-wrap items-center justify-end gap-4">
      {back !== undefined && <span className="mr-auto">{back}</span>}
      {children}
    </div>
  );
}

function BackButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={secondaryButtonClass}>
      <span aria-hidden>← </span>
      {label}
    </button>
  );
}
