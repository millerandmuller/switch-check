// The run, stage by stage, against a fake model and a fixed clock.
import test from "node:test";
import assert from "node:assert/strict";
import { casesToJudge, inCompletionOrder, runCheck, runJudgeAgain, runPromptTest, runShape, wordsTemplate } from "../../lib/server/pipeline.ts";
import { buildShapePrompt, buildWriterPrompt, writePlan } from "../../lib/server/writer.ts";
import { initialState, reduce, replay } from "../../lib/events.ts";
import { computeVerdict } from "../../lib/verdict.ts";
import { toRunData } from "../../lib/events.ts";
import { LIMITS } from "../../lib/limits.ts";
import { routeBudgetMs } from "../../lib/server/deps.ts";
import { candidates, prices, depsWith, judgeReplyFor, planBody, SONNET, LUNA, HAIKU } from "./test-helpers.mjs";

const WRITER = "google/gemini-3.8-flash";
const JUDGE1 = "google/gemini-2.5-flash";
const JUDGE2 = "google/gemini-3.8-flash";
const JUDGE3 = "mistralai/mistral-medium-3.1";

// One override per seat: `judge` is the first judge, `judge2` the second and
// `last` the third. The writer is also the second judge, so that entry is
// told apart by what it was asked.
function script(overrides = {}) {
  return {
    [WRITER]: (request) => {
      if (request.prompt.startsWith("You prepare a fair test")) return overrides.writer ? overrides.writer(request) : JSON.stringify(planBody());
      if (request.prompt.startsWith("You are marking answers")) return overrides.judge2 ? overrides.judge2(request) : judgeReplyFor(request);
      return JSON.stringify({ prompt: "Shaped for you.\n{input}" });
    },
    [SONNET]: (request) => (overrides.sonnet ? overrides.sonnet(request) : "Sonnet answer"),
    [LUNA]: (request) => (overrides.luna ? overrides.luna(request) : "Luna answer"),
    [HAIKU]: (request) => (overrides.haiku ? overrides.haiku(request) : "Haiku answer"),
    [JUDGE1]: (request) => (overrides.judge ? overrides.judge(request) : judgeReplyFor(request)),
    [JUDGE3]: (request) => (overrides.last ? overrides.last(request) : judgeReplyFor(request)),
  };
}

async function collect(generator) {
  const out = [];
  for await (const event of generator) out.push(event);
  return out;
}

const job = { task: "Sort my tickets", models: [SONNET, LUNA, HAIKU], current: SONNET };

test("results arrive in the order they finish", async () => {
  const slow = new Promise((resolve) => setTimeout(() => resolve("slow"), 30));
  const fast = new Promise((resolve) => setTimeout(() => resolve("fast"), 5));
  assert.deepEqual(await collect(inCompletionOrder([slow, fast])), ["fast", "slow"]);
});

test("a run goes through the stages in order and ends with a verdict and done", async () => {
  const { deps } = depsWith(script());
  const events = await collect(runCheck(deps, job, "run-1"));
  const kinds = events.map((e) => (e.type === "stage" ? `${e.stage}:${e.state}` : e.type));
  const order = kinds.filter((k, i) => i === 0 || k !== kinds[i - 1]);
  assert.deepEqual(
    [order[0], order[1], order[2], order[3]],
    ["start", "plan:start", "plan:done", "plan"],
  );
  assert.ok(kinds.indexOf("grid:start") < kinds.indexOf("cell"));
  assert.ok(kinds.lastIndexOf("cell") < kinds.indexOf("grid:done"));
  assert.ok(kinds.indexOf("grid:done") < kinds.indexOf("judge:start"));
  assert.ok(kinds.lastIndexOf("judged") < kinds.indexOf("judge:done"));
  assert.ok(kinds.indexOf("judge:done") < kinds.indexOf("verdict:start"));
  assert.equal(kinds.at(-1), "done");
  assert.equal(events.filter((e) => e.type === "cell").length, 9, "three models on three test cases");
  assert.equal(events.filter((e) => e.type === "judged").length, 9);
});

