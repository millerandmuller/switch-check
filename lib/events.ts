// The events a run streams, the state they add up to, and the plain-text
// stream format between the route and the page. One reducer builds the same
// state from a live stream, a cached run and a recorded example, so the page
// has one way to draw all three. Pure.

import { asRecorded } from "./figure.ts";
import type { Cell, CheckResult, TaskPlan } from "./run-types.ts";
import { setResult, type RunData, type Verdict } from "./verdict.ts";
import type { ModelPrice } from "./cost-speed.ts";

export type StageId = "plan" | "grid" | "judge" | "verdict";
export const STAGES: readonly StageId[] = ["plan", "grid", "judge", "verdict"];

export type RunSource = "live" | "cached" | "recorded";

// The judge as the page names it: what ran, and the label under the checks.
export type JudgeInfo = { id: string; name: string; label: string };

export type FollowupKind = "words" | "variant";

export type RunEvent =
  | {
      type: "start";
      runId: string;
      source: RunSource;
      // ISO time the run was made. For a cached or recorded run, the original.
      at: string;
      models: string[];
      current: string;
      writer: string;
      judge: JudgeInfo;
    }
  | { type: "stage"; stage: StageId; state: "start" | "done"; ms: number }
  | { type: "plan"; plan: TaskPlan }
  | { type: "cell"; modelId: string; testCaseId: string; cell: Cell }
  | { type: "judged"; modelId: string; testCaseId: string; results: CheckResult[] }
  | { type: "judge-used"; judge: JudgeInfo }
  | { type: "judge-failed"; reason: string }
  | { type: "verdict"; verdict: Verdict }
  | { type: "ticket"; id: string }
  | { type: "error"; kind: "input" | "limit" | "failed"; message: string }
  | { type: "done"; totalMs: number }
  // Follow-ups of a finished run.
  | { type: "followup-start"; kind: FollowupKind; model: string }
  | { type: "followup-cell"; kind: FollowupKind; testCaseId: string; cell: Cell }
  | { type: "followup-judged"; kind: FollowupKind; testCaseId: string; results: CheckResult[] }
  | { type: "followup-failed"; kind: FollowupKind | "shape"; reason: string }
  | { type: "followup-done"; kind: FollowupKind }
  | { type: "shape"; model: string; prompt: string };

// What the person does on the page that changes the state.
export type UserAction =
  | { type: "reset" }
  | { type: "set-check"; modelId: string; testCaseId: string; checkId: string; pass: boolean };

export type StageState = { status: "waiting" | "running" | "done"; ms: number | null };

export type FollowupState = {
  model: string | null;
  running: boolean;
  done: boolean;
  cells: Record<string, Cell>;
  judged: Record<string, CheckResult[]>;
  failed: string | null;
};

export type RunState = {
  phase: "idle" | "running" | "done";
  source: RunSource | null;
  runId: string | null;
  at: string | null;
  models: string[];
  current: string | null;
  writer: string | null;
  judge: JudgeInfo | null;
  stages: Record<StageId, StageState>;
  plan: TaskPlan | null;
  cells: Record<string, Record<string, Cell>>;
  judged: Record<string, Record<string, CheckResult[]>>;
  judgeFailed: string | null;
  serverVerdict: Verdict | null;
  ticket: string | null;
  words: FollowupState;
  variant: FollowupState;
  shape: { model: string; prompt: string } | null;
  shapeFailed: string | null;
  error: { kind: "input" | "limit" | "failed"; message: string } | null;
  totalMs: number | null;
};

function emptyFollowup(): FollowupState {
  return { model: null, running: false, done: false, cells: {}, judged: {}, failed: null };
}

export function initialState(): RunState {
  return {
    phase: "idle",
    source: null,
    runId: null,
    at: null,
    models: [],
    current: null,
    writer: null,
    judge: null,
    stages: {
      plan: { status: "waiting", ms: null },
      grid: { status: "waiting", ms: null },
      judge: { status: "waiting", ms: null },
      verdict: { status: "waiting", ms: null },
    },
    plan: null,
    cells: {},
    judged: {},
    judgeFailed: null,
    serverVerdict: null,
    ticket: null,
    words: emptyFollowup(),
    variant: emptyFollowup(),
    shape: null,
    shapeFailed: null,
    error: null,
    totalMs: null,
  };
}

function withFollowup(state: RunState, kind: FollowupKind, change: (current: FollowupState) => FollowupState): RunState {
  return { ...state, [kind]: change(state[kind]) };
}

