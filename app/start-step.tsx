import { labelClass } from "./ui";

const choiceClass =
  "card lift flex cursor-pointer flex-col items-start gap-2 px-6 py-6 text-left";

const arrowClass = "mt-1.5 text-[14.5px] font-semibold text-accent";

const kindClass = `${labelClass} font-semibold text-accent`;

// Step 1: one choice. Either look at the finished example, or start a
// comparison on your own prompt. The headline carries two weights: the
// statement in semibold, the rest of the sentence light and softer.
export function StartStep({
  headingRef,
  title,
  job,
  exampleRunDate,
  onSeeExample,
  onOwnPrompt,
  ask,
}: {
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  title: string;
  job: string;
  // The date of the saved sample run, or null when no run has been saved.
  exampleRunDate: string | null;
  onSeeExample: () => void;
  onOwnPrompt: () => void;
  // The question asked before the start replaces work, or null.
  ask: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-7 pt-[clamp(8px,5vh,56px)]">
      <h2
        ref={headingRef}
        tabIndex={-1}
        className="text-balance text-center font-display text-[clamp(2.4rem,5.6vw,4.6rem)] font-semibold leading-[1.03] tracking-[-0.03em] focus:outline-none focus:shadow-none"
      >
        {title} <span className="font-extralight text-soft">See for yourself.</span>
      </h2>
      <p className="max-w-[56ch] text-center text-[1.1rem] text-muted">{job}</p>
      <p className="text-center text-[13.5px] text-muted">
        Nothing is saved. Reloading this page empties it.
      </p>
      {ask}
      <div className="panel grid w-full gap-3.5 p-3.5 md:grid-cols-2">
        <button type="button" onClick={onSeeExample} className={choiceClass}>
          <span className={kindClass}>Sample</span>
          <span className="font-display text-[1.4rem] font-semibold tracking-[-0.01em]">
            {exampleRunDate === null ? "Use the sample workflow" : "See a finished example"}
          </span>
          <span className="text-[15px] text-muted">
            {exampleRunDate === null
              ? "A made-up client email triage workflow fills the prompt and the three inputs. Every email in it is invented."
              : `A made-up client email triage workflow, with the outputs two models returned in one run on ${exampleRunDate}. Every email in it is invented. Nothing is rated: the ratings are yours to set.`}
          </span>
          <span className={arrowClass}>
            {exampleRunDate === null ? "Use the sample workflow" : "Open the example"}{" "}
            <span aria-hidden>→</span>
          </span>
        </button>
        <button type="button" onClick={onOwnPrompt} className={choiceClass}>
          <span className={kindClass}>Yours</span>
          <span className="font-display text-[1.4rem] font-semibold tracking-[-0.01em]">
            Compare on my own prompt
          </span>
          <span className="text-[15px] text-muted">
            One prompt you already use, three real inputs, and the two models to compare. Steps
            2 to 5 follow.
          </span>
          <span className={arrowClass}>
            Start on my prompt <span aria-hidden>→</span>
          </span>
        </button>
      </div>
    </div>
  );
}