test("the start event names the models, the writer and the judge", async () => {
  const { deps } = depsWith(script());
  const [start] = await collect(runCheck(deps, job, "run-1"));
  assert.deepEqual([start.runId, start.source, start.writer, start.current], ["run-1", "live", "Gemini 3.8 Flash", SONNET]);
  assert.equal(start.judge.id, JUDGE1);
  assert.match(start.judge.label, /model names hidden, answer order shuffled/);
});

test("every candidate call carries the 600 token cap and the test case in the prompt", async () => {
  const { deps, calls } = depsWith(script());
  await collect(runCheck(deps, job, "run-1"));
  const candidateCalls = calls.filter((c) => job.models.includes(c.model));
  assert.equal(candidateCalls.length, 9);
  for (const call of candidateCalls) {
    assert.equal(call.maxTokens, LIMITS.maxOutputTokens);
    assert.ok(call.timeoutMs <= LIMITS.callTimeoutMs);
    assert.ok(!call.prompt.includes("{input}"), "the slot is filled");
  }
  const prompts = new Set(candidateCalls.map((c) => c.prompt));
  assert.equal(prompts.size, 3, "one prompt per test case, the same for every model");
});

test("the writer and the judge are held to their own caps", async () => {
  const { deps, calls } = depsWith(script());
  await collect(runCheck(deps, job, "run-1"));
  assert.equal(calls[0].maxTokens, LIMITS.writerMaxTokens);
  assert.equal(calls.at(-1).maxTokens, LIMITS.judgeMaxTokens);
});

test("the judge is sent no model name and the checks were written before any answer existed", async () => {
  const { deps, calls } = depsWith(script());
  await collect(runCheck(deps, job, "run-1"));
  const writerAt = calls.findIndex((c) => c.prompt.startsWith("You prepare a fair test"));
  const firstAnswerAt = calls.findIndex((c) => job.models.includes(c.model));
  const judgeCall = calls.find((c) => c.prompt.startsWith("You are marking answers"));
  assert.ok(writerAt === 0 && writerAt < firstAnswerAt);
  for (const model of candidates.candidates) assert.ok(!judgeCall.prompt.includes(model.name) && !judgeCall.prompt.includes(model.id));
});

test("the verdict the server sends is the one the page's own rule gives", async () => {
  const { deps } = depsWith(script());
  const events = await collect(runCheck(deps, job, "run-1"));
  const state = replay(events);
  const data = toRunData(state, { prices: prices.models, priceCheckedOn: prices.checked_on, names: Object.fromEntries(candidates.candidates.map((m) => [m.id, m.name])), writerName: "Gemini 3.8 Flash", judgeName: state.judge.name });
  const again = computeVerdict(data);
  assert.deepEqual(state.serverVerdict, again.verdict);
  assert.equal(state.serverVerdict.decision, "switch", "all tie at the top, the cheapest wins");
});

test("a model that fails is not tested, with its reason, and the others still finish", async () => {
  const { deps } = depsWith(script({ luna: () => ({ status: "failed", reason: "No answer within 45 seconds.", timedOut: true, ms: 45_000 }) }));
  const events = await collect(runCheck(deps, job, "run-1"));
  const lunaCells = events.filter((e) => e.type === "cell" && e.modelId === LUNA);
  assert.equal(lunaCells.length, 3);
  assert.ok(lunaCells.every((e) => e.cell.status === "not-tested" && e.cell.reason === "No answer within 45 seconds."));
  assert.equal(events.filter((e) => e.type === "judged" && e.modelId === LUNA).length, 0);
  assert.equal(events.filter((e) => e.type === "judged").length, 6);
  const verdict = events.find((e) => e.type === "verdict").verdict;
  assert.equal(verdict.decision, "test-more");
  assert.match(verdict.reason, /GPT-6 Luna \(0 of 3 test cases answered\)/);
});

