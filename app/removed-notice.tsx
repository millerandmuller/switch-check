// Says that outputs were taken out of the comparison after the prompt, an
// input or a model was changed, so an emptied cell is never a surprise. Shared
// by the Ready panel and the comparison view. Shows nothing for a count of 0.
import { noticeClass } from "./ui";

export function RemovedNotice({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <p
      role="status"
      className={`${noticeClass} mt-3 p-3.5 text-sm`}
    >
      {count === 1 ? "1 output was" : `${count} outputs were`} removed from the comparison, with any
      rating and note on {count === 1 ? "it" : "them"}, because the prompt, the input or the model{" "}
      {count === 1 ? "it was" : "they were"} produced with has changed.
    </p>
  );
}
