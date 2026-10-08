import { NOTE_MAX_CHARS, RATINGS, type Rating, type Review } from "@/lib/comparison";

// The quality review of one output: three rating choices and an optional
// one-line reason, pinned under the output they judge. Nothing is preselected
// and nothing is suggested: an output stays "not rated" until the person
// picks.

const choiceClass =
  "block cursor-pointer rounded-full px-3.5 py-0.5 text-[13.5px] text-muted has-[:checked]:bg-accent has-[:checked]:font-semibold has-[:checked]:text-on-accent has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent has-[:focus-visible]:shadow-[0_0_0_6px_rgba(255,255,255,0.85)]";

// The three descriptions, shown once above the outputs.
export function RatingLegend() {
  return (
    <dl className="grid gap-x-5 gap-y-1 text-[12px] leading-snug text-muted md:grid-cols-3">
      {RATINGS.map((entry) => (
        <div key={entry.value}>
          <dt className="inline font-semibold text-ink">{entry.label}. </dt>
          <dd className="inline">{entry.description}</dd>
        </div>
      ))}
    </dl>
  );
}

// "What the ratings mean": open until the first rating is set, then closed,
// and the person can open it again. The state lives in the rating screen.
export function RatingsDisclosure({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: (open: boolean) => void;
}) {
  return (
    <details open={open} onToggle={(event) => onToggle(event.currentTarget.open)} className="mt-1.5">
      <summary className="cursor-pointer text-[13.5px] font-semibold">
        What the ratings mean
      </summary>
      <div className="mt-1">
        <RatingLegend />
      </div>
    </details>
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
    <div className="flex flex-col gap-1">
      <fieldset className="min-w-0">
        <legend className="sr-only">
          Rating for {model} on input {position}
        </legend>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <p className="text-xs text-muted">
            Your rating:{" "}
            {chosen ? (
              <span className="font-semibold text-ink">{chosen.label}</span>
            ) : (
              <span className="italic">not rated</span>
            )}
          </p>
          <div className="flex flex-wrap gap-[3px] rounded-full bg-chip p-[3px]">
            {RATINGS.map((entry) => (
              <label key={entry.value} className={choiceClass}>
                <input
                  type="radio"
                  name={`${cellId}-rating`}
                  value={entry.value}
                  checked={review.rating === entry.value}
                  onChange={() => onRatingChange(entry.value)}
                  className="sr-only"
                />
                {entry.label}
              </label>
            ))}
          </div>
        </div>
      </fieldset>
      <div className="flex min-w-0 items-center gap-2">
        <label htmlFor={noteId} className="sr-only">
          Why? One-line note on this output, optional
        </label>
        <input
          id={noteId}
          type="text"
          value={review.note}
          maxLength={NOTE_MAX_CHARS}
          placeholder="One-line note, optional"
          onChange={(event) => onNoteChange(event.target.value)}
          className="min-w-0 flex-1 rounded-full border-2 border-transparent bg-chip px-4 py-px text-sm text-ink placeholder:text-muted focus:bg-white/60"
        />
        <span className="text-xs text-muted">
          {review.note.length} / {NOTE_MAX_CHARS}
        </span>
      </div>
    </div>
  );
}
