// Class names shared by the screens, so the look is defined once. Colours and
// fonts come from the tokens in globals.css. Shapes are pills for buttons and
// one-line fields, large radii for cards and multi-line fields.

// A label above a field or a block: sentence case, in the secondary colour.
export const labelClass = "text-[13.5px] font-medium text-muted";

// The one main button of a screen: a pine pill, named after what it does.
export const primaryButtonClass =
  "cursor-pointer rounded-full bg-accent px-7 py-3 text-[15px] font-semibold text-on-accent shadow-[0_6px_20px_rgba(31,55,48,0.18)] hover:bg-accent/90";

// The same button, shorter, for the footer of the rating screen where every
// pixel of height goes to the outputs.
export const primaryButtonCompactClass =
  "cursor-pointer rounded-full bg-accent px-6 py-1.5 text-[15px] font-semibold text-on-accent shadow-[0_6px_20px_rgba(31,55,48,0.18)] hover:bg-accent/90";

export const secondaryButtonClass =
  "cursor-pointer rounded-full border border-accent/35 bg-chip px-4 py-2 text-sm font-semibold text-ink hover:border-accent hover:bg-accent/15";

// A soft filled field, on a card. Multi-line fields have a large radius.
const fieldBaseClass =
  "mt-2 w-full rounded-2xl border-2 bg-chip px-4 py-3 text-[15px] text-ink placeholder:text-muted focus:bg-white/60";
export const fieldClass = `${fieldBaseClass} border-transparent`;

// One-line fields (a model picker) are pills.
export const pillFieldClass = "rounded-full";

// A field with a problem is marked by a heavier edge and its message, both in
// the "worse" colour, so it is not missed.
export const invalidFieldClass = `${fieldBaseClass} border-worse`;

export const problemClass = "mt-2 border-l-2 border-worse pl-3 text-sm font-semibold text-worse";

export const helperClass = "mt-1 text-sm text-muted";

// A line of figures or a notice that sits inside a card.
export const chipClass = "rounded-2xl bg-chip";

// A notice that must not be missed, on a card with a pine edge.
export const noticeClass = "card ring-1 ring-accent/40";
