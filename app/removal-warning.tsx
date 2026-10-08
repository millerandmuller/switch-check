import { noticeClass, secondaryButtonClass } from "./ui";

// Said above the main button of steps 2 and 3, while the draft differs from
// the one the outputs were made with: what continuing will remove, before it
// is removed, and a way to put the changed fields back. The rule itself is in
// lib/comparison.ts (outputsAfterDraftChange).

export function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

export function removalSentence(removal: { outputs: number; ratings: number }): string {
  const ratings = removal.ratings === 0 ? "" : ` and ${plural(removal.ratings, "rating")} on them`;
  return `${plural(removal.outputs, "output")}${ratings}`;
}

export function RemovalWarning({
  removal,
  onUndo,
}: {
  removal: { outputs: number; ratings: number };
  onUndo: () => void;
}) {
  return (
    <div role="status" className={`${noticeClass} flex max-w-[72ch] flex-col items-start gap-2 p-3.5 text-sm`}>
      <p>
        Continuing will remove {removalSentence(removal)}, because the prompt, an input or a model
        they were produced with has changed.
      </p>
      <button type="button" onClick={onUndo} className={secondaryButtonClass}>
        Undo my change
      </button>
    </div>
  );
}