test("a call that throws is a not-tested cell, never a crashed run", async () => {
  const { deps } = depsWith(script({ haiku: () => { throw new Error("boom"); } }));
  const events = await collect(runCheck(deps, job, "run-1"));
  const cell = events.find((e) => e.type === "cell" && e.modelId === HAIKU).cell;
  assert.equal(cell.status, "not-tested");
  assert.match(cell.reason, /boom/);
  assert.equal(events.at(-1).type, "done");
});

test("when the judge fails, the checks stay unset and no verdict is claimed", async () => {
  const { deps } = depsWith(script({ judge: () => "I cannot judge this.", judge2: () => "Nor can I.", last: () => "Neither can I." }));
  const events = await collect(runCheck(deps, job, "run-1"));
  assert.ok(events.some((e) => e.type === "judge-failed"));
  assert.ok(!events.some((e) => e.type === "verdict"));
  const state = replay(events);
  assert.ok(Object.values(state.judged).every((byCase) => Object.values(byCase).every((rs) => rs.every((r) => r.pass === null))));
  assert.equal(events.at(-1).type, "done");
});

test("a judge that fails hands over to the next judge, and the page names the one that ran", async () => {
  const { deps, calls } = depsWith(script({ judge: () => "not json" }));
  const events = await collect(runCheck(deps, job, "run-1"));
  assert.ok(calls.some((c) => c.model === JUDGE2 && c.prompt.startsWith("You are marking answers")));
  const used = events.find((e) => e.type === "judge-used").judge;
  assert.equal(used.id, JUDGE2);
  assert.match(events.find((e) => e.type === "verdict").verdict.evidence, /judged by Gemini 3\.8 Flash/);
});

test("if the writer cannot produce a usable test, the run ends with a plain error", async () => {
  const { deps, calls } = depsWith(script({ writer: () => JSON.stringify(planBody({ checks: ["only one?"] })) }));
  const events = await collect(runCheck(deps, job, "run-1"));
  const error = events.find((e) => e.type === "error");
  assert.equal(error.kind, "failed");
  assert.match(error.message, /The test could not be written: There must be 3 to 5/);
  assert.equal(calls.filter((c) => c.prompt.startsWith("You prepare a fair test")).length, 2, "one retry, then give up");
  assert.ok(!events.some((e) => e.type === "cell"));
});

test("the writer's second try is told what was wrong", async () => {
  let n = 0;
  const { deps, calls } = depsWith(script({ writer: () => (++n === 1 ? JSON.stringify(planBody({ prompt: "no slot" })) : JSON.stringify(planBody())) }));
  const result = await writePlan(deps, "Sort my tickets", Date.now() + 50_000);
  assert.equal(result.ok, true);
  assert.match(calls[1].prompt, /previous reply was refused: The prompt must contain \{input\} exactly once/);
});

test("running again uses the earlier plan, with the person's test cases marked as edited", async () => {
  const { deps, calls } = depsWith(script());
  const plan = { ...planBody(), testCases: [{ id: "t1", input: "mine", edited: true }, { id: "t2", input: "b" }, { id: "t3", input: "c" }], checks: [{ id: "c1", question: "q1?" }, { id: "c2", question: "q2?" }, { id: "c3", question: "q3?" }], additions: ["a"] };
  const events = await collect(runCheck(deps, { ...job, plan }, "run-2"));
  assert.ok(!calls.some((c) => c.prompt.startsWith("You prepare a fair test")), "the writer is not called again");
  assert.ok(calls.some((c) => c.prompt.includes("mine")));
  assert.match(events.find((e) => e.type === "verdict").verdict.evidence, /1 edited by you/);
});

