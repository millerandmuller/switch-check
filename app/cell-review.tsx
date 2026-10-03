import { NOTE_MAX_CHARS, RATINGS, type Rating, type Review } from "@/lib/comparison";

// The quality review of one output: three rating choices and an optional
// one-line reason, shown inside the cell of the output they judge. Nothing is
// preselected and nothing is suggested: a cell stays "not rated" until the
// person picks.

const choiceClass =
  "flex cursor-pointer items-center gap-1.5 rounded-md border border-zinc-300 px-2 py-1 text-xs has-[:checked]:border-zinc-900 has-[:checked]:bg-zinc-900 has-[:checked]:font-semibold has-[:checked]:text-white has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-sky-600 dark:border-zinc-700 dark:has-[:checked]:border-zinc-100 dark:has-[:checked]:bg-zinc-100 dark:has-[:checked]:text-zinc-900";

// The three descriptions, shown once above the table whenever ratings can be
// entered.
export function RatingLegend() {
  return (
    <div className="mt-4 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
      <h3 className="text-sm font-medium">Rate each output: would you use it?</h3>
      <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-3">
        {RATINGS.map((entry) => (
          <div key={entry.value}>
            <dt className="font-medium">{entry.label}</dt>
            <dd className="text-zinc-600 dark:text-zinc-400">{entry.description}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function CellReview({
  cellId,
  model,
  position,
  review,
  onRatingChange,
  onNoteChange,
}: {
  // Unique per cell: it names the radio group and ties the note to its label.
  cellId: string;
  model: string;
  position: number;
  review: Review;
  onRatingChange: (rating: Rating) => void;
  onNoteChange: (note: string) => void;
}) {
  const noteId = `${cellId}-note`;
  const chosen = RATINGS.find((entry) => entry.value === review.rating);

  return (
    <div className="mt-3 border-t border-dashed border-zinc-300 pt-3 dark:border-zinc-700">
      <fieldset>
        <legend className="sr-only">
          Rating for {model} on input {position}
        </legend>
        <p className="text-xs text-zinc-600 dark:text-zinc-400">
          Your rating:{" "}
          {chosen ? (
            <span className="font-semibold text-zinc-900 dark:text-zinc-100">{chosen.label}</span>
          ) : (
            <span className="italic">not rated</span>
          )}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {RATINGS.map((entry) => (
            <label key={entry.value} className={choiceClass}>
              <input
                type="radio"
                name={`${cellId}-rating`}
                value={entry.value}
                checked={review.rating === entry.value}
                onChange={() => onRatingChange(entry.value)}
              />
              {entry.label}
            </label>
          ))}
        </div>
      </fieldset>
      <label htmlFor={noteId} className="mt-3 block text-xs text-zinc-600 dark:text-zinc-400">
        Why? (optional)
      </label>
      <input
        id={noteId}
        type="text"
        value={review.note}
        maxLength={NOTE_MAX_CHARS}
        onChange={(event) => onNoteChange(event.target.value)}
        className="mt-1 w-full rounded-md border border-zinc-300 bg-transparent px-2 py-1 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:focus:border-zinc-400"
      />
      <p className="mt-1 text-right text-[10px] text-zinc-500">
        {review.note.length} / {NOTE_MAX_CHARS}
      </p>
    </div>
  );
}
