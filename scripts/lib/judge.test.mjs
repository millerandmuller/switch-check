// How judging time is shared between the judges tried in turn.
import test from "node:test";
import assert from "node:assert/strict";
import { attemptDeadline, judgeAnswers } from "../../lib/server/judge.ts";
import { judgeOrder } from "../../lib/judging.ts";
import { LIMITS } from "../../lib/limits.ts";
import { candidates } from "./test-helpers.mjs";

const START = 1_000_000;
const msFor = (left, judgesLeft) => attemptDeadline({ now: () => START }, START + left, judgesLeft) - START;

// Every judge goes quiet and uses its whole attempt. Returns what each
// attempt was given, in order.
async function hangingJudges(left) {
  const clock = { t: START };
  const given = [];
  const deps = {
    now: () => clock.t,
    random: () => 0.5,
    complete: async (request) => {
      given.push(request.timeoutMs);
      clock.t += request.timeoutMs;
      return { status: "failed", reason: "No answer.", timedOut: true, ms: request.timeoutMs };
    },
  };
  const judges = judgeOrder(candidates.judges, candidates.candidates.slice(0, 3));
  const outcome = await judgeAnswers(deps, { judges, taskPrompt: "p {input}", checks: [], cases: [], deadline: START + left });
  return { given, outcome };
}

// The case seen live on 2026-10-15: the grid ran to its limit, judging had
// only its 15 s share, and an even split gave the first judge 5 s. Gemini 2.5
// Flash needs 8.9 s at the median, so it never answered and the writer judged.
test("with 15 s left and three judges, the first attempt gets 10 s, not a third", () => {
  assert.equal(candidates.judges.length, 3);
  assert.equal(LIMITS.judgeBudgetMs, 15_000);
  assert.equal(msFor(15_000, 3), 10_000);
});

test("if the first judge hangs, the second gets the remaining 5 s and the third is not started", async () => {
  const { given, outcome } = await hangingJudges(15_000);
  assert.deepEqual(given, [10_000, 5_000]);
  assert.equal(outcome.ok, false);
});

test("with plenty of time left, every attempt is still capped at 12 s", () => {
  assert.equal(LIMITS.judgeAttemptMs, 12_000);
  assert.equal(msFor(40_000, 3), 12_000);
  assert.equal(msFor(40_000, 2), 12_000);
  // 30 s is where the even split and the reserve part: a third was 10 s.
  assert.equal(msFor(30_000, 3), 12_000);
});

test("the last judge gets everything that is left, up to the cap", () => {
  assert.equal(msFor(7_000, 1), 7_000);
  assert.equal(msFor(11_000, 1), 11_000);
  assert.equal(msFor(30_000, 1), 12_000);
});

// Never one judge taking it all while another waits: the 41.8 s failure the
// cap exists for.
test("with 10 s or more left, a hanging first judge still leaves the second at least 5 s", async () => {
  for (const left of [10_000, 12_500, 15_000, 20_000, 30_000, 40_000]) {
    const { given } = await hangingJudges(left);
    assert.ok(given.length >= 2, `with ${left} ms the second judge was never tried`);
    assert.ok(given[1] >= 5_000, `with ${left} ms the second judge was given ${given[1]} ms`);
    assert.ok(given[0] <= LIMITS.judgeAttemptMs, `with ${left} ms the first judge was given ${given[0]} ms`);
  }
});