test("the route's time allowance shortens the last calls", async () => {
  const clock = { t: 1_000_000 };
  const base = depsWith(script());
  const deps = { ...base.deps, now: () => clock.t, complete: async (request) => { clock.t += 20_000; return base.deps.complete(request); } };
  const events = await collect(runCheck(deps, job, "run-1"));
  // The writer took 20 s and the grid 20 s; the judge needs at least 8 s of the 55 and gets it or says why not.
  assert.equal(events.at(-1).type, "done");
  const timeouts = base.calls.map((c) => c.timeoutMs);
  assert.ok(timeouts.every((t) => t <= LIMITS.callTimeoutMs && t >= 1000));
  assert.ok(timeouts.at(-1) < LIMITS.callTimeoutMs, "the last call was given less than the full 45 s");
});

// P3: the writing step took 4 to 11 s live and can take much longer. When it
// shared one run-wide deadline with the model calls, a slow writer left them
// a few seconds and every cell read "not tested".
test("a slow writing step does not eat the model calls' allowance", async () => {
  const clock = { t: 1_000_000 };
  const base = depsWith(script());
  const deps = {
    ...base.deps,
    now: () => clock.t,
    complete: async (request) => {
      // The writer takes 50 of the route's 55 seconds; the answers are instant.
      if (request.prompt.startsWith("You prepare a fair test")) clock.t += 50_000;
      return base.deps.complete(request);
    },
  };
  const events = await collect(runCheck(deps, job, "run-1"));
  const candidateCalls = base.calls.filter((c) => job.models.includes(c.model));
  assert.equal(candidateCalls.length, 9);
  for (const call of candidateCalls) {
    assert.ok(call.timeoutMs >= LIMITS.gridBudgetMs, `a model call was given only ${call.timeoutMs} ms after a slow writer`);
  }
  const cells = events.filter((e) => e.type === "cell");
  assert.ok(cells.length === 9 && cells.every((e) => e.cell.status === "answered"), "every cell was answered, none timed out");
  // The judge's share starts when the judge starts, so there is still a
  // verdict. The share belongs to the step and is divided between the judges,
  // so one attempt gets a fraction of it, never less than that fraction.
  const judgeCalls = base.calls.filter((c) => c.prompt.startsWith("You are marking answers"));
  assert.ok(judgeCalls.length > 0, "the judge ran at all");
  const ownShare = Math.floor(LIMITS.judgeBudgetMs / candidates.judges.length);
  for (const call of judgeCalls) assert.ok(call.timeoutMs >= ownShare, `the judge was given only ${call.timeoutMs} ms of its ${ownShare} ms share`);
  assert.ok(events.some((e) => e.type === "judged"));
  assert.ok(events.some((e) => e.type === "verdict"), "a verdict, not nine not-tested cells");
});

test("the writing step gets its share and no more, and what it leaves goes to the model calls", async () => {
  const { deps, calls } = depsWith(script());
  await collect(runCheck(deps, job, "run-1"));
  const writerCalls = calls.filter((c) => c.prompt.startsWith("You prepare a fair test"));
  assert.ok(writerCalls.length > 0);
  for (const call of writerCalls) assert.ok(call.timeoutMs <= LIMITS.writerBudgetMs, `the writer was given ${call.timeoutMs} ms`);
  // This writer answered at once, so the model calls get their own share plus
  // what it left: a promised share is a floor, not a ceiling.
  const candidateCalls = calls.filter((c) => job.models.includes(c.model));
  for (const call of candidateCalls) {
    assert.ok(call.timeoutMs > LIMITS.gridBudgetMs, `a model call got only its floor (${call.timeoutMs} ms) after a fast writer`);
    assert.ok(call.timeoutMs <= LIMITS.callTimeoutMs);
  }
});

