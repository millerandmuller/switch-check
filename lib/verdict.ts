// The verdict rule, and the sentence built from it. Pure and tested. The page
// recomputes this whenever a check is flipped, and the server computes it once
// for a finished run, so there is exactly one rule.
//
// Rule: among the models within one check of the best, pick the cheapest by
// estimated cost per 1,000 runs; ties go to the faster. If that model is the
// one the person uses today the verdict is "stay", otherwise "switch". It is
// "test more" when a model was not tested on every case, or when flipping one
// judged result would change the verdict. While a check is unset, it waits.
//
// The reason is a template filled only with numbers that are on the page.

import {
  costPer1000Runs,
  formatUsd,
  percentLower,
  responseTime,
  type CallUsage,
  type ModelPrice,
} from "./cost-speed.ts";
import type { Figure, FigureState } from "./figure.ts";
import type { Cell, Check, CheckResult, TaskPlan } from "./run-types.ts";

export type ModelSummary = {
  id: string;
  name: string;
  // Test cases this model answered, out of how many were asked.
  answered: number;
  asked: number;
  // Checks passed over checks asked, over the answered cases. null while any
  // of them is unset.
  passed: number | null;
  total: number;
  unset: number;
  costPer1000: Figure<number> | null;
  meanMs: Figure<number> | null;
};

export type LabelledFigure = { label: string; text: string; state: FigureState; note?: string };

export type Verdict = {
  decision: "switch" | "stay" | "test-more";
  // The model the verdict points at: the recommended one. For "stay" it is the
  // current model.
  model: string;
  reason: string;
  evidence: string;
  // The numbers the reason was built from, each with its state.
  figures: LabelledFigure[];
  // One failing line where the models differed, if there was one.
  quote?: { modelId: string; checkQuestion: string; line: string };
};

export type VerdictResult = { waiting: true; reason: string } | { waiting: false; verdict: Verdict };

export type RunData = {
  plan: TaskPlan;
  models: string[];
  current: string;
  cells: Record<string, Record<string, Cell>>;
  judged: Record<string, Record<string, CheckResult[]>>;
  prices: Record<string, ModelPrice>;
  priceCheckedOn: string;
  names: Record<string, string>;
  // Wording of the evidence line.
  writerName: string;
  judgeName: string;
  // True when the run is a recording or a cached run.
  recorded?: boolean;
};

function answeredCalls(data: RunData, modelId: string): CallUsage[] {
  return data.plan.testCases.flatMap((testCase) => {
    const cell = data.cells[modelId]?.[testCase.id];
    return cell?.status === "answered"
      ? [{ inputTokens: cell.inputTokens, outputTokens: cell.outputTokens, ms: cell.ms.value }]
      : [];
  });
}

export function summarize(data: RunData): ModelSummary[] {
  return data.models.map((id) => {
    const calls = answeredCalls(data, id);
    const answeredCases = data.plan.testCases.filter((testCase) => data.cells[id]?.[testCase.id]?.status === "answered");
    const results = answeredCases.flatMap((testCase) => data.judged[id]?.[testCase.id] ?? []);
    const expectedResults = answeredCases.length * data.plan.checks.length;
    const unset = expectedResults - results.filter((result) => result.pass !== null).length;
    // With no answered case there is nothing to count: null, never "0 of 0".
    const passed = unset > 0 || answeredCases.length === 0 ? null : results.filter((result) => result.pass === true).length;
    const cost = costPer1000Runs(calls, data.prices[id], data.priceCheckedOn);
    const time = responseTime(calls, data.recorded === true);
    return {
      id,
      name: data.names[id] ?? id,
      answered: answeredCases.length,
      asked: data.plan.testCases.length,
      passed,
      total: expectedResults,
      unset,
      costPer1000: cost.kind === "estimated" ? cost.usdPer1000Runs : null,
      meanMs: time.kind === "measured" ? time.meanMs : null,
    };
  });
}

