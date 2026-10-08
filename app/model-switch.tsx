import { MODEL_SIDES, type ModelSide } from "@/lib/comparison";
import { SIDE_ROLES } from "./outputs-step";

// Below the side-by-side width only one model's output shows at a time. The
// switch sits in the rating bar, next to the rating, and says for each model
// whether it is rated, so the second model cannot be missed.
export function ModelSwitch({
  shown,
  status,
  unratedNudge,
  onShow,
}: {
  shown: ModelSide;
  // Per model, for the input on show: its rating, "not rated" or "not tested".
  status: Record<ModelSide, string>;
  // The model that was left unrated when Next input was pressed, or null.
  unratedNudge: ModelSide | null;
  onShow: (side: ModelSide) => void;
}) {
  return (
    <div className="mb-2 wide:hidden">
      <div role="group" aria-label="Which model's output to show" className="flex flex-col gap-1">
        {MODEL_SIDES.map((side) => (
          <button
            key={side}
            type="button"
            aria-pressed={shown === side}
            onClick={() => onShow(side)}
            className={`flex cursor-pointer items-baseline justify-between gap-3 rounded-full px-4 py-2 text-left text-sm ${shown === side ? "bg-accent font-semibold text-on-accent" : "bg-chip text-muted"}`}
          >
            <span>{SIDE_ROLES[side]}</span>
            <span className={status[side] === "not rated" ? "font-semibold italic" : ""}>{status[side]}</span>
          </button>
        ))}
      </div>
      {unratedNudge !== null && (
        <p role="status" className="mt-2 text-sm font-semibold">
          {SIDE_ROLES[unratedNudge]} is not rated yet. Rate it, or press Next input again to move on
          without rating it.
        </p>
      )}
    </div>
  );
}
