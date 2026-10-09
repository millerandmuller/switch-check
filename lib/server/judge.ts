// The judge call: one request for a whole run. It sends the shuffled,
// name-free answers (lib/judging.ts) and reads the reply strictly.

import { buildJudgePrompt, parseJudgement, shuffleBlind, type Judgement, type JudgeChoice, type JudgeCase } from "../judging.ts";
import { LIMITS } from "../limits.ts";
import type { Check } from "../run-types.ts";
import { timeoutFor, type Deps } from "./deps.ts";

// Less than this left and the judge is not started: a half-finished judgement
// would be worse than an honest "not judged".
const MIN_MS_LEFT_TO_JUDGE = 8_000;

// How long one attempt may take: its own share of what is left, so the judges
// after it keep theirs. Without this a slow first judge used the whole
// allowance (seen live: Gemini took 46 s on a prompt it usually answers in 3)
// and the second judge was never tried, which ended the run with no
// judgement at all rather than with a second opinion.
function attemptDeadline(deps: Pick<Deps, "now">, deadline: number, judgesLeft: number): number {
  const now = deps.now();
  return now + Math.floor(Math.max(0, deadline - now) / Math.max(1, judgesLeft));
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