test("your words are run as typed with the test input under them, then judged with the same checks", async () => {
  const { deps, calls } = depsWith(script());
  const plan = { ...planBody(), testCases: planBody().testInputs.map((input, i) => ({ id: `t${i + 1}`, input })), checks: planBody().checks.map((question, i) => ({ id: `c${i + 1}`, question })), additions: ["a"] };
  const events = await collect(runPromptTest(deps, { kind: "words", template: wordsTemplate("Sort my tickets"), plan, model: LUNA, models: [SONNET, LUNA] }));
  assert.equal(events[0].type, "followup-start");
  assert.equal(events.filter((e) => e.type === "followup-cell").length, 3);
  assert.equal(events.filter((e) => e.type === "followup-judged").length, 3);
  assert.equal(events.at(-1).type, "followup-done");
  const asked = calls.filter((c) => c.model === LUNA).map((c) => c.prompt);
  assert.ok(asked.every((p) => p.startsWith("Sort my tickets\n\n")));
  assert.ok(asked.some((p) => p.endsWith("I was charged twice.")));
});

test("a follow-up with no answers says so instead of judging nothing", async () => {
  const { deps } = depsWith(script({ luna: () => ({ status: "failed", reason: "x", timedOut: false, ms: 1 }) }));
  const plan = { ...planBody(), testCases: planBody().testInputs.map((input, i) => ({ id: `t${i + 1}`, input })), checks: planBody().checks.map((question, i) => ({ id: `c${i + 1}`, question })), additions: ["a"] };
  const events = await collect(runPromptTest(deps, { kind: "variant", template: "{input}", plan, model: LUNA, models: [SONNET, LUNA] }));
  assert.equal(events.at(-1).type, "followup-failed");
  assert.match(events.at(-1).reason, /nothing to judge/);
});

test("the shaped prompt keeps its slot, or the writer is refused", async () => {
  const { deps } = depsWith(script());
  const plan = { ...planBody(), additions: ["a"], testCases: [], checks: [] };
  const ok = await collect(runShape(deps, { plan, model: LUNA }));
  assert.deepEqual(ok, [{ type: "shape", model: LUNA, prompt: "Shaped for you.\n{input}" }]);
  const { deps: bad } = depsWith({ [WRITER]: () => JSON.stringify({ prompt: "lost the slot" }) });
  const refused = await collect(runShape(bad, { plan, model: LUNA }));
  assert.equal(refused[0].type, "followup-failed");
  assert.equal(refused[0].kind, "shape");
});

test("the writer's prompt states every rule the page depends on", () => {
  const prompt = buildWriterPrompt("Sort my tickets");
  for (const needle of ["{input}", "exactly 3", "3 to 5", "yes or no", "one-response", "project", "slice", "before any answer exists", "every test input", "<<<TASK>>>", "Sort my tickets"]) {
    assert.ok(prompt.includes(needle), `writer prompt is missing: ${needle}`);
  }
  const shape = buildShapePrompt("Do it.\n{input}", "GPT-6 Luna");
  assert.ok(shape.includes("GPT-6 Luna") && shape.includes("{input}") && shape.includes("JSON only"));
});

test("a judge reply that leaves checks unset hands over to the next judge, and the fuller answer is kept", async () => {
  const { deps, calls } = depsWith(script({ judge: () => JSON.stringify({ verdicts: [] }) }));
  const events = await collect(runCheck(deps, job, "run-1"));
  assert.ok(calls.some((c) => c.model === JUDGE2 && c.prompt.startsWith("You are marking answers")), "the second judge was tried");
  assert.equal(events.find((e) => e.type === "judge-used").judge.id, JUDGE2);
  assert.ok(events.some((e) => e.type === "verdict"));
});

test("if every judge leaves some checks unset, the one that left fewest is used and the rest wait for the person", async () => {
  const partial = (request) => {
    const full = JSON.parse(judgeReplyFor(request));
    full.verdicts = full.verdicts.slice(1);
    return JSON.stringify(full);
  };
  const { deps } = depsWith(script({ judge: partial, judge2: partial, last: partial }));
  const events = await collect(runCheck(deps, job, "run-1"));
  const state = replay(events);
  assert.ok(events.some((e) => e.type === "judged"));
  assert.ok(Object.values(state.judged).some((byCase) => Object.values(byCase).some((results) => results.some((r) => r.pass === null))), "some checks are left for the person to set");
  assert.ok(!events.some((e) => e.type === "verdict"), "no verdict while checks are unset");
});

