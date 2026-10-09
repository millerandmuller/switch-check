// Every cap on a run has a test, so a change to one cannot go unnoticed.
import test from "node:test";
import assert from "node:assert/strict";
import { billedOutputTokens, LIMITS, limitsNotice, privacyNotice } from "../../lib/limits.ts";
import { routeBudgetMs } from "../../lib/server/deps.ts";

test("a run uses at most four models and needs at least two", () => {
  assert.equal(LIMITS.maxModels, 4);
  assert.equal(LIMITS.minModels, 2);
});

test("a run has exactly three test cases and three to five checks", () => {
  assert.equal(LIMITS.testCases, 3);
  assert.equal(LIMITS.minChecks, 3);
  assert.equal(LIMITS.maxChecks, 5);
});

test("no candidate model may write more than 600 tokens per call", () => {
  assert.equal(LIMITS.maxOutputTokens, 600);
});

// P2-8: hidden reasoning has an allowance of its own, so the 600 above are
// the answer's. 1,024 is the smallest reasoning budget Anthropic accepts.
test("hidden reasoning has its own allowance, at least Anthropic's minimum", () => {
  assert.equal(LIMITS.maxReasoningTokens, 1024);
  assert.ok(LIMITS.maxReasoningTokens >= 1024);
});

// P3: a slow step before the model calls must not shorten theirs, so each
// step has its own allowance and the three together fit the route's.
test("each step is promised a share, and the shares are exactly the route's allowance", () => {
  assert.equal(LIMITS.writerBudgetMs, 25_000);
  assert.equal(LIMITS.gridBudgetMs, 18_000);
  assert.equal(LIMITS.judgeBudgetMs, 12_000);
  // Exactly, not merely within: a share that cannot be met is not a promise,
  // and a share left over is time a visitor waited for nothing.
  assert.equal(LIMITS.writerBudgetMs + LIMITS.gridBudgetMs + LIMITS.judgeBudgetMs, routeBudgetMs());
  // The writing step may be tried twice, so its share covers two slow tries.
  assert.ok(LIMITS.writerBudgetMs >= 2 * 11_000);
});

test("the task box takes 2,000 characters", () => {
  assert.equal(LIMITS.maxTaskChars, 2000);
});

test("a call is given 45 seconds and the route 60", () => {
  assert.equal(LIMITS.callTimeoutMs, 45_000);
  assert.equal(LIMITS.routeMaxSeconds, 60);
});

test("the daily allowance is 5 checks per visitor and 30 for the site", () => {
  assert.equal(LIMITS.dailyChecksVisitor, 5);
  assert.equal(LIMITS.dailyChecksSite, 30);
  assert.ok(LIMITS.dailyChecksVisitor < LIMITS.dailyChecksSite);
});

// Reasoning tokens are output tokens, so what a call may be billed for is its
// answer allowance plus the reasoning allowance. Every cost bound uses this.
test("a call's billed output is its answer allowance plus the reasoning allowance", () => {
  assert.equal(billedOutputTokens(LIMITS.maxOutputTokens), LIMITS.maxOutputTokens + LIMITS.maxReasoningTokens);
  assert.equal(billedOutputTokens(LIMITS.maxOutputTokens), 1624);
  assert.equal(billedOutputTokens(0), LIMITS.maxReasoningTokens);
});

test("a finished run is served again for 24 hours", () => {
  assert.equal(LIMITS.cacheSeconds, 86_400);
});

test("the notice on the page quotes the same numbers as the caps", () => {
  const notice = limitsNotice();
  for (const number of ["5 checks", "30", "2,000", "4 models", "3 test cases", "600 tokens"]) {
    assert.ok(notice.includes(number), `notice is missing ${number}: ${notice}`);
  }
  // The reasoning allowance is paid for, so the page says it is there.
  assert.ok(notice.includes("1,024 tokens") && notice.includes("hidden reasoning"), notice);
  assert.ok(notice.includes("charged"), notice);
});

test("the helper models are held to a cap too", () => {
  assert.ok(LIMITS.writerMaxTokens > 0 && LIMITS.writerMaxTokens <= 4000);
  assert.ok(LIMITS.judgeMaxTokens > 0 && LIMITS.judgeMaxTokens <= 6000);
});

test("the privacy notice tells a person what is sent and how long it is kept", () => {
  const notice = privacyNotice();
  assert.ok(notice.includes("OpenRouter"));
  assert.ok(notice.includes("24 hours"));
  assert.ok(notice.includes("address is never stored"));
  assert.ok(notice.includes("60 minutes"));
  assert.ok(notice.includes("with the task it came from"));
});
