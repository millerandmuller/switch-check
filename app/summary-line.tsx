// The summary line in two weights: the first sentence (what is counted, or
// how many inputs still need a rating) in semibold, anything after it (what
// is still missing, such as inputs not tested) in light weight. The text
// itself comes from summaryLine in lib/comparison.ts and is not changed.
export function SummaryLine({ text }: { text: string }) {
  const [first, ...rest] = text.split(/(?<=\.)\s+/);
  return (
    <>
      <span className="font-semibold">{first}</span>
      {rest.length > 0 && <span className="font-light text-muted"> {rest.join(" ")}</span>}
    </>
  );
}
