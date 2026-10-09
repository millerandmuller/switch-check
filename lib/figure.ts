// A figure is a value that always travels with its state. The state is part of
// the data, so a number cannot reach the page without one: the chip that draws
// it asks for a Figure, and stateCaption throws on anything else.
//
//   measured   timed or counted by this app during a run
//   estimated  worked out from a published price and reported token counts
//   generated  written by a model before any answer existed
//   judged     marked by the judge model, or by the person who flipped it
//   recorded   taken from a saved run, not from this one

export type FigureState = "measured" | "estimated" | "generated" | "judged" | "recorded";

export type Figure<T> = { value: T; state: FigureState; note?: string };

export const FIGURE_STATES: readonly FigureState[] = [
  "measured",
  "estimated",
  "generated",
  "judged",
  "recorded",
];

export function figure<T>(value: T, state: FigureState, note?: string): Figure<T> {
  return note === undefined ? { value, state } : { value, state, note };
}

export function isFigure(candidate: unknown): candidate is Figure<unknown> {
  if (typeof candidate !== "object" || candidate === null) return false;
  const state = (candidate as { state?: unknown }).state;
  return typeof state === "string" && (FIGURE_STATES as readonly string[]).includes(state);
}

// The small line under a figure: the state word, then the note if there is
// one. Same place and same words everywhere.
export function stateCaption(fig: Figure<unknown>): string {
  if (!isFigure(fig)) {
    throw new Error("A figure was drawn without a state. Build it with figure(value, state).");
  }
  return fig.note === undefined || fig.note === "" ? fig.state : `${fig.state} · ${fig.note}`;
}

// A saved run shows its measured figures as recorded: "measured" would say
// this page timed them just now.
// "this run" is dropped from the note: it would say the opposite.
export function asRecorded<T>(fig: Figure<T>): Figure<T> {
  if (fig.state !== "measured") return fig;
  return { value: fig.value, state: "recorded" };
}
