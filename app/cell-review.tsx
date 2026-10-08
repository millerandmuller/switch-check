import { NOTE_MAX_CHARS, RATINGS, type Rating, type Review } from "@/lib/comparison";

// The quality review of one output: three rating choices and an optional
// one-line reason, shown inside the cell of the output they judge. Nothing is
// preselected and nothing is suggested: a cell stays "not rated" until the
// person picks.

const choiceClass =
  "flex cursor-pointer items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-[13.5px] text-muted has-[:checked]:border-ink has-[:checked]:bg-ink has-[:checked]:font-bold has-[:checked]:text-ground has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-gold";

// The three descriptions, shown once above the table whenever ratings can be
// entered.
export function RatingLegend() {
  return (
    <div className="mt-4 border border-line p-3">
      <h3 className="text-sm font-medium">Rate each output: would you use it?</h3>
      <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-3">
        {RATINGS.map((entry) => (
          <div key={entry.value}>
            <dt className="font-medium">{entry.label}</dt>
            <dd className="text-muted">{entry.description}</dd>
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
    <div className="mt-3 border-t border-dashed border-line pt-3">
      <fieldset>
        <legend className="sr-only">
          Rating for {model} on input {position}
        </legend>
        <p className="text-xs text-muted">
          Your rating:{" "}
          {chosen ? (
            <span className="font-semibold text-ink">{chosen.label}</span>
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
      <label htmlFor={noteId} className="mt-3 block text-xs text-muted">
        Why? (optional)
      </label>
      <input
        id={noteId}
        type="text"
        value={review.note}
        maxLength={NOTE_MAX_CHARS}
        onChange={(event) => onNoteChange(event.target.value)}
        className="mt-1 w-full border border-line bg-transparent px-2 py-1 text-sm focus:border-ink"
      />
      <p className="mt-1 text-right text-[10px] text-muted">
        {review.note.length} / {NOTE_MAX_CHARS}
      </p>
    </div>
  );
}
