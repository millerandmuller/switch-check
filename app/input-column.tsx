import { SampleTag } from "./sample-tag";
import { capsClass } from "./ui";
import { INPUT_MAX_CHARS } from "@/lib/workflow";

// The input column of the rating screen: the prompt as written, closed until
// asked for, and the selected input's full text at the size of the outputs,
// scrolling on its own.
export function InputColumn({
  prompt,
  input,
  position,
  sampleOf,
}: {
  prompt: string;
  input: string;
  position: number;
  // The label of the sample email this input still is, or null.
  sampleOf: string | null;
}) {
  const inputText = (
    <>
      <p className={`${capsClass} mb-3 text-gold-text`}>
        Input {position} · {input.length.toLocaleString("en-US")} of{" "}
        {INPUT_MAX_CHARS.toLocaleString("en-US")} characters
        {sampleOf !== null && <SampleTag label={sampleOf} />}
      </p>
      <pre className="whitespace-pre-wrap font-sans text-base leading-[1.7] [overflow-wrap:anywhere]">
        {input}
      </pre>
    </>
  );

  return (
    <section
      aria-label={`Input ${position}`}
      className="flex min-h-0 min-w-0 flex-col border-b border-line wide:col-start-1 wide:row-start-3 wide:border-b-0 wide:pb-[54px]"
    >
      <details className="border-b border-line px-gutter py-2.5">
        <summary className="cursor-pointer font-caps text-[12px] font-semibold uppercase tracking-[0.06em]">
          Show the prompt
        </summary>
        <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap font-mono text-[12.5px] leading-[1.6] [overflow-wrap:anywhere]">
          {prompt}
        </pre>
      </details>
      {/* Below the side-by-side width the text is closed, so the output comes
          first; from 1,000 px it is always open and scrolls on its own. */}
      <details className="px-gutter py-2.5 wide:hidden">
        <summary className="cursor-pointer font-caps text-[12px] font-semibold uppercase tracking-[0.06em]">
          Show the input
        </summary>
        <div className="mt-2">{inputText}</div>
      </details>
      <div
        role="region"
        aria-label={`Text of input ${position}`}
        tabIndex={0}
        className="hidden px-gutter py-4 wide:block wide:min-h-[320px] wide:flex-[1_1_320px] wide:overflow-auto"
      >
        {inputText}
      </div>
    </section>
  );
}
