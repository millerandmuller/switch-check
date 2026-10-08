import type { RowResult } from "@/lib/comparison";

// The row result of one input, coloured only for better and worse. Used on
// the input tabs of the rating screen and on the result screen.

const RESULT_CHIP: Partial<Record<RowResult, string>> = {
  better: "bg-better/10 text-better",
  worse: "bg-worse/10 text-worse",
};

// "Compared model: better". "Not rated yet" and "Not tested" say it without
// naming a model: either side can be the one that is missing.
const NAMES_COMPARED_MODEL: RowResult[] = ["better", "same rating", "worse"];

export function ResultChip({ result }: { result: RowResult }) {
  return (
    <span
      className={`inline-block w-fit whitespace-nowrap rounded-full px-3 py-[3px] text-[12.5px] font-semibold ${RESULT_CHIP[result] ?? "bg-chip text-ink"}`}
    >
      {NAMES_COMPARED_MODEL.includes(result) ? `Compared model: ${result}` : result}
    </span>
  );
}
