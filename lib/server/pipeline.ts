// The run, stage by stage, as a stream of events: write the test, run the
// grid, judge, give the verdict. Server only, but it touches nothing outside
// what it is handed: models are called through deps.complete, and the store,
// the limits and the cache belong to the route. That keeps it testable with a
// fake model and a fixed clock, and lets scripts/record-examples.mjs run the
// very same code against the real API.

import { figure } from "../figure.ts";
import { reduce, initialState, toRunData, type FollowupKind, type RunEvent, type RunState, type StageId } from "../events.ts";
import { judgeLabel, judgeOrder, type JudgeCase } from "../judging.ts";
import { LIMITS } from "../limits.ts";
import { modelName, type ModelInfo } from "../models.ts";
import { fillPrompt } from "../plan.ts";
import { INPUT_SLOT, type Cell, type TaskPlan } from "../run-types.ts";
import { computeVerdict } from "../verdict.ts";
import { routeBudgetMs, timeoutFor, type Deps } from "./deps.ts";
import { judgeAnswers } from "./judge.ts";
import { redact, type Completion } from "./openrouter.ts";
import { shapePrompt, writePlan } from "./writer.ts";

// Yields results in the order they finish, not the order they were started.
export async function* inCompletionOrder<T>(tasks: Promise<T>[]): AsyncGenerator<T> {
  const pending = new Map(tasks.map((task, index) => [index, task.then((value) => ({ index, value }))]));
  while (pending.size > 0) {
    const { index, value } = await Promise.race(pending.values());
    pending.delete(index);
    yield value;
  }
}

// When a step must be finished. The step's promised share starts now, however
// long the steps before it took, and whatever they left unused is added on top
// up to `latestEnd` (the route's deadline, less what the steps after it are
// promised). The shares add up to the route's allowance, so the promise can
// always be kept. Before this, the model calls shared one run-wide deadline
// with the writing step, and a writer that took most of it left every cell
// "not tested".
function stepDeadline(deps: Pick<Deps, "now">, promisedMs: number, latestEnd: number): number {
  return Math.max(deps.now() + promisedMs, latestEnd);
}

// The answers of a run, in the shape the judge is given them: one entry per
// test case, with every model that answered it. A case nobody answered is
// left out, because there is nothing to mark.
export function casesToJudge(plan: TaskPlan, cells: RunState["cells"], models: string[]): JudgeCase[] {
  return plan.testCases
    .map((testCase) => ({
      testCaseId: testCase.id,
      input: testCase.input,
      answers: models.flatMap((modelId) => {
        const cell = cells[modelId]?.[testCase.id];
        return cell?.status === "answered" ? [{ modelId, text: cell.text }] : [];
      }),
    }))
    .filter((testCase) => testCase.answers.length > 0);
}

// The judging step as events: which judge answered and every mark it made,
// or an honest "no judge answered". Shared by a run and by judging the same
// answers again later, so both say the same things in the same order.
export async function* judgeEvents(
  deps: Deps,
  job: { judges: ReturnType<typeof judgeOrder>; taskPrompt: string; checks: TaskPlan["checks"]; cases: JudgeCase[]; deadline: number },
): AsyncGenerator<RunEvent> {
  if (job.cases.length === 0) return;
  const outcome = await judgeAnswers(deps, job);
  if (!outcome.ok) {
    yield { type: "judge-failed", reason: outcome.error };
    return;
  }
  const used = outcome.used;
  yield { type: "judge-used", judge: { id: used.judge.id, name: used.judge.name, label: judgeLabel(used) } };
  for (const [modelId, byCase] of Object.entries(outcome.judgement)) {
    for (const [testCaseId, results] of Object.entries(byCase)) {
      yield { type: "judged", modelId, testCaseId, results };
    }
  }
}

// Judges answers that are already on the page, without calling a single
// candidate model again. Used by "Try judging again" after every judge went
// quiet. The whole route is this one step, so it gets the route's allowance,
// and the per-attempt cap keeps three tries inside it.
export async function* runJudgeAgain(deps: Deps, job: { plan: TaskPlan; cases: JudgeCase[]; models: string[] }): AsyncGenerator<RunEvent> {
  const judges = judgeOrder(deps.config.judges, job.models.map((id) => infoOf(deps, id)));
  yield* judgeEvents(deps, {
    judges,
    taskPrompt: job.plan.prompt,
    checks: job.plan.checks,
    cases: job.cases,
    deadline: deps.now() + routeBudgetMs(),
  });
}

