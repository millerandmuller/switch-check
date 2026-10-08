// Marks a field that still holds one of the made-up sample emails, so a demo
// input is never mistaken for real client mail. Shared by the form and the
// Ready panel.
import { labelClass } from "./ui";

export function SampleTag({ label }: { label: string }) {
  return (
    <span
      title={label}
      className={`${labelClass} ml-2 align-middle font-semibold`}
    >
      sample
    </span>
  );
}
