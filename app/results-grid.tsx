"use client";

import { useState } from "react";
import { formatUsd } from "@/lib/cost-speed";
import type { RunState } from "@/lib/events";
import { figure } from "@/lib/figure";
import { formatMs, tokensText } from "@/lib/format";
import type { ModelConfig } from "@/lib/models";
import { providerOf } from "@/lib/models";
import type { Cell, CheckResult } from "@/lib/run-types";
import type { ModelSummary } from "@/lib/verdict";
import { Elapsed } from "./elapsed";
import { FigureChip } from "./figure-chip";
import { FormattedOutput, RawOutput } from "./formatted-output";
import { ProviderMark } from "./provider-mark";
import { helperClass } from "./ui";

const MARK_CLASS = {
  pass: "bg-[rgba(47,111,58,0.14)] text-better",
  fail: "bg-[rgba(168,67,44,0.14)] text-worse",
  unset: "bg-chip italic text-muted",
} as const;

// One check result as a control: a pill with the check's number and a symbol
// (never colour alone). Pressing it flips the result and the verdict follows.
function CheckMark({
  number,
  question,
  result,
  label,
  onSet,
}: {
  number: number;
  question: string;
  result: CheckResult;
  label: string;
  onSet: (pass: boolean) => void;
}) {
  const kind = result.pass === null ? "unset" : result.pass ? "pass" : "fail";
  const symbol = result.pass === null ? "?" : result.pass ? "✓" : "✕";
  const next = result.pass !== true;
  const words = result.pass === null ? "not set" : result.pass ? "passed" : "failed";
  return (
    <button
      type="button"
      title={question}
      aria-label={`${label}, check ${number}: ${words}${result.changedByUser ? ", set by you" : ""}. Press to mark it ${next ? "passed" : "failed"}.`}
      onClick={() => onSet(next)}
      className={`cursor-pointer rounded-full px-2.5 py-0.5 text-[12.5px] font-semibold tabular-nums ${MARK_CLASS[kind]}`}
    >
      {number} {symbol}
      {result.changedByUser ? "*" : ""}
    </button>
  );
}

function AnswerCell({
  cell,
  label,
  results,
  checks,
  judging,
  onSet,
}: {
  cell: Cell | undefined;
  label: string;
  results: CheckResult[] | undefined;
  checks: { id: string; question: string }[];
  judging: boolean;
  onSet: (checkId: string, pass: boolean) => void;
}) {
  const [raw, setRaw] = useState(false);
  if (cell === undefined) {
    return (
      <p className="flex items-baseline gap-2 text-[14px] text-muted" role="status">
        <span aria-hidden className="text-accent">
          •
        </span>
        Waiting for {label}
      </p>
    );
  }
  if (cell.status === "not-tested") {
    return (
      <div className="text-[14px]">
        <p className="font-semibold">Not tested</p>
        <p className="text-muted">{cell.reason}</p>
        <p className="mt-1 text-[12.5px] text-muted">A model that does not answer is not tested. It is never counted as worse.</p>
      </div>
    );
  }
  const tokens = tokensText(cell.inputTokens, cell.outputTokens);
  const fails = (results ?? []).filter((result) => result.pass === false && result.quote !== undefined);
  return (
    <div>
      <div className="max-h-64 overflow-auto rounded-xl bg-white/40 px-3 py-2" tabIndex={0} aria-label={`Answer from ${label}`}>
        {raw ? <RawOutput text={cell.text} /> : <FormattedOutput text={cell.text} />}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
        <button type="button" onClick={() => setRaw(!raw)} className="cursor-pointer text-[12.5px] font-semibold text-accent underline underline-offset-2">
          {raw ? "Show formatted" : "Show raw"}
        </button>
        <span className="text-[12px] text-muted">{raw ? "shown exactly as returned" : "formatted for reading"}</span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <FigureChip fig={cell.ms} text={formatMs(cell.ms.value)} unit="response time" />
        {tokens !== null && <span className="text-[12px] text-muted">{tokens} tokens</span>}
        {/* The answer's allowance and the hidden-reasoning allowance share one
            cap at the provider, so how much of it was left for the answer is
            not known here. The chip says what is true either way. */}
        {cell.truncated && <span className="rounded-full bg-chip px-2 py-px text-[12px] font-semibold">Cut off at the token limit</span>}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-1.5" role="group" aria-label={`Checks for ${label}`}>
        {results === undefined ? (
          <span className="text-[13px] text-muted">{judging ? "Judging…" : "Not judged"}</span>
        ) : (
          checks.map((check, index) => {
            const result = results.find((entry) => entry.checkId === check.id);
            if (result === undefined) return null;
            return <CheckMark key={check.id} number={index + 1} question={check.question} result={result} label={label} onSet={(pass) => onSet(check.id, pass)} />;
          })
        )}
      </div>
      {fails.map((result) => (
        <p key={result.checkId} className="mt-1.5 text-[12.5px] leading-snug text-muted">
          <b className="text-worse">✕ {checks.findIndex((check) => check.id === result.checkId) + 1}</b> “{result.quote}”
        </p>
      ))}
    </div>
  );
}