export function cellOf(completion: Completion): Cell {
  if (completion.status === "failed") return { status: "not-tested", reason: completion.reason };
  return {
    status: "answered",
    text: completion.text,
    ms: figure(completion.ms, "measured", "this run"),
    inputTokens: completion.inputTokens,
    outputTokens: completion.outputTokens,
    truncated: completion.truncated,
  };
}

function infoOf(deps: Deps, id: string): ModelInfo {
  return deps.config.candidates.find((model) => model.id === id) ?? { id, name: modelName(deps.config, id), provider: "" };
}

function namesOf(deps: Deps, ids: string[]): Record<string, string> {
  return Object.fromEntries([...ids, deps.config.writer.id, ...deps.config.judges.map((judge) => judge.id)].map((id) => [id, modelName(deps.config, id)]));
}

export type CheckJob = {
  task: string;
  models: string[];
  current: string;
  // A run again: the plan of the earlier run with the person's test cases.
  plan?: TaskPlan;
};

// Calls a model for every test case in parallel and yields the cells as they
// finish. Never throws: a call that goes wrong is a not-tested cell.
async function* answerCases(
  deps: Deps,
  job: { models: string[]; template: string; plan: TaskPlan; deadline: number },
): AsyncGenerator<{ modelId: string; testCaseId: string; cell: Cell }> {
  const calls = job.models.flatMap((modelId) =>
    job.plan.testCases.map(async (testCase) => {
      let completion: Completion;
      try {
        completion = await deps.complete({
          model: modelId,
          prompt: fillPrompt(job.template, testCase.input),
          maxTokens: LIMITS.maxOutputTokens,
          timeoutMs: timeoutFor(deps, job.deadline),
        });
      } catch (error) {
        completion = { status: "failed", reason: `The call failed: ${redact(error instanceof Error ? error.message : "unknown error")}`, timedOut: false, ms: 0 };
      }
      return { modelId, testCaseId: testCase.id, cell: cellOf(completion) };
    }),
  );
  yield* inCompletionOrder(calls);
}

export async function* runCheck(deps: Deps, job: CheckJob, runId: string): AsyncGenerator<RunEvent> {
  const startedAt = deps.now();
  const routeDeadline = startedAt + routeBudgetMs();
  const since = () => Math.round(deps.now() - startedAt);
  const stageStartedAt: Partial<Record<StageId, number>> = {};
  let state: RunState = initialState();
  const emit = (event: RunEvent): RunEvent => {
    state = reduce(state, event);
    return event;
  };
  const stage = (id: StageId, change: "start" | "done"): RunEvent => {
    if (change === "start") stageStartedAt[id] = deps.now();
    return emit({ type: "stage", stage: id, state: change, ms: change === "start" ? since() : Math.round(deps.now() - (stageStartedAt[id] ?? deps.now())) });
  };

  const judges = judgeOrder(deps.config.judges, job.models.map((id) => infoOf(deps, id)));
  const planned = judges[0];
  yield emit({
    type: "start",
    runId,
    source: "live",
    at: new Date(startedAt).toISOString(),
    models: job.models,
    current: job.current,
    writer: deps.config.writer.name,
    judge: { id: planned.judge.id, name: planned.judge.name, label: judgeLabel(planned) },
  });

  // 1. The test: written from the person's words, or taken from the run before.
  yield stage("plan", "start");
  let plan: TaskPlan;
  if (job.plan !== undefined) {
    plan = job.plan;
  } else {
    // The writing step is first, so its share is simply the first slice of
    // the route. Both tries together have to fit inside it.
    const written = await writePlan(deps, job.task, startedAt + LIMITS.writerBudgetMs);
    if (!written.ok) {
      yield emit({ type: "error", kind: "failed", message: `The test could not be written: ${written.error}` });
      return;
    }
    plan = written.plan;
  }
  yield stage("plan", "done");
  yield emit({ type: "plan", plan });

  // 2. The grid: every model on every test case, in parallel.
  yield stage("grid", "start");
  // The model calls' share starts here, however long the writing took, and
  // keeps the judge's share back.
  const gridDeadline = stepDeadline(deps, LIMITS.gridBudgetMs, routeDeadline - LIMITS.judgeBudgetMs);
  for await (const result of answerCases(deps, { models: job.models, template: plan.prompt, plan, deadline: gridDeadline })) {
    yield emit({ type: "cell", ...result });
  }
  yield stage("grid", "done");

  // 3. The judge: one call for the whole run, on its own allowance.
  yield stage("judge", "start");
  const judgeDeadline = stepDeadline(deps, LIMITS.judgeBudgetMs, routeDeadline);
  const cases = casesToJudge(plan, state.cells, job.models);
  for await (const event of judgeEvents(deps, { judges, taskPrompt: plan.prompt, checks: plan.checks, cases, deadline: judgeDeadline })) {
    yield emit(event);
  }
  yield stage("judge", "done");

  // 4. The verdict: the same pure rule the page uses.
  const data = toRunData(state, {
    prices: deps.prices.models,
    priceCheckedOn: deps.prices.checked_on,
    names: namesOf(deps, job.models),
    writerName: deps.config.writer.name,
    judgeName: state.judge?.name ?? planned.judge.name,
  });
  if (data !== null) {
    const result = computeVerdict(data);
    if (!result.waiting) {
      yield stage("verdict", "start");
      yield emit({ type: "verdict", verdict: result.verdict });
      yield stage("verdict", "done");
    }
  }
  yield emit({ type: "done", totalMs: since() });
}