// The cheapest model within one check of the best, ties to the faster, then
// by id so the answer never depends on the order the models were listed in.
// null when no model has both a pass count and a cost to compare.
export function pickModel(summaries: ModelSummary[], adjust?: { id: string; delta: number }): string | null {
  const scored = summaries
    .filter((summary) => summary.passed !== null && summary.costPer1000 !== null)
    .map((summary) => ({
      summary,
      passed: (summary.passed as number) + (adjust?.id === summary.id ? adjust.delta : 0),
    }));
  if (scored.length === 0) return null;
  const best = Math.max(...scored.map((entry) => entry.passed));
  const eligible = scored.filter((entry) => entry.passed >= best - 1);
  eligible.sort((a, b) => {
    const byCost = (a.summary.costPer1000?.value ?? Infinity) - (b.summary.costPer1000?.value ?? Infinity);
    if (byCost !== 0) return byCost;
    const byTime = (a.summary.meanMs?.value ?? Infinity) - (b.summary.meanMs?.value ?? Infinity);
    if (byTime !== 0) return byTime;
    return a.summary.id < b.summary.id ? -1 : 1;
  });
  return eligible[0].summary.id;
}

// "3 of 3" style counts need no formatting; this is for the sentence.
function percentWords(percent: number): string {
  return percent < 1 ? "less than 1%" : `${percent}%`;
}

function passFigure(summary: ModelSummary, label: string): LabelledFigure {
  return {
    label,
    text: `${summary.passed} of ${summary.total}`,
    state: "judged",
  };
}

function costFigureOf(summary: ModelSummary, label: string): LabelledFigure | null {
  if (summary.costPer1000 === null) return null;
  return {
    label,
    text: formatUsd(summary.costPer1000.value),
    state: summary.costPer1000.state,
    note: `per 1,000 runs${summary.costPer1000.note ? `, ${summary.costPer1000.note}` : ""}`,
  };
}

// A failing line where the models differed: a check that the recommended model
// passed and another model failed with a quoted line. Failing that, any
// quoted fail of another model; failing that, none.
export function differingQuote(data: RunData, recommended: string): Verdict["quote"] {
  const fails: { modelId: string; check: Check; line: string; recommendedPassed: boolean }[] = [];
  for (const testCase of data.plan.testCases) {
    for (const modelId of data.models) {
      if (modelId === recommended) continue;
      for (const result of data.judged[modelId]?.[testCase.id] ?? []) {
        if (result.pass !== false || result.quote === undefined) continue;
        const check = data.plan.checks.find((candidate) => candidate.id === result.checkId);
        if (check === undefined) continue;
        const own = data.judged[recommended]?.[testCase.id]?.find((entry) => entry.checkId === result.checkId);
        fails.push({ modelId, check, line: result.quote, recommendedPassed: own?.pass === true });
      }
    }
  }
  const chosen = fails.find((fail) => fail.recommendedPassed) ?? fails[0];
  return chosen === undefined ? undefined : { modelId: chosen.modelId, checkQuestion: chosen.check.question, line: chosen.line };
}

export function evidenceLine(data: RunData): string {
  const cases = data.plan.testCases.length;
  const edited = data.plan.testCases.filter((testCase) => testCase.edited).length;
  const flipped = Object.values(data.judged)
    .flatMap((byCase) => Object.values(byCase).flat())
    .filter((result) => result.changedByUser).length;
  const writer = edited === 0 ? `written by ${data.writerName}` : `${edited} edited by you, the rest written by ${data.writerName}`;
  const marks = flipped === 0 ? "" : `, ${flipped} result${flipped === 1 ? "" : "s"} set by you`;
  const cut = Object.values(data.cells)
    .flatMap((byCase) => Object.values(byCase))
    .filter((cell) => cell.status === "answered" && cell.truncated).length;
  const cutText = cut === 0 ? "" : ` ${cut} answer${cut === 1 ? " was" : "s were"} cut off at the token limit and marked as far as they were written.`;
  return `${cases === 3 ? "Three" : cases} test cases, ${writer}, one run, judged by ${data.judgeName}${marks}.${cutText} Enough to point, not to prove.`;
}

