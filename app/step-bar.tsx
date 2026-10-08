import type { StepId, StepInBar } from "@/lib/flow";

// The five steps across the top: done, current, to do. A step that can be
// opened is a button that goes there; one that is not reachable yet is shown
// and cannot be pressed. The state is in the text read aloud, not only in the
// colour.
export function StepBar({
  steps,
  fromExample,
  onOpen,
}: {
  steps: StepInBar[];
  // Steps that came with the example and were not done by the person.
  fromExample: StepId[];
  onOpen: (step: StepId) => void;
}) {
  return (
    <nav aria-label="Steps">
      <ol className="flex flex-wrap gap-1 rounded-[22px] border border-line p-1">
        {steps.map((step) => {
          const current = step.state === "current";
          const stateText =
            step.state === "done" && fromExample.includes(step.id) ? "from the example" : step.state;
          return (
            <li key={step.id}>
              <button
                type="button"
                disabled={!step.canOpen && !current}
                aria-current={current ? "step" : undefined}
                aria-label={`Step ${step.position}, ${step.label}: ${stateText}`}
                onClick={() => {
                  if (step.canOpen) onOpen(step.id);
                }}
                className={
                  current
                    ? "rounded-full bg-ink px-4 py-1.5 text-[14.5px] font-bold text-ground"
                    : "rounded-full px-4 py-1.5 text-[14.5px] text-muted enabled:cursor-pointer enabled:hover:text-ink disabled:opacity-55"
                }
              >
                <span className={step.state === "done" ? "font-bold text-gold-text" : undefined}>
                  {step.position}
                </span>
                <span className={current ? "" : "hidden md:inline"}> · {step.label}</span>
                {step.state === "done" && <span className="hidden md:inline"> · {stateText}</span>}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
