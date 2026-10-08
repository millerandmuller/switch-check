import type { RowResult } from "@/lib/comparison";

// The row result of one input, coloured only for better and worse. Used on
// the input tabs of the rating screen and on the result screen.

const RESULT_CHIP: Partial<Record<RowResult, string>> = {
  better: "border-better text-better",
  worse: "border-worse text-worse",
};

// "Compared model: better". "Not rated yet" and "Not tested" say it without
// naming a model: either side can be the one that is missing.
const NAMES_COMPARED_MODEL: RowResult[] = ["better", "same rating", "worse"];

export function ResultChip({ result }: { result: RowResult }) {
  return (
    <span
      className={`inline-block w-fit border px-2 py-[3px] font-caps text-[10.5px] font-semibold uppercase tracking-[0.05em] ${RESULT_CHIP[result] ?? "border-line"}`}
    >
      {NAMES_COMPARED_MODEL.includes(result) ? `Compared model: ${result}` : result}
    </span>
  );
}
