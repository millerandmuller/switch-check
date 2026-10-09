import { LIMITS, limitsNotice, privacyNotice } from "@/lib/limits";
import type { ModelConfig, ModelPrices } from "@/lib/models";
import type { RecordedExample } from "@/lib/examples";
import type { Selection } from "@/lib/selection";
import { ModelTiles } from "./model-tiles";
import { fieldClass, helperClass, invalidFieldClass, labelClass, primaryButtonClass, problemClass, secondaryButtonClass } from "./ui";

export type StatusLine = { live: boolean; visitorLeft: number; siteLeft: number; resetsAt: string } | null;

const EXAMPLE_TASK = "Sort my customer emails by urgency and draft a short reply to each.";

// The whole input: one box, the model used today, the tiles, one button. The
// button is the only required click; nothing else has to be done first.
export function TaskForm({
  task,
  problem,
  config,
  prices,
  selection,
  running,
  examples,
  status,
  onTaskChange,
  onCurrentChange,
  onToggle,
  onCheck,
  onExample,
}: {
  task: string;
  problem: string | null;
  config: ModelConfig;
  prices: ModelPrices;
  selection: Selection;
  running: boolean;
  examples: RecordedExample[];
  status: StatusLine;
  onTaskChange: (task: string) => void;
  onCurrentChange: (id: string) => void;
  onToggle: (id: string) => void;
  onCheck: () => void;
  onExample: (example: RecordedExample) => void;
}) {
  const length = Array.from(task.trim()).length;
  const over = length > LIMITS.maxTaskChars;
  const invalid = problem !== null || over;
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onCheck();
      }}
      className="mx-auto w-full max-w-4xl"
    >
      <label htmlFor="task" className={labelClass}>
        What do you want a model to do?
      </label>
      <textarea
        id="task"
        value={task}
        onChange={(event) => onTaskChange(event.target.value)}
        rows={4}
        disabled={running}
        aria-invalid={invalid}
        aria-describedby="task-help"
        className={`${invalid ? invalidFieldClass : fieldClass} block min-h-[8.5rem] resize-y text-[1.12rem] leading-relaxed`}
        placeholder={EXAMPLE_TASK}
      />
      <div id="task-help">
        {problem !== null && (
          <p role="alert" className={problemClass}>
            {problem}
          </p>
        )}
        {problem === null && over && (
          <p role="alert" className={problemClass}>
            The task is {length.toLocaleString("en-US")} characters; the limit is{" "}
            {LIMITS.maxTaskChars.toLocaleString("en-US")}.
          </p>
        )}
        <p className={helperClass}>
          Plain words are enough.{" "}
          <button type="button" onClick={() => onTaskChange(EXAMPLE_TASK)} disabled={running} className="cursor-pointer font-semibold text-accent underline underline-offset-2">
            Try: &ldquo;{EXAMPLE_TASK}&rdquo;
          </button>
          {length > LIMITS.maxTaskChars * 0.9 && (
            <span className="ml-2 tabular-nums">
              {length.toLocaleString("en-US")} of {LIMITS.maxTaskChars.toLocaleString("en-US")}
            </span>
          )}
        </p>
      </div>

      <div className="mt-5">
        <label htmlFor="current" className={labelClass}>
          The model you use today
        </label>
        <select
          id="current"
          value={selection.current}
          disabled={running}
          onChange={(event) => onCurrentChange(event.target.value)}
          className={`${fieldClass} !mt-1 !w-auto min-w-[16rem] cursor-pointer rounded-full py-2`}
        >
          {config.candidates.map((model) => (
            <option key={model.id} value={model.id}>
              {model.provider}: {model.name}
            </option>
          ))}
        </select>
      </div>

      <ModelTiles config={config} prices={prices} selection={selection} disabled={running} onToggle={onToggle} />

      <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">
        <button type="submit" disabled={running} className={`${primaryButtonClass} disabled:cursor-not-allowed disabled:opacity-60`}>
          {running ? "Checking" : "Check"}
        </button>
        <p className="min-w-[16rem] flex-1 text-[13px] leading-snug text-muted" aria-live="polite">
          {status !== null && !status.live
            ? "Live checks are paused for you right now. The recorded examples below still work. "
            : status !== null
              ? `${status.visitorLeft} of ${LIMITS.dailyChecksVisitor} checks left for you today, ${status.siteLeft} of ${LIMITS.dailyChecksSite} on the whole site. `
              : ""}
          {limitsNotice()} {privacyNotice()}
        </p>
      </div>

      {examples.length > 0 && (
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <span className={labelClass}>Or see a recorded example:</span>
          {examples.map((example) => (
            <button key={example.id} type="button" onClick={() => onExample(example)} disabled={running} className={`${secondaryButtonClass} disabled:opacity-60`}>
              {example.title}
            </button>
          ))}
        </div>
      )}
    </form>
  );
}
