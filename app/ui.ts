// Class names shared by the screens, so the look is defined once. Colours and
// fonts come from the tokens in globals.css.

export const capsClass = "font-caps text-[12px] font-semibold uppercase tracking-[0.06em]";

// The one main button of a screen: square, ink, named after what it does.
export const primaryButtonClass =
  "cursor-pointer border border-ink bg-ink px-6 py-3.5 font-caps text-[13px] font-semibold uppercase tracking-[0.05em] text-ground hover:bg-ink/85";

// The same button, shorter, for the footer of the rating screen where every
// pixel of height goes to the outputs.
export const primaryButtonCompactClass =
  "cursor-pointer border border-ink bg-ink px-6 py-2.5 font-caps text-[13px] font-semibold uppercase tracking-[0.05em] text-ground hover:bg-ink/85";

export const secondaryButtonClass =
  "cursor-pointer border border-line bg-ground px-4 py-2.5 text-sm font-bold hover:border-ink";

export const fieldClass = "mt-2 w-full border border-line bg-ground px-3.5 py-3 text-[15px] focus:border-ink";

// A field with a problem is marked by a heavier edge and its message, both in
// the "worse" colour, so it is not missed in plain black.
export const invalidFieldClass = "border-2 border-worse";

export const problemClass = "mt-2 border-l-2 border-worse pl-3 text-sm font-bold text-worse";

export const blockClass = "border border-line bg-ground";

export const helperClass = "mt-1 text-sm text-muted";