test("when time runs out after a partial judgement, the partial result is kept, not thrown away", async () => {
  const clock = { t: 1_000_000 };
  const base = depsWith(script({ judge: (request) => { const full = JSON.parse(judgeReplyFor(request)); full.verdicts = full.verdicts.slice(1); clock.t += 50_000; return JSON.stringify(full); } }));
  const deps = { ...base.deps, now: () => clock.t };
  const events = await collect(runCheck(deps, job, "run-1"));
  assert.ok(events.some((e) => e.type === "judged"), "the partial judgement was used");
  assert.ok(!events.some((e) => e.type === "judge-failed"));
});

// Seen live: Gemini took 46 s on a judge prompt it usually answers in 3, used
// the whole judging allowance, and the second judge was never tried, so the
// run ended with no judgement at all instead of with a second opinion.
test("a slow first judge cannot take the second judge's share of the time", async () => {
  const clock = { t: 1_000_000 };
  const base = depsWith(script());
  // Recorded here, not in the fake: the first judge's call never reaches it.
  const seen = [];
  const deps = {
    ...base.deps,
    now: () => clock.t,
    complete: async (request) => {
      seen.push(request);
      // A slow writer, so the judging step has less than the route's whole
      // allowance to divide: with all 55 s a single attempt cannot use it up.
      if (request.prompt.startsWith("You prepare a fair test")) clock.t += 20_000;
      // The first judge takes every millisecond it is given and answers nothing.
      if (request.model === JUDGE1 && request.prompt.startsWith("You are marking answers")) {
        clock.t += request.timeoutMs;
        return { status: "failed", reason: `No answer within ${Math.round(request.timeoutMs / 1000)} seconds.`, timedOut: true, ms: request.timeoutMs };
      }
      return base.deps.complete(request);
    },
  };
  const events = await collect(runCheck(deps, job, "run-1"));
  const judgeCalls = seen.filter((c) => c.prompt.startsWith("You are marking answers"));
  assert.equal(judgeCalls.length, 2, "the next judge was never tried");
  assert.ok(judgeCalls[0].timeoutMs <= LIMITS.judgeAttemptMs, `the first attempt was given ${judgeCalls[0].timeoutMs} ms, past the per-attempt cap`);
  assert.ok(judgeCalls[0].timeoutMs <= judgeCalls[1].timeoutMs, "the first attempt took more than it left the next");
  assert.equal(events.find((e) => e.type === "judge-used")?.judge.id, JUDGE2);
  assert.ok(events.some((e) => e.type === "judged"));
  assert.ok(events.some((e) => e.type === "verdict"), "a verdict, not a run with no judgement");
});

// If every judge does fail, the brief asks for the checks to be there unset
// for the person to set, not for the run to end empty.
test("when every judge fails the checks are left unset for the person, with the reason", async () => {
  const { deps } = depsWith(script({ judge: () => "not json at all", judge2: () => "nor this", last: () => "nor this either" }));
  const events = await collect(runCheck(deps, job, "run-1"));
  assert.ok(events.some((e) => e.type === "judge-failed"), "the reason is said");
  const state = replay(events);
  const results = Object.values(state.judged).flatMap((byCase) => Object.values(byCase).flat());
  assert.ok(results.length > 0, "there are checks on the page to set");
  assert.ok(results.every((r) => r.pass === null), "every check is unset, none guessed");
  assert.ok(!events.some((e) => e.type === "verdict"));
  assert.equal(events.at(-1).type, "done");
});