export function computeVerdict(data: RunData): VerdictResult {
  const summaries = summarize(data);
  const byId = new Map(summaries.map((summary) => [summary.id, summary]));
  const current = byId.get(data.current);
  if (current === undefined) return { waiting: true, reason: "The model you use today is not in this run." };

  const answeredAny = summaries.some((summary) => summary.answered > 0);
  if (!answeredAny) {
    return { waiting: false, verdict: testMore(data, summaries, current, null, "No model answered, so there is nothing to compare.") };
  }

  const untested = summaries.filter((summary) => summary.answered < summary.asked);
  const waitingOn = summaries.filter((summary) => summary.unset > 0);
  if (waitingOn.length > 0) {
    const count = waitingOn.reduce((sum, summary) => sum + summary.unset, 0);
    return {
      waiting: true,
      reason: `${count} check result${count === 1 ? " is" : "s are"} not set yet. Set them below and the verdict follows.`,
    };
  }

  // Compare only models that answered everything; the others are named in the
  // reason when they are the reason.
  const complete = summaries.filter((summary) => summary.answered === summary.asked);
  const recommendedId = pickModel(complete);

  if (untested.length > 0) {
    const names = untested.map((summary) => `${summary.name} (${summary.answered} of ${summary.asked} test cases answered)`);
    return {
      waiting: false,
      verdict: testMore(
        data,
        summaries,
        current,
        recommendedId,
        `${names.join(", ")} could not be compared fairly, so this run cannot say. Run it again, or compare fewer models.`,
      ),
    };
  }

  if (recommendedId === null) {
    return {
      waiting: false,
      verdict: testMore(data, summaries, current, null, "No model has both a check count and a price, so this run cannot pick one."),
    };
  }

  // Would one flipped result change the answer? Only the pass count of one
  // model moves, by one, so each model has at most two cases to try.
  for (const summary of complete) {
    for (const delta of [1, -1]) {
      const movable = delta === 1 ? (summary.passed as number) < summary.total : (summary.passed as number) > 0;
      if (!movable) continue;
      const other = pickModel(complete, { id: summary.id, delta });
      if (other !== recommendedId) {
        const direction = delta === 1 ? "passed" : "failed";
        return {
          waiting: false,
          verdict: testMore(
            data,
            summaries,
            current,
            recommendedId,
            `One judged result decides this: if ${summary.name} had ${direction} one more check, the answer would be ${nameOf(summaries, other)} instead of ${nameOf(summaries, recommendedId)}. Flip a result below to see it, or run again.`,
          ),
        };
      }
    }
  }

  const recommended = byId.get(recommendedId) as ModelSummary;
  const best = Math.max(...complete.map((summary) => summary.passed as number));
  const allTie = complete.every((summary) => summary.passed === best);
  const decision = recommendedId === data.current ? "stay" : "switch";
  const figures: LabelledFigure[] = [passFigure(recommended, `${recommended.name} checks passed`)];
  const recommendedCost = costFigureOf(recommended, `${recommended.name} cost`);
  if (recommendedCost !== null) figures.push(recommendedCost);

  let reason: string;
  if (decision === "stay") {
    const cheaper = complete.filter(
      (summary) => summary.id !== current.id && (summary.costPer1000?.value ?? Infinity) < (current.costPer1000?.value ?? Infinity),
    );
    const cheaperText =
      cheaper.length === 0
        ? "No cheaper model was in this run."
        : `The cheaper ${cheaper.length === 1 ? "model" : "models"} passed fewer: ${cheaper.map((summary) => `${summary.name} ${summary.passed} of ${summary.total}`).join(", ")}.`;
    reason = `Stay on ${current.name}. It passed ${current.passed} of ${current.total} checks${allTie ? ", the same as every other model here" : ""}. ${cheaperText}`;
    for (const summary of cheaper) figures.push(passFigure(summary, `${summary.name} checks passed`));
  } else {
    reason = switchReason(current, recommended, allTie, figures);
  }

  return {
    waiting: false,
    verdict: {
      decision,
      model: recommendedId,
      reason,
      evidence: evidenceLine(data),
      figures,
      quote: differingQuote(data, recommendedId),
    },
  };
}