export function ResultsGrid({
  state,
  summaries,
  config,
  gridStartedAt,
  judging,
  onSet,
  onJudgeAgain,
  judgeAgainState,
}: {
  state: RunState;
  summaries: ModelSummary[];
  config: ModelConfig;
  gridStartedAt: number | null;
  judging: boolean;
  onSet: (modelId: string, testCaseId: string, checkId: string, pass: boolean) => void;
  // Absent when there is nothing to judge again, such as on a recording.
  onJudgeAgain?: () => void;
  judgeAgainState?: "ready" | "running" | "used";
}) {
  const plan = state.plan;
  if (plan === null || state.models.length === 0) return null;
  const gridRunning = state.stages.grid.status === "running";
  // A header may call a model "not tested" only once every call has finished.
  const gridDone = state.stages.grid.status === "done";
  const anySet = Object.values(state.judged).some((byCase) => Object.values(byCase).some((rs) => rs.some((r) => r.changedByUser)));
  return (
    <section className="card p-4" aria-labelledby="grid-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-1">
        <h2 id="grid-heading" className="font-display text-[1.25rem] font-semibold">
          The answers
        </h2>
        <p className={`${helperClass} !mt-0`}>Press a mark to flip it. The verdict follows.</p>
      </div>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-max border-separate border-spacing-2">
          <thead>
            <tr>
              <td className="w-[11rem]" />
              {summaries.map((summary) => {
                const isCurrent = summary.id === state.current;
                return (
                  <th key={summary.id} scope="col" className="min-w-[16rem] max-w-[24rem] text-left align-top font-normal">
                    <div className="rounded-2xl bg-chip px-3 py-2.5">
                      <ProviderMark provider={providerOf(config, summary.id)} colours={config.providers} />
                      <p className="mt-1 font-display text-[1.1rem] font-semibold leading-tight">{summary.name}</p>
                      {isCurrent && <p className="text-[12px] text-muted">the one you use today</p>}
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {summary.passed !== null ? (
                          <FigureChip fig={figure(`${summary.passed} of ${summary.total}`, "judged")} text={`${summary.passed} of ${summary.total}`} unit="checks passed" />
                        ) : (
                          <span className="text-[12px] text-muted">{summary.answered === 0 ? (gridDone ? "Not tested" : "Waiting for answers") : judging ? "Judging…" : "Checks not set"}</span>
                        )}
                        {gridDone && summary.answered > 0 && summary.answered < summary.asked && (
                          <span className="text-[12px] font-semibold text-worse">Answered {summary.answered} of {summary.asked} test cases</span>
                        )}
                        {summary.costPer1000 !== null && (
                          <FigureChip fig={summary.costPer1000} text={formatUsd(summary.costPer1000.value)} unit="per 1,000 runs" />
                        )}
                        {summary.meanMs !== null && <FigureChip fig={summary.meanMs} text={formatMs(summary.meanMs.value)} unit="mean response" />}
                      </div>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {plan.testCases.map((testCase, rowIndex) => (
              <tr key={testCase.id}>
                <th scope="row" className="w-[11rem] align-top text-left font-normal">
                  <div className="px-1 py-1">
                    <p className="text-[13px] font-semibold">Test case {rowIndex + 1}</p>
                    <p className="line-clamp-6 text-[12.5px] leading-snug text-muted [overflow-wrap:anywhere]">{testCase.input}</p>
                  </div>
                </th>
                {summaries.map((summary) => {
                  const cell = state.cells[summary.id]?.[testCase.id];
                  const running = cell === undefined && gridRunning;
                  return (
                    <td key={summary.id} className="min-w-[16rem] max-w-[24rem] align-top">
                      <div className="rounded-2xl bg-white/45 px-3 py-2.5">
                        {running ? (
                          <p className="flex items-baseline gap-2 text-[14px]" role="status">
                            <span aria-hidden className="text-accent">
                              •
                            </span>
                            <span>Running {summary.name}</span>
                            <span className="text-muted">
                              <Elapsed since={gridStartedAt} />
                            </span>
                          </p>
                        ) : (
                          <AnswerCell
                            cell={cell}
                            label={summary.name}
                            results={state.judged[summary.id]?.[testCase.id]}
                            checks={plan.checks}
                            judging={judging}
                            onSet={(checkId, pass) => onSet(summary.id, testCase.id, checkId, pass)}
                          />
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 px-1">
        <h3 className="text-[13.5px] font-medium text-muted">The checks</h3>
        <ol className="mt-1 list-decimal pl-5 text-[14px] leading-snug">
          {plan.checks.map((check) => (
            <li key={check.id}>{check.question}</li>
          ))}
        </ol>
        <p className="mt-2 text-[12.5px] leading-snug text-muted">
          {state.judge?.label ?? "Not judged yet"}. State: judged.{anySet ? " * means you set that result." : ""}
        </p>
        {state.judgeFailed !== null && (
          <div className="mt-2 rounded-xl bg-chip px-3 py-2 text-[13px] leading-snug">
            <p>
              <span className="font-semibold">No judge answered, so nothing is marked.</span> The answers above are real and were kept. Set
              each check yourself and the verdict follows, or try the judges again.
            </p>
            <p className="mt-1 text-[12px] text-muted">What went wrong: {state.judgeFailed}</p>
            {onJudgeAgain !== undefined && (
              <button
                type="button"
                onClick={onJudgeAgain}
                disabled={judgeAgainState !== "ready"}
                className="mt-2 cursor-pointer rounded-full bg-ink px-3 py-1 text-[13px] font-semibold text-paper disabled:cursor-not-allowed disabled:opacity-60"
              >
                {judgeAgainState === "running" ? "Judging again…" : judgeAgainState === "used" ? "Already tried once" : "Try judging again"}
              </button>
            )}
            {judgeAgainState === "used" && <p className="mt-1 text-[12px] text-muted">One retry per check. The answers are not run again either way.</p>}
          </div>
        )}
      </div>
    </section>
  );
}

