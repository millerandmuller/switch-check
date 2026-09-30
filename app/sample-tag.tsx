// Marks a field that still holds one of the made-up sample emails, so a demo
// input is never mistaken for real client mail. Shared by the form and the
// Ready panel.
export function SampleTag({ label }: { label: string }) {
  return (
    <span
      title={label}
      className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 align-middle text-[10px] font-semibold tracking-wide text-amber-900 dark:bg-amber-950 dark:text-amber-200"
    >
      SAMPLE
    </span>
  );
}
