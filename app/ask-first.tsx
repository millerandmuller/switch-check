"use client";

import { useEffect, useRef } from "react";
import { primaryButtonClass, secondaryButtonClass } from "./ui";

// Asked in the page before an action replaces or removes something the person
// typed or rated. Two buttons that each name their outcome, no browser dialog.
// Focus starts on the button that keeps the work.
export function AskFirst({
  question,
  replaceLabel,
  keepLabel,
  onReplace,
  onKeep,
}: {
  question: string;
  replaceLabel: string;
  keepLabel: string;
  onReplace: () => void;
  onKeep: () => void;
}) {
  const keepRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    keepRef.current?.focus();
  }, []);

  return (
    <div
      role="group"
      aria-label="Before this replaces your work"
      className="mt-4 border border-ink bg-soft p-4 shadow-focus"
    >
      <p className="font-bold">{question}</p>
      <div className="mt-3 flex flex-wrap gap-3">
        <button ref={keepRef} type="button" onClick={onKeep} className={primaryButtonClass}>
          {keepLabel}
        </button>
        <button type="button" onClick={onReplace} className={secondaryButtonClass}>
          {replaceLabel}
        </button>
      </div>
    </div>
  );
}
