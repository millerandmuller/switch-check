import { inputsAdded } from "@/lib/flow";
import {
  INPUT_COUNT,
  INPUT_MAX_CHARS,
  sampleLabel,
  type DraftProblems,
  type SampleWorkflow,
  type WorkflowDraft,
} from "@/lib/workflow";
import { SampleTag } from "./sample-tag";
import { FieldProblem, fieldClasses } from "./setup-step";
import { capsClass } from "./ui";

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
    <div className="min-w-0 border border-line p-5">
      <label htmlFor={fieldId} className="flex items-baseline gap-3">
        <span className="font-display text-5xl leading-none text-gold">{position}</span>
        <span className={capsClass}>Input {position}</span>
        {sampleOf !== null && <SampleTag label={sampleOf} />}
      </label>
      <textarea
        id={fieldId}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={12}
        aria-invalid={problem !== null}
        aria-describedby={problem === null ? countId : `${problemId} ${countId}`}
        className={`${fieldClasses(problem !== null)} text-[15px] leading-[1.6]`}
      />
      <p id={countId} className={over ? "mt-1 text-xs font-bold" : `mt-1 ${capsClass} text-gold`}>
        {value.length.toLocaleString("en-US")} of {INPUT_MAX_CHARS.toLocaleString("en-US")}{" "}
        characters
      </p>
      <FieldProblem id={problemId} message={problem} />
    </div>
  );
}

// Step 3: the three inputs. The checks and their messages are findProblems in
// lib/workflow.ts, shown once Continue was pressed.
export function InputsStep({
  draft,
  problems,
  sample,
  onInputChange,
}: {
  draft: WorkflowDraft;
  // null until Continue was pressed on this step.
  problems: DraftProblems | null;
  sample: SampleWorkflow;
  onInputChange: (index: number, value: string) => void;
}) {
  return (
    <>
      <p aria-live="polite" className="mt-6 font-bold">
        {inputsAdded(draft)} of {INPUT_COUNT} added
      </p>
      <div className="mt-3 grid gap-5 wide:grid-cols-3">
        {draft.inputs.map((input, index) => (
          <InputField
            key={index}
            position={index + 1}
            value={input}
            problem={problems?.inputs[index] ?? null}
            sampleOf={sampleLabel(sample, input)}
            onChange={(value) => onInputChange(index, value)}
          />
        ))}
      </div>
    </>
  );
}
