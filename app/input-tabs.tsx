import { rowResult, type PastedOutputs, type Reviews } from "@/lib/comparison";
import { preview, sampleLabel, type SampleWorkflow } from "@/lib/workflow";
import { ResultStatus } from "./result-chip";
import { SampleTag } from "./sample-tag";

// The three inputs as a row of tabs across the top of the rating screen: the
// number, the input's label and its row result. Pressing one shows that input
// and its two outputs. The keys 1, 2 and 3 do the same (see RateStep).

const TAB_PREVIEW_CHARS = 48;

export function InputTabs({
  inputs,
  sample,
  outputs,
  reviews,
  selected,
  onSelect,
}: {
  inputs: string[];
  sample: SampleWorkflow;
  outputs: PastedOutputs;
  reviews: Reviews;
  selected: number;
  onSelect: (index: number) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Three inputs, pick one"
      className="grid grid-cols-3 gap-2 px-1"
    >
      {inputs.map((text, index) => {
        const sampleOf = sampleLabel(sample, text);
        const isSelected = index === selected;
        return (
          <button
            key={index}
            type="button"
            aria-pressed={isSelected}
            onClick={() => onSelect(index)}
            className={`flex min-w-0 cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl px-3 py-1.5 text-left wide:rounded-full wide:px-4 ${isSelected ? "card" : "bg-white/45 hover:bg-white/70"}`}
          >
            <span className="font-display text-[1.4rem] font-light leading-none text-accent">{index + 1}</span>
            <b className="min-w-0 flex-1 truncate text-[14px] font-semibold max-wide:sr-only">
              {sampleOf ?? preview(text, TAB_PREVIEW_CHARS)}
              {sampleOf !== null && <SampleTag label={sampleOf} />}
            </b>
            <span className="ml-auto text-[12.5px] font-medium">
              <ResultStatus short result={rowResult(outputs[index], reviews[index])} />
            </span>
          </button>
        );
      })}
    </div>
  );
}
