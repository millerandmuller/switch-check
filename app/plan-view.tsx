import type { RunState } from "@/lib/events";
import { INPUT_SLOT } from "@/lib/run-types";
import { fieldClass, helperClass, labelClass, secondaryButtonClass } from "./ui";

// What was tested and what was added to the person's words: the slice line for
// a project, the prompt that was written, the lines added to it, and the test
// cases. After a live run the test cases can be edited and run again.
export function PlanView({
  state,
  edits,
  canEdit,
  running,
  problem,
  onEdit,
  onRunAgain,
  onCopyPrompt,
  copied,
}: {
  state: RunState;
  edits: string[];
  canEdit: boolean;
  running: boolean;
  problem: string | null;
  onEdit: (index: number, value: string) => void;
  onRunAgain: () => void;
  onCopyPrompt: () => void;
  copied: boolean;
}) {
  const plan = state.plan;
  if (plan === null) return null;
  const changed = edits.some((text, index) => text.trim() !== plan.testCases[index]?.input);
  return (
    <section className="card p-5" aria-labelledby="plan-heading">
      <h2 id="plan-heading" className="font-display text-[1.25rem] font-semibold">
        What was tested
      </h2>
      <p className="text-[12.5px] text-muted">
        Written by {state.writer ?? "the writer"} from your words. State: generated. The checks were written before any
        model had answered.
      </p>

      {plan.taskClass === "project" && plan.slice && (
        <p className="mt-3 rounded-2xl bg-chip px-4 py-3 text-[15px]" data-testid="slice-line">
          <b>We can&apos;t build the whole thing in a test.</b> We tested the part that predicts the rest: {plan.slice.tested}{" "}
          <b>Not tested:</b> {plan.slice.notTested}
        </p>
      )}

      <div className="mt-4 grid gap-5 wide:grid-cols-2">
        <div>
          <h3 className={labelClass}>What we added to your words</h3>
          <ul className="mt-1 list-disc pl-5 text-[14.5px] leading-snug">
            {plan.additions.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <details className="mt-3">
            <summary className="cursor-pointer text-[14px] font-semibold text-accent">The prompt every model was given</summary>
            <pre className="mt-2 whitespace-pre-wrap rounded-xl bg-chip px-3.5 py-2.5 font-mono text-[12.5px] leading-[1.6] [overflow-wrap:anywhere]">
              {plan.prompt}
            </pre>
            <p className={helperClass}>
              {INPUT_SLOT} is where one test case goes. <button type="button" onClick={onCopyPrompt} className="cursor-pointer font-semibold text-accent underline underline-offset-2">{copied ? "Copied" : "Copy the prompt"}</button>
            </p>
          </details>
        </div>

        <div>
          <h3 className={labelClass}>
            {canEdit ? "Written from your task. Edit one and run again." : "Written from your task."}
          </h3>
          <ol className="mt-1 flex flex-col gap-2">
            {plan.testCases.map((testCase, index) => (
              <li key={testCase.id}>
                <label className="text-[12.5px] font-semibold text-muted" htmlFor={`case-${testCase.id}`}>
                  Test case {index + 1}
                  {testCase.edited ? " (edited by you)" : ""}
                </label>
                {canEdit ? (
                  <textarea
                    id={`case-${testCase.id}`}
                    value={edits[index] ?? testCase.input}
                    rows={3}
                    onChange={(event) => onEdit(index, event.target.value)}
                    disabled={running}
                    className={`${fieldClass} !mt-0.5 !rounded-xl !py-2 text-[14px]`}
                  />
                ) : (
                  <p id={`case-${testCase.id}`} className="rounded-xl bg-chip px-3 py-2 text-[14px] leading-snug [overflow-wrap:anywhere]">
                    {testCase.input}
                  </p>
                )}
              </li>
            ))}
          </ol>
          {canEdit && (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button type="button" disabled={running} onClick={onRunAgain} className={`${secondaryButtonClass} disabled:opacity-60`}>
                {changed ? "Run again with my edits" : "Run again"}
              </button>
              <span className="text-[12.5px] text-muted">A run again counts as one of your checks today.</span>
            </div>
          )}
          {problem !== null && (
            <p role="alert" className="mt-2 border-l-2 border-worse pl-3 text-sm font-semibold text-worse">
              {problem}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