// Three judges, each capped, so a judge that goes quiet costs its own share
// and nothing more. Before the cap one judge used 41.8 s of a 44 s window on
// production and the run ended with no judgement at all.
test("every judge is tried, each inside the per-attempt cap, when they all go quiet", async () => {
  const clock = { t: 1_000_000 };
  const base = depsWith(script());
  const seen = [];
  const deps = {
    ...base.deps,
    now: () => clock.t,
    complete: async (request) => {
      seen.push(request);
      if (!request.prompt.startsWith("You are marking answers")) return base.deps.complete(request);
      clock.t += request.timeoutMs;
      return { status: "failed", reason: `No answer within ${Math.round(request.timeoutMs / 1000)} seconds.`, timedOut: true, ms: request.timeoutMs };
    },
  };
  const events = await collect(runCheck(deps, job, "run-1"));
  const judgeCalls = seen.filter((c) => c.prompt.startsWith("You are marking answers"));
  assert.equal(judgeCalls.length, candidates.judges.length, "not every judge was tried");
  for (const call of judgeCalls) assert.ok(call.timeoutMs <= LIMITS.judgeAttemptMs, `an attempt was given ${call.timeoutMs} ms`);
  const spent = judgeCalls.reduce((sum, c) => sum + c.timeoutMs, 0);
  assert.ok(spent <= routeBudgetMs(), `the attempts together asked for ${spent} ms of a ${routeBudgetMs()} ms route`);
  // And the person is left something to work with, not an empty page.
  assert.ok(events.some((e) => e.type === "judge-failed"));
  const state = replay(events);
  const results = Object.values(state.judged).flatMap((byCase) => Object.values(byCase).flat());
  assert.ok(results.length > 0 && results.every((r) => r.pass === null));
});

// The answers are already on the page, so judging them again must not call a
// candidate model even once.
test("judging again marks the answers already shown and runs no model", async () => {
  const { deps, calls } = depsWith(script());
  const first = await collect(runCheck(deps, job, "run-1"));
  const state = replay(first);
  const cases = casesToJudge(state.plan, state.cells, job.models);
  const before = calls.length;
  const events = await collect(runJudgeAgain(deps, { plan: state.plan, cases, models: job.models }));
  const added = calls.slice(before);
  assert.ok(added.length > 0, "nothing was called at all");
  assert.ok(added.every((c) => c.prompt.startsWith("You are marking answers")), "a candidate model was called again");
  assert.ok(!added.some((c) => job.models.includes(c.model) && !c.prompt.startsWith("You are marking answers")));
  assert.equal(events.filter((e) => e.type === "judged").length, 9);
  assert.equal(events.filter((e) => e.type === "judge-used").length, 1);
});

// A judge answering after an earlier failure clears the "no judge answered"
// line, so the page does not keep saying it next to fresh marks.
test("a judge answering later clears the failure the page was showing", () => {
  const failed = reduce(reduce(initialState(), { type: "plan", plan: { ...planBody(), testCases: [{ id: "t1", input: "i" }], checks: [{ id: "c1", question: "q?" }], additions: ["a"] } }), { type: "judge-failed", reason: "No answer within 12 seconds." });
  assert.equal(failed.judgeFailed, "No answer within 12 seconds.");
  const judged = reduce(failed, { type: "judge-used", judge: { id: "j/one", name: "J One", label: "Judged by J One" } });
  assert.equal(judged.judgeFailed, null, "the page would keep saying no judge answered");
  assert.equal(judged.judge.name, "J One");
});

test("the judge that left fewer checks unset wins over the first one", async () => {
  const drop = (n) => (request) => { const full = JSON.parse(judgeReplyFor(request)); full.verdicts = full.verdicts.slice(n); return JSON.stringify(full); };
  const { deps } = depsWith(script({ judge: drop(3), judge2: drop(2), last: drop(1) }));
  const events = await collect(runCheck(deps, job, "run-1"));
  assert.equal(events.find((e) => e.type === "judge-used").judge.id, JUDGE3);
});