export type PromptTestJob = {
  kind: FollowupKind;
  // A prompt with one {input} slot: the person's words, or the shaped prompt.
  template: string;
  plan: TaskPlan;
  model: string;
  // The models of the run, so the judge is chosen the same way.
  models: string[];
};

// Runs a prompt on one model for the three test cases and judges the answers
// with the run's own checks. Used for "your words as typed" and for "Test it".
export async function* runPromptTest(deps: Deps, job: PromptTestJob): AsyncGenerator<RunEvent> {
  const routeDeadline = deps.now() + routeBudgetMs();
  yield { type: "followup-start", kind: job.kind, model: job.model };
  const answered: Record<string, Cell> = {};
  // The same split as a full run, without a writing step: the calls get their
  // share and the judge keeps its own, so neither lives on the other's
  // leftovers.
  for await (const result of answerCases(deps, { models: [job.model], template: job.template, plan: job.plan, deadline: stepDeadline(deps, LIMITS.gridBudgetMs, routeDeadline - LIMITS.judgeBudgetMs) })) {
    answered[result.testCaseId] = result.cell;
    yield { type: "followup-cell", kind: job.kind, testCaseId: result.testCaseId, cell: result.cell };
  }
  const cases: JudgeCase[] = job.plan.testCases.flatMap((testCase) => {
    const cell = answered[testCase.id];
    return cell?.status === "answered" ? [{ testCaseId: testCase.id, input: testCase.input, answers: [{ modelId: job.model, text: cell.text }] }] : [];
  });
  if (cases.length === 0) {
    yield { type: "followup-failed", kind: job.kind, reason: "No answer came back, so there was nothing to judge." };
    return;
  }
  const judges = judgeOrder(deps.config.judges, job.models.map((id) => infoOf(deps, id)));
  const outcome = await judgeAnswers(deps, { judges, taskPrompt: job.template, checks: job.plan.checks, cases, deadline: stepDeadline(deps, LIMITS.judgeBudgetMs, routeDeadline) });
  if (!outcome.ok) {
    yield { type: "followup-failed", kind: job.kind, reason: outcome.error };
    return;
  }
  for (const [testCaseId, results] of Object.entries(outcome.judgement[job.model] ?? {})) {
    yield { type: "followup-judged", kind: job.kind, testCaseId, results };
  }
  yield { type: "followup-done", kind: job.kind };
}

export async function* runShape(deps: Deps, job: { plan: TaskPlan; model: string }): AsyncGenerator<RunEvent> {
  const deadline = deps.now() + routeBudgetMs();
  const shaped = await shapePrompt(deps, job.plan.prompt, modelName(deps.config, job.model), deadline);
  if (!shaped.ok) {
    yield { type: "followup-failed", kind: "shape", reason: shaped.error };
    return;
  }
  yield { type: "shape", model: job.model, prompt: shaped.prompt };
}

// What "your words" means as a template: the task exactly as typed, then the
// test input under it.
export function wordsTemplate(task: string): string {
  return `${task}\n\n${INPUT_SLOT}`;
}

