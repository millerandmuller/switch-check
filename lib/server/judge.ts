// The judge call: one request for a whole run. It sends the shuffled,
// name-free answers (lib/judging.ts) and reads the reply strictly.

import { buildJudgePrompt, parseJudgement, shuffleBlind, type Judgement, type JudgeChoice, type JudgeCase } from "../judging.ts";
import { LIMITS } from "../limits.ts";
import type { Check } from "../run-types.ts";
import { timeoutFor, type Deps } from "./deps.ts";

// Less than this left and the judge is not started: a half-finished judgement
// would be worse than an honest "not judged". The quickest judge answers in
// about 4 s and the slowest of the three in about 9 s, so five seconds is
// enough to be worth trying and short enough that the last judge still gets a
// turn when the steps before it ran long.
const MIN_MS_LEFT_TO_JUDGE = 5_000;

// How long one attempt may take: everything left, less a reserve for the next
// judge, and never more than the flat per-attempt cap. The cap drops a judge
// that has gone quiet early instead of waiting out the whole allowance. Seen
// live before the cap: one judge took 41.8 s of a 44 s window and the run
// ended with no judgement at all.
//
// The reserve replaces an even split. Split evenly, 15 s across three judges
// gave the first judge 5 s, and the first judge (Gemini 2.5 Flash, 8.9 s at
// the median) could not answer in 5 s: every time the grid ran to its limit,
// the second judge marked instead. So the attempt holds back only what the
// next judge needs to be started at all (MIN_MS_LEFT_TO_JUDGE), and only when
// that still leaves this attempt the same minimum. A reserve that would leave
// this attempt less than that is not usable, so this attempt takes what is
// left. The last judge has no one to reserve for. With 15 s left: 10 s, then
// the remaining 5 s, then no third turn.
export function attemptDeadline(deps: Pick<Deps, "now">, deadline: number, judgesLeft: number): number {
  const now = deps.now();
  const left = Math.max(0, deadline - now);
  const anotherWaiting = judgesLeft > 1;
  const reserveUsable = left - MIN_MS_LEFT_TO_JUDGE >= MIN_MS_LEFT_TO_JUDGE;
  const reserve = anotherWaiting && reserveUsable ? MIN_MS_LEFT_TO_JUDGE : 0;
  return now + Math.min(LIMITS.judgeAttemptMs, left - reserve);
}

export type JudgeOutcome =
  | { ok: true; judgement: Judgement; unset: number; ms: number; used: JudgeChoice }
  | { ok: false; error: string };

// Tries the judges in order, one attempt each: a judge that fails or returns
// something unreadable hands over to the next. The outcome says which judge
// gave the answer, because the page names it.
export async function judgeAnswers(
  deps: Deps,
  job: { judges: JudgeChoice[]; taskPrompt: string; checks: Check[]; cases: JudgeCase[]; deadline: number },
): Promise<JudgeOutcome> {
  const startedAt = deps.now();
  const blind = shuffleBlind(job.cases, deps.random);
  const prompt = buildJudgePrompt(job.taskPrompt, job.checks, blind);
  let lastError = "The judge returned nothing usable.";
  // A reply that leaves checks unset is kept only if no later judge does better.
  let partial: JudgeOutcome | null = null;
  for (const [attempt, choice] of job.judges.entries()) {
    if (job.deadline - deps.now() < MIN_MS_LEFT_TO_JUDGE) {
      // Out of time: what an earlier judge managed is still better than nothing.
      return partial ?? { ok: false, error: attempt === 0 ? "There was not enough time left to judge." : lastError };
    }
    const completion = await deps.complete({
      model: choice.judge.id,
      prompt,
      maxTokens: LIMITS.judgeMaxTokens,
      timeoutMs: timeoutFor(deps, attemptDeadline(deps, job.deadline, job.judges.length - attempt)),
    });
    if (completion.status === "failed") {
      lastError = completion.reason;
      continue;
    }
    const parsed = parseJudgement(completion.text, blind, job.checks);
    if (parsed.ok) {
      const outcome: JudgeOutcome = { ok: true, judgement: parsed.judgement, unset: parsed.unset, ms: Math.round(deps.now() - startedAt), used: choice };
      if (parsed.unset === 0) return outcome;
      if (partial === null || (partial.ok && parsed.unset < partial.unset)) partial = outcome;
      lastError = `The judge left ${parsed.unset} check${parsed.unset === 1 ? "" : "s"} unset.`;
      continue;
    }
    lastError = parsed.error;
  }
  return partial ?? { ok: false, error: lastError };
}