function nameOf(summaries: ModelSummary[], id: string | null): string {
  return summaries.find((summary) => summary.id === id)?.name ?? "another model";
}

function switchReason(current: ModelSummary, pick: ModelSummary, allTie: boolean, figures: LabelledFigure[]): string {
  const pickPassed = pick.passed as number;
  const currentPassed = current.passed as number;
  let passPhrase: string;
  if (pickPassed === currentPassed) passPhrase = `the same as ${current.name}`;
  else if (pickPassed > currentPassed) passPhrase = `${pickPassed - currentPassed} more than ${current.name}`;
  else passPhrase = `${currentPassed - pickPassed} fewer than ${current.name}`;

  let costPhrase = "";
  const pickCost = pick.costPer1000?.value;
  const currentCost = current.costPer1000?.value;
  if (pickCost !== undefined && currentCost !== undefined) {
    const lower = percentLower(currentCost, pickCost);
    if (lower === null) costPhrase = ", at a cost that cannot be compared";
    else if (lower > 0) costPhrase = `, at an estimated ${percentWords(lower)} lower cost per 1,000 runs`;
    else if (lower < 0) costPhrase = `, at an estimated ${percentWords(-lower)} higher cost per 1,000 runs`;
    else costPhrase = ", at about the same cost per 1,000 runs";
    const currentFigure = costFigureOf(current, `${current.name} cost`);
    if (currentFigure !== null) figures.push(currentFigure);
    if (lower !== null) {
      figures.push({
        label: lower >= 0 ? "Saving against " + current.name : "Extra cost against " + current.name,
        text: percentWords(Math.abs(lower)),
        state: "estimated",
        note: "per 1,000 runs",
      });
    }
  }
  figures.push(passFigure(current, `${current.name} checks passed`));
  const tie = allTie ? " Every model passed the same number, so the cheapest is the pick." : "";
  return `Switch to ${pick.name}. It passed ${pickPassed} of ${pick.total} checks, ${passPhrase}${costPhrase}.${tie}`;
}

function testMore(
  data: RunData,
  summaries: ModelSummary[],
  current: ModelSummary,
  recommendedId: string | null,
  why: string,
): Verdict {
  return {
    decision: "test-more",
    model: recommendedId ?? current.id,
    reason: `Test more. ${why}`,
    evidence: evidenceLine(data),
    figures: summaries
      .filter((summary) => summary.passed !== null)
      .map((summary) => passFigure(summary, `${summary.name} checks passed`)),
  };
}

// "Before: stay on X. Now: switch to Y." or null when nothing changed.
export function verdictChangeNote(before: Verdict, after: Verdict, names: Record<string, string>): string | null {
  if (before.decision === after.decision && before.model === after.model) return null;
  const phrase = (verdict: Verdict) =>
    verdict.decision === "test-more"
      ? "test more"
      : `${verdict.decision} ${verdict.decision === "stay" ? "on" : "to"} ${names[verdict.model] ?? verdict.model}`;
  return `The verdict changed on this run. Before: ${phrase(before)}. Now: ${phrase(after)}.`;
}

// The checks a person can flip: the same result with its pass inverted and
// marked as changed by them. A result that was unset becomes a pass or fail.
export function setResult(results: CheckResult[], checkId: string, pass: boolean): CheckResult[] {
  return results.map((result) => {
    if (result.checkId !== checkId) return result;
    // A quoted line belongs to a fail the judge made; once the person sets the
    // result, there is no judge's line to show.
    return { checkId, pass, changedByUser: true };
  });
}

