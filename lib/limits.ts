// Every cap on a run, in one place. Each has a test (scripts/lib/limits.test.mjs)
// that fails if the value changes without the page text and the spending
// notes changing with it. Nothing here reads the environment or the network.

export const LIMITS = {
  // At most four models in a run, and two are needed for a comparison.
  maxModels: 4,
  minModels: 2,
  // Exactly three test cases per run.
  testCases: 3,
  // Three to five yes or no checks per task.
  minChecks: 3,
  maxChecks: 5,
  // Tokens a candidate model may write per call, as a visible answer.
  maxOutputTokens: 600,
  // Hidden reasoning gets its own allowance on top of the answer's, because on
  // most providers one `max_tokens` covers reasoning and visible output
  // together: with a single 600-token cap a model that reasons can spend all
  // of it before writing anything. 1,024 is the smallest reasoning budget
  // Anthropic accepts, and `max_tokens` has to stay strictly above it
  // (openrouter.ai/docs/use-cases/reasoning-tokens). Reasoning tokens are
  // billed as output tokens, so they are inside the cost figure.
  maxReasoningTokens: 1024,
  // Characters in the task box, and in one test case.
  maxTaskChars: 2000,
  maxTestCaseChars: 1200,
  // A call that has not finished after this is recorded as not tested.
  callTimeoutMs: 45_000,
  // The route is allowed this long in total (seconds, as Vercel counts it).
  routeMaxSeconds: 60,
  // What each step of a run is promised, starting when the step starts.
  // Writing the test is slow and varies (4 to 11 seconds live, and it may be
  // tried twice), so without a share of its own it could leave the model calls
  // a few seconds and turn every cell into "not tested". The three add up to
  // the route's whole allowance (scripts/lib/limits.test.mjs), so every step
  // can be given all of its share whatever the step before it did. A step also
  // gets what the steps before it left unused, so the promise is a floor and
  // not a ceiling.
  writerBudgetMs: 22_000,
  gridBudgetMs: 18_000,
  judgeBudgetMs: 15_000,
  // One judging attempt may take this long at most, so a judge that goes
  // quiet is dropped early and the two after it still get their turn. Three
  // attempts at this cap fit in the judging share and its leftover. Measured
  // on one real judge prompt, six calls each: the three judges answered in
  // 4.2 s, 8.9 s and 2.8 s at the median, with worst cases of 4.7 s, 9.1 s
  // and 15.8 s, so only the rare long tail is cut.
  judgeAttemptMs: 12_000,
  // Tokens the writer and the judge may use. They are not candidates, so they
  // are not held to the 600 above, but they are held to something.
  writerMaxTokens: 3000,
  judgeMaxTokens: 4000,
  // Full checks per UTC day: the whole site, and one visitor. The site cap is
  // what keeps a worst-case day inside the $25 credit limit on the key. At
  // 2026-10-09 prices that limit pays for 32 worst-case checks, so the cap is
  // 30 and not the 40 it was before hidden reasoning got its own billed
  // allowance (scripts/lib/models.test.mjs recomputes this and fails if a day
  // could reach the limit).
  dailyChecksSite: 30,
  dailyChecksVisitor: 5,
  // A finished run is served again for this long when the same task and the
  // same models are asked for. Seconds.
  cacheSeconds: 86_400,
  // How long the follow-ups of a run (your words, the shaped prompt) stay
  // available after it. Seconds.
  ticketSeconds: 3_600,
  // Request bodies larger than this are refused before they are read.
  maxBodyBytes: 20_000,
} as const;

// What one call may be billed for in output, and so what is asked of the
// provider as `max_tokens`: the answer's own allowance plus the hidden
// reasoning allowance. Reasoning tokens are output tokens, so a call that
// thinks to its budget and writes its whole answer is billed for both.
export function billedOutputTokens(answerTokens: number): number {
  return answerTokens + LIMITS.maxReasoningTokens;
}

// What the page says before the first run, built from the numbers above so
// the text and the cap cannot drift apart.
export function limitsNotice(): string {
  return `Each visitor gets ${LIMITS.dailyChecksVisitor} checks a day and the whole site ${LIMITS.dailyChecksSite}, counted from 00:00 UTC. A task is read up to ${LIMITS.maxTaskChars.toLocaleString("en-US")} characters, a run uses up to ${LIMITS.maxModels} models and ${LIMITS.testCases} test cases, and no model writes more than ${LIMITS.maxOutputTokens} tokens per answer, with a further ${LIMITS.maxReasoningTokens.toLocaleString("en-US")} tokens allowed for hidden reasoning, which is charged like any other output. Running the same task on the same models again within a day shows the recorded result.`;
}

// What happens to a task once it is sent. Stated next to the Check button, not
// buried: the person is told before the first run, not after.
export function privacyNotice(): string {
  const hours = LIMITS.cacheSeconds / 3600;
  const ticketMinutes = LIMITS.ticketSeconds / 60;
  return `Your task, the test cases and the answers go to OpenRouter and on to the provider of each model you pick. A finished check, with the task it came from, is kept on the server for ${hours} hours so the same task on the same models is not paid for twice. The follow-ups of a check are kept ${ticketMinutes} minutes. Your address is never stored, only a keyed hash of it for the day's count. Nothing else is saved.`;
}
