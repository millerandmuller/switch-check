"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  asRecordedEvents,
  initialState,
  reduce,
  toRunData,
  type RunEvent,
  type StageId,
} from "@/lib/events";
import type { RecordedExample } from "@/lib/examples";
import type { TaskPlan } from "@/lib/run-types";
import { modelName, type ModelConfig, type ModelPrices } from "@/lib/models";
import { parseCheckRequest } from "@/lib/request";
import { setCurrent, toggleModel, type Selection } from "@/lib/selection";
import { readRun } from "@/lib/stream-client";
import { computeVerdict, summarize, verdictChangeNote, type Verdict } from "@/lib/verdict";
import { Elapsed } from "./elapsed";
import { ShapedPrompt, WordsCompare } from "./followups";
import { PlanView } from "./plan-view";
import { ResultsGrid } from "./results-grid";
import { StageList } from "./stage-list";
import { TaskForm, type StatusLine } from "./task-form";
import { secondaryButtonClass } from "./ui";
import { VerdictCard } from "./verdict-card";

type Refusal = { message: string; offerExamples: boolean };

// The whole page. One task box and one button; everything else appears as the
// run streams in. All state is held here and none is saved: a reload empties
// the page.
export function CheckPage({ config, prices, examples }: { config: ModelConfig; prices: ModelPrices; examples: RecordedExample[] }) {
  const [task, setTask] = useState("");
  const [taskProblem, setTaskProblem] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection>({ models: config.default_models, current: config.default_current });
  const [state, dispatch] = useReducer(reduce, undefined, initialState);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [status, setStatus] = useState<StatusLine>(null);
  const [editState, setEditState] = useState<{ plan: TaskPlan | null; values: string[] }>({ plan: null, values: [] });
  const [planProblem, setPlanProblem] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [stageStarts, setStageStarts] = useState<Partial<Record<StageId, number>>>({});
  const [followStarts, setFollowStarts] = useState<{ words?: number; variant?: number }>({});
  const [previous, setPrevious] = useState<Verdict | null>(null);
  const [nowMs, setNowMs] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const followedFor = useRef<string | null>(null);
  const verdictRef = useRef<HTMLElement | null>(null);
  const scrolledFor = useRef<string | null>(null);
  // True once the first event of the current run has arrived.
  const sawStart = useRef(false);

  const names = useMemo(
    () => Object.fromEntries([...config.candidates, config.writer, ...config.judges].map((model) => [model.id, modelName(config, model.id)])),
    [config],
  );

  const data = useMemo(
    () =>
      toRunData(state, {
        prices: prices.models,
        priceCheckedOn: prices.checked_on,
        names,
        writerName: state.writer ?? config.writer.name,
        judgeName: state.judge?.name ?? config.judges[0].name,
      }),
    [state, prices, names, config],
  );
  const result = useMemo(() => (data !== null && state.phase !== "idle" && state.stages.judge.status === "done" ? computeVerdict(data) : null), [data, state.phase, state.stages.judge.status]);
  const summaries = useMemo(() => (data !== null ? summarize(data) : []), [data]);

  const handle = useCallback((event: RunEvent) => {
    if (event.type === "start") {
      sawStart.current = true;
      setStageStarts({});
      setFollowStarts({});
      setNowMs(Date.now());
    }
    if (event.type === "stage" && event.state === "start") setStageStarts((current) => ({ ...current, [event.stage]: performance.now() }));
    if (event.type === "followup-start") setFollowStarts((current) => ({ ...current, [event.kind]: performance.now() }));
    dispatch(event);
  }, []);

  const refreshStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/status", { cache: "no-store" });
      if (response.ok) setStatus((await response.json()) as StatusLine);
    } catch {
      // The line above the button stays as it was; nothing depends on it.
    }
  }, []);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/status", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: StatusLine) => {
        if (!cancelled && body !== null) setStatus(body);
      })
      .catch(() => {
        // The line above the button stays empty; nothing depends on it.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // The test cases as the person has edited them. They start as the plan's own
  // and start over whenever a new plan arrives.
  const edits =
    state.plan === null
      ? []
      : editState.plan === state.plan
        ? editState.values
        : state.plan.testCases.map((testCase) => testCase.input);

  // Send a request to a route and feed its events into the page.
  const stream = useCallback(
    async (url: string, body: unknown, onRefused: (message: string, reason: string) => void) => {
      const controller = new AbortController();
      abortRef.current?.abort();
      abortRef.current = controller;
      try {
        const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: controller.signal });
        const outcome = await readRun(response, handle);
        if (outcome.kind === "refused") onRefused(outcome.error, outcome.reason);
        else if (!outcome.complete) onRefused("The connection dropped before this finished.", "dropped");
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) onRefused("The connection dropped before this finished.", "dropped");
      }
    },
    [handle],
  );

  const runFollowup = useCallback(
    async (kind: "words" | "shape" | "variant", model: string, ticket: string) => {
      // Follow-ups do not replace the run, so they do not abort it.
      try {
        const response = await fetch("/api/followup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticket, kind, model }) });
        const outcome = await readRun(response, handle);
        if (outcome.kind === "refused") handle({ type: "followup-failed", kind, reason: outcome.error });
        else if (!outcome.complete && kind !== "shape") handle({ type: "followup-failed", kind, reason: "The connection dropped before this finished." });
      } catch {
        handle({ type: "followup-failed", kind, reason: "The connection dropped before this finished." });
      }
    },
    [handle],
  );

  async function check() {
    const parsed = parseCheckRequest({ task, models: selection.models, current: selection.current }, config.candidates.map((model) => model.id));
    if (!parsed.ok) {
      // Nothing starts, so the run of an earlier task must not stay beside it.
      dispatch({ type: "reset" });
      setTaskProblem(parsed.error);
      return;
    }
    setTaskProblem(null);
    setRefusal(null);
    setPlanProblem(null);
    setPrevious(null);
    sawStart.current = false;
    setBusy(true);
    // A refused check starts nothing, so the run of an earlier task must not
    // stay on screen beside the new task's text.
    await stream("/api/check", { task, models: selection.models, current: selection.current }, (message, reason) => {
      // Only a refusal starts nothing. A dropped connection leaves whatever
      // had arrived on screen.
      if (reason !== "dropped" || !sawStart.current) dispatch({ type: "reset" });
      setRefusal({ message, offerExamples: reason === "limit" || reason === "unavailable" || reason === "dropped" });
    });
    setBusy(false);
    void refreshStatus();
  }

  async function runAgain() {
    if (state.ticket === null) return;
    const trimmed = edits.map((text) => text.trim());
    if (trimmed.some((text) => text === "")) {
      setPlanProblem(`Test case ${trimmed.findIndex((text) => text === "") + 1} is empty.`);
      return;
    }
    setPlanProblem(null);
    setRefusal(null);
    if (result !== null && !result.waiting) setPrevious(result.verdict);
    setBusy(true);
    await stream("/api/check", { rerun: { ticket: state.ticket, testCases: trimmed } }, (message, reason) => {
      setPlanProblem(message);
      if (reason === "limit" || reason === "unavailable" || reason === "dropped") setRefusal({ message, offerExamples: true });
    });
    setBusy(false);
    void refreshStatus();
  }

  function showExample(example: RecordedExample) {
    abortRef.current?.abort();
    setBusy(false);
    setRefusal(null);
    setTaskProblem(null);
    setPrevious(null);
    setTask(example.task);
    setSelection({ models: example.models, current: example.current });
    followedFor.current = null;
    for (const event of asRecordedEvents(example.events, "recorded")) handle(event);
  }

  // Once a live run has its verdict, the two follow-ups start by themselves on
  // the recommended model. Each is claimed once per check on the server.
  useEffect(() => {
    if (state.source !== "live" || state.phase !== "done" || state.ticket === null) return;
    if (result === null || result.waiting) return;
    if (followedFor.current === state.ticket) return;
    followedFor.current = state.ticket;
    void runFollowup("words", result.verdict.model, state.ticket);
    void runFollowup("shape", result.verdict.model, state.ticket);
  }, [state.source, state.phase, state.ticket, result, runFollowup]);

  // The verdict lands at the top of the results and the page goes to it.
  const verdictKey = result !== null && !result.waiting ? `${state.runId}` : null;
  useEffect(() => {
    if (verdictKey === null || scrolledFor.current === verdictKey) return;
    scrolledFor.current = verdictKey;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    verdictRef.current?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
    verdictRef.current?.focus({ preventScroll: true });
  }, [verdictKey]);

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // No clipboard permission: the prompt is on screen to select by hand.
    }
  }

  const changeNote = previous !== null && result !== null && !result.waiting ? verdictChangeNote(previous, result.verdict, names) : null;
  const started = state.phase !== "idle";
  const live = state.source === "live";
  const canEdit = live && state.ticket !== null && state.phase === "done" && !busy;
  const judging = state.stages.judge.status === "running";
  const recommended = result !== null && !result.waiting ? result.verdict.model : null;

  return (
    <div className="ground flex min-h-dvh flex-col">
      {/* Decoration only: the name also stands in the header. */}
      <div aria-hidden className="wordmark-box">
        <div className="wordmark">Switch Check</div>
      </div>
      <header className="relative flex flex-wrap items-center gap-x-7 gap-y-2 px-gutter py-3">
        <p className="whitespace-nowrap font-display text-[1.3rem] font-semibold tracking-[-0.01em]">Switch Check</p>
        <p className="text-[13px] text-muted">Nothing is saved on this page. Reloading it empties it.</p>
      </header>

      <main className="relative w-full flex-1 px-gutter pb-12 pt-4">
        <div className="panel flex flex-col gap-7 p-[clamp(16px,2.4vw,34px)]">
          <h1 className="mx-auto max-w-4xl text-balance text-center font-display text-[clamp(2.1rem,4.6vw,3.8rem)] font-semibold leading-[1.05] tracking-[-0.03em]">
            Which model should you use for this? <span className="font-extralight text-soft">Type it and find out.</span>
          </h1>

          <TaskForm
            task={task}
            problem={taskProblem}
            config={config}
            prices={prices}
            selection={selection}
            running={busy}
            examples={examples}
            status={status}
            onTaskChange={(value) => {
              setTask(value);
              setTaskProblem(null);
            }}
            onCurrentChange={(id) => setSelection(setCurrent(selection, id))}
            onToggle={(id) => setSelection(toggleModel(selection, id).selection)}
            onCheck={check}
            onExample={showExample}
          />

          {refusal !== null && (
            <div role="alert" className="mx-auto w-full max-w-4xl rounded-2xl border-l-4 border-worse bg-chip px-4 py-3 text-[15px]">
              <p className="font-semibold">{refusal.message}</p>
              {refusal.offerExamples && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {examples.map((example) => (
                    <button key={example.id} type="button" onClick={() => showExample(example)} className={secondaryButtonClass}>
                      {example.title}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {started && (
            <div className="mx-auto flex w-full max-w-6xl flex-col gap-5" aria-live="polite" aria-busy={state.phase === "running"}>
              <VerdictCard state={state} result={result} changeNote={changeNote} names={names} nowMs={nowMs} verdictRef={verdictRef} />

              {state.source === "live" && state.phase === "running" && (
                <section className="card p-5" aria-label="Progress">
                  <StageList state={state} started={stageStarts} />
                </section>
              )}
              {state.error !== null && (
                <p role="alert" className="rounded-2xl border-l-4 border-worse bg-chip px-4 py-3 text-[15px] font-semibold">
                  {state.error.message}
                </p>
              )}

              <PlanView
                state={state}
                edits={edits}
                canEdit={canEdit}
                running={busy}
                problem={planProblem}
                onEdit={(index, value) => setEditState({ plan: state.plan, values: edits.map((text, at) => (at === index ? value : text)) })}
                onRunAgain={runAgain}
                onCopyPrompt={() => state.plan && void copy(state.plan.prompt)}
                copied={copied}
              />
              <ResultsGrid
                state={state}
                summaries={summaries}
                config={config}
                gridStartedAt={stageStarts.grid ?? null}
                judging={judging}
                onSet={(modelId, testCaseId, checkId, pass) => dispatch({ type: "set-check", modelId, testCaseId, checkId, pass })}
              />
              {state.plan !== null && (
                <WordsCompare state={state} summaries={summaries} config={config} startedAt={followStarts.words ?? null} waitingForVerdict={recommended === null} />
              )}
              <ShapedPrompt
                state={state}
                summaries={summaries}
                config={config}
                canTest={live && state.ticket !== null && state.phase === "done" && state.shape !== null && state.variant.model === null}
                testStartedAt={followStarts.variant ?? null}
                onTest={() => state.ticket && state.shape && void runFollowup("variant", state.shape.model, state.ticket)}
                onCopy={() => state.shape && void copy(state.shape.prompt)}
                copied={copied}
              />
              {state.phase === "running" && state.stages.plan.status === "waiting" && (
                <p className="text-[14px] text-muted">
                  Starting <Elapsed since={stageStarts.plan ?? null} />
                </p>
              )}
            </div>
          )}
        </div>
      </main>

      <footer className="relative px-gutter pb-6 text-[13px] leading-snug text-muted">
        <p>
          Every figure on this page says what it is: measured, estimated, generated, judged or recorded.{" "}
          <a href="/what-changed" className="font-semibold text-accent underline underline-offset-2">
            What changed since the first version
          </a>
          .
        </p>
      </footer>
    </div>
  );
}