export function reduce(state: RunState, event: RunEvent | UserAction): RunState {
  switch (event.type) {
    case "reset":
      return initialState();
    case "start":
      return {
        ...initialState(),
        phase: "running",
        source: event.source,
        runId: event.runId,
        at: event.at,
        models: event.models,
        current: event.current,
        writer: event.writer,
        judge: event.judge,
      };
    case "stage": {
      const stages = {
        ...state.stages,
        [event.stage]: event.state === "start" ? { status: "running" as const, ms: null } : { status: "done" as const, ms: event.ms },
      };
      return { ...state, stages };
    }
    case "plan":
      return { ...state, plan: event.plan };
    case "cell":
      return {
        ...state,
        cells: { ...state.cells, [event.modelId]: { ...state.cells[event.modelId], [event.testCaseId]: event.cell } },
      };
    case "judged":
      return {
        ...state,
        judged: { ...state.judged, [event.modelId]: { ...state.judged[event.modelId], [event.testCaseId]: event.results } },
      };
    case "judge-used":
      return { ...state, judge: event.judge };
    case "judge-failed": {
      // Every answered cell gets unset checks the person can set.
      if (state.plan === null) return { ...state, judgeFailed: event.reason };
      const judged: RunState["judged"] = { ...state.judged };
      for (const [modelId, byCase] of Object.entries(state.cells)) {
        for (const [caseId, cell] of Object.entries(byCase)) {
          if (cell.status !== "answered") continue;
          const results = (state.plan.checks).map((check) => ({ checkId: check.id, pass: null, changedByUser: false }));
          judged[modelId] = { ...judged[modelId], [caseId]: results };
        }
      }
      return { ...state, judged, judgeFailed: event.reason };
    }
    case "verdict":
      return { ...state, serverVerdict: event.verdict };
    case "ticket":
      return { ...state, ticket: event.id };
    case "error":
      return { ...state, phase: "done", error: { kind: event.kind, message: event.message } };
    case "done":
      return { ...state, phase: "done", totalMs: event.totalMs };
    case "set-check": {
      const results = state.judged[event.modelId]?.[event.testCaseId];
      if (results === undefined) return state;
      return {
        ...state,
        judged: {
          ...state.judged,
          [event.modelId]: { ...state.judged[event.modelId], [event.testCaseId]: setResult(results, event.checkId, event.pass) },
        },
      };
    }
    case "followup-start":
      return withFollowup(state, event.kind, () => ({ ...emptyFollowup(), model: event.model, running: true }));
    case "followup-cell":
      return withFollowup(state, event.kind, (current) => ({ ...current, cells: { ...current.cells, [event.testCaseId]: event.cell } }));
    case "followup-judged":
      return withFollowup(state, event.kind, (current) => ({ ...current, judged: { ...current.judged, [event.testCaseId]: event.results } }));
    case "followup-failed":
      if (event.kind === "shape") return { ...state, shapeFailed: event.reason };
      return withFollowup(state, event.kind, (current) => ({ ...current, running: false, done: true, failed: event.reason }));
    case "followup-done":
      return withFollowup(state, event.kind, (current) => ({ ...current, running: false, done: true }));
    case "shape":
      return { ...state, shape: { model: event.model, prompt: event.prompt }, shapeFailed: null };
  }
}

export function replay(events: RunEvent[]): RunState {
  return events.reduce<RunState>((state, event) => reduce(state, event), initialState());
}

// The pass counts and ticket are the only things a cached or recorded run does
// not carry over: it has no ticket, so nothing live can be started from it.
export function withoutTicket(events: RunEvent[]): RunEvent[] {
  return events.filter((event) => event.type !== "ticket");
}

// A saved run replayed as a recording. Measured times become recorded times:
// nothing in it was timed just now.
export function asRecordedEvents(events: RunEvent[], source: "cached" | "recorded"): RunEvent[] {
  return withoutTicket(events).map((event) => {
    if (event.type === "start") return { ...event, source };
    if (event.type === "cell" || event.type === "followup-cell") {
      return event.cell.status === "answered" ? { ...event, cell: { ...event.cell, ms: asRecorded(event.cell.ms) } } : event;
    }
    return event;
  });
}

export function toRunData(
  state: RunState,
  context: { prices: Record<string, ModelPrice>; priceCheckedOn: string; names: Record<string, string>; writerName: string; judgeName: string },
): RunData | null {
  if (state.plan === null || state.current === null) return null;
  return {
    plan: state.plan,
    models: state.models,
    current: state.current,
    cells: state.cells,
    judged: state.judged,
    recorded: state.source !== null && state.source !== "live",
    ...context,
  };
}

// The run stream is one JSON object per line.
export function encodeEvent(event: RunEvent): string {
  return `${JSON.stringify(event)}\n`;
}

// Splits what has arrived so far into whole lines and the unfinished rest.
export function splitLines(buffer: string): { lines: string[]; rest: string } {
  const parts = buffer.split("\n");
  const rest = parts.pop() ?? "";
  return { lines: parts.filter((line) => line.trim() !== ""), rest };
}

export function parseEventLine(line: string): RunEvent | null {
  try {
    const parsed: unknown = JSON.parse(line);
    if (typeof parsed === "object" && parsed !== null && typeof (parsed as { type?: unknown }).type === "string") {
      return parsed as RunEvent;
    }
  } catch {
    // A line that is not JSON is dropped; the stream goes on.
  }
  return null;
}
