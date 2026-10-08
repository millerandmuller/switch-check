import { INPUT_PLACEHOLDER, type DraftProblems, type WorkflowDraft } from "@/lib/workflow";
import {
  fieldClass,
  helperClass,
  invalidFieldClass,
  labelClass,
  pillFieldClass,
  problemClass,
  secondaryButtonClass,
} from "./ui";

export function fieldClasses(invalid: boolean) {
  return invalid ? invalidFieldClass : fieldClass;
}

export function FieldProblem({ id, message }: { id: string; message: string | null }) {
  if (message === null) return null;
  return (
    <p id={id} role="alert" className={problemClass}>
      {message}
    </p>
  );
}

const COUNT_WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight"];

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
      <label htmlFor={id} className={`block ${labelClass}`}>
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        className={`${fieldClasses(invalid)} ${pillFieldClass} font-mono text-[13.5px]`}
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

// Step 2: the prompt and the two models. The checks and their messages are
// findProblems in lib/workflow.ts, shown once Continue was pressed.
export function SetupStep({
  draft,
  problems,
  candidates,
  onPromptChange,
  onCurrentModelChange,
  onCandidateModelChange,
  onUseSample,
}: {
  draft: WorkflowDraft;
  // null until Continue was pressed on this step.
  problems: DraftProblems | null;
  candidates: string[];
  onPromptChange: (prompt: string) => void;
  onCurrentModelChange: (model: string) => void;
  onCandidateModelChange: (model: string) => void;
  onUseSample: () => void;
}) {
  const modelsDescribedBy = problems?.models == null ? undefined : "models-problem";
  return (
    <div className="mt-8 grid gap-4 wide:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="card min-w-0 p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <label htmlFor="prompt" className={`block ${labelClass}`}>
            Your prompt
          </label>
          <button type="button" onClick={onUseSample} className={secondaryButtonClass}>
            Use sample workflow
          </button>
        </div>
        <p className={helperClass}>
          Use <code className="font-mono text-[13px]">{INPUT_PLACEHOLDER}</code> where the real
          input goes
        </p>
        <textarea
          id="prompt"
          value={draft.prompt}
          onChange={(event) => onPromptChange(event.target.value)}
          rows={10}
          aria-invalid={problems?.prompt != null}
          aria-describedby={problems?.prompt == null ? undefined : "prompt-problem"}
          className={`${fieldClasses(problems?.prompt != null)} font-mono text-[13.5px] leading-[1.7]`}
        />
        <FieldProblem id="prompt-problem" message={problems?.prompt ?? null} />
      </div>
      <div className="card flex min-w-0 flex-col gap-6 p-5">
        <ModelPicker
          id="current-model"
          label="Model you use today"
          value={draft.currentModel}
          candidates={candidates}
          invalid={problems?.models != null}
          describedBy={modelsDescribedBy}
          onChange={onCurrentModelChange}
        />
        <ModelPicker
          id="candidate-model"
          label="Model to compare with"
          value={draft.candidateModel}
          candidates={candidates}
          invalid={problems?.models != null}
          describedBy={modelsDescribedBy}
          onChange={onCandidateModelChange}
        />
        <p className={helperClass}>
          These {COUNT_WORDS[candidates.length] ?? candidates.length} are the models Switch Check has prices for today.
        </p>
        <FieldProblem id="models-problem" message={problems?.models ?? null} />
      </div>
    </div>
  );
}
