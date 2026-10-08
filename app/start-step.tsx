import { capsClass } from "./ui";

const choiceClass =
  "flex cursor-pointer flex-col items-start gap-2 border-2 border-ink bg-ground p-6 text-left hover:bg-soft hover:shadow-focus";

const arrowClass =
  "mt-2 font-caps text-[13px] font-semibold uppercase tracking-[0.05em] text-ink";

// Step 1: one choice. Either look at the finished example, or start a
// comparison on your own prompt.
export function StartStep({
  exampleRunDate,
  onSeeExample,
  onOwnPrompt,
}: {
  // The date of the saved sample run, or null when no run has been saved.
  exampleRunDate: string | null;
  onSeeExample: () => void;
  onOwnPrompt: () => void;
}) {
  return (
    <div className="mt-8 grid max-w-5xl gap-5 md:grid-cols-2">
      <button type="button" onClick={onSeeExample} className={choiceClass}>
        <span className={`${capsClass} text-gold-text`}>Sample</span>
        <span className="font-display text-2xl font-medium">
          {exampleRunDate === null ? "Use the sample workflow" : "See a finished example"}
        </span>
        <span className="text-muted">
          {exampleRunDate === null
            ? "A made-up client email triage workflow fills the prompt and the three inputs. Every email in it is invented."
            : `A made-up client email triage workflow, with the outputs two models returned in one run on ${exampleRunDate}. Every email in it is invented. Nothing is rated: the ratings are yours to set.`}
        </span>
        <span className={arrowClass}>
          {exampleRunDate === null ? "Use the sample workflow" : "Open the example"} <span aria-hidden>→</span>
        </span>
      </button>
      <button type="button" onClick={onOwnPrompt} className={choiceClass}>
        <span className={`${capsClass} text-gold-text`}>Yours</span>
        <span className="font-display text-2xl font-medium">Compare on my own prompt</span>
        <span className="text-muted">
          One prompt you already use, three real inputs, and the two models to compare. Steps
          2 to 5 follow.
        </span>
        <span className={arrowClass}>
          Start on my prompt <span aria-hidden>→</span>
        </span>
      </button>
    </div>
  );
}
