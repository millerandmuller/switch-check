import { labelClass } from "./ui";

// The heading of a step. Keyboard focus is moved here after each step change,
// so the next Tab starts inside the new screen.
export function StepHeading({
  headingRef,
  position,
  title,
  job,
}: {
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  position: number;
  title: string;
  job: string;
}) {
  return (
    <div className="max-w-[72ch]">
      <p className={labelClass}>Step {position} of 5</p>
      <h2 ref={headingRef} tabIndex={-1} className="mt-1 font-display text-[2rem] font-semibold leading-tight tracking-[-0.02em] focus:outline-none">
        {title}
      </h2>
      <p className="mt-2 text-muted">{job}</p>
    </div>
  );
}
