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
      <ol className="glass flex flex-wrap gap-0.5 rounded-full p-0.5 wide:flex-nowrap">
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
                    ? "whitespace-nowrap rounded-full bg-accent px-3 py-1 text-[13.5px] font-semibold text-on-accent"
                    : "whitespace-nowrap rounded-full px-3 py-1 text-[13.5px] text-muted enabled:cursor-pointer enabled:hover:bg-accent/10 disabled:cursor-default"
                }
              >
                <span className={step.state === "done" ? "font-semibold text-ink" : undefined}>
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
