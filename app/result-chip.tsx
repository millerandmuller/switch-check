import type { RowResult } from "@/lib/comparison";

// The row result of one input: a status dot and its word, never the colour
// alone. Green and red appear only here. Used on the input tabs of the rating
// screen and on the result screen.

// "Compared model: better". "Not rated yet" and "Not tested" say it without
// naming a model: either side can be the one that is missing.
const NAMES_COMPARED_MODEL: RowResult[] = ["better", "same rating", "worse"];

function dotClass(result: RowResult): string {
  if (result === "better") return "bg-better";
  if (result === "worse") return "bg-worse";
  // Equal ratings: a ring, so it differs from "not yet" by shape too.
  if (result === "same rating") return "bg-transparent shadow-[inset_0_0_0_2.5px_var(--color-muted)]";
  return "bg-idle";
}

export function ResultDot({ result }: { result: RowResult }) {
  return <span aria-hidden className={`inline-block size-[9px] flex-none rounded-full ${dotClass(result)}`} />;
}

// The dot with its word. With `short`, the word alone is shown and the
// "Compared model" part is only read aloud (the summary line says it for the
// sighted reader).
export function ResultStatus({ result, short = false }: { result: RowResult; short?: boolean }) {
  const names = NAMES_COMPARED_MODEL.includes(result);
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <ResultDot result={result} />
      <span>
        {names && (short ? <span className="sr-only">Compared model: </span> : "Compared model: ")}
        {result}
      </span>
    </span>
  );
}

export function ResultChip({ result }: { result: RowResult }) {
  return (
    <span className="inline-block w-fit rounded-full bg-chip px-3 py-[3px] text-[12.5px] font-semibold">
      <ResultStatus result={result} />
    </span>
  );
}
