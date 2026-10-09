// The verdict rule: cheapest within one check of the best, ties to the faster;
// stay if that is today's model; test more when a model was not tested or one
// flipped result would change the answer; wait while a check is unset.
import test from "node:test";
import assert from "node:assert/strict";
import { computeVerdict, differingQuote, evidenceLine, pickModel, setResult, summarize, verdictChangeNote } from "../../lib/verdict.ts";
import { figure } from "../../lib/figure.ts";

const plan = {
  prompt: "{input}",
  additions: ["a"],
  testCases: [{ id: "t1", input: "one" }, { id: "t2", input: "two" }, { id: "t3", input: "three" }],
  checks: [{ id: "c1", question: "Is it short?" }, { id: "c2", question: "Is it polite?" }, { id: "c3", question: "Is it right?" }],
  taskClass: "one-response",
};

// Each model: passes (0 to 9 of 9), tokens (sets the cost: $1 per million in
// and out, so 1,000 runs cost tokens / 1000 dollars), ms, and optionally
// notTested: ["t2"] or unset: true.
function build(spec, current = Object.keys(spec)[0], overrides = {}) {
  const models = Object.keys(spec);
  const cells = {};
  const judged = {};
  for (const id of models) {
    const { passes, tokens = 1000, ms = 1000, notTested = [], unset = false } = spec[id];
    cells[id] = {};
    judged[id] = {};
    let left = passes;
    for (const testCase of plan.testCases) {
      if (notTested.includes(testCase.id)) {
        cells[id][testCase.id] = { status: "not-tested", reason: "No answer within 45 seconds." };
        continue;
      }
      cells[id][testCase.id] = { status: "answered", text: `${id} ${testCase.id}`, ms: figure(ms, "measured"), inputTokens: tokens / 2, outputTokens: tokens / 2, truncated: false };
      judged[id][testCase.id] = plan.checks.map((check) => {
        if (unset) return { checkId: check.id, pass: null, changedByUser: false };
        const pass = left > 0;
        left -= 1;
        return pass ? { checkId: check.id, pass: true, changedByUser: false } : { checkId: check.id, pass: false, quote: `line of ${id} ${testCase.id} ${check.id}`, changedByUser: false };
      });
    }
  }
  return {
    plan, models, current, cells, judged,
    prices: Object.fromEntries(models.map((id) => [id, { listed: true, input_per_million: 1, output_per_million: 1 }])),
    priceCheckedOn: "2026-10-09",
    names: Object.fromEntries(models.map((id) => [id, id.toUpperCase()])),
    writerName: "Writer", judgeName: "Judge",
    ...overrides,
  };
}

const ok = (data) => {
  const result = computeVerdict(data);
  assert.equal(result.waiting, false, result.reason);
  return result.verdict;
};

test("a cheaper model that ties the best is the switch, with the saving in the sentence", () => {
  const verdict = ok(build({ big: { passes: 9, tokens: 4000 }, small: { passes: 9, tokens: 400 } }, "big"));
  assert.equal(verdict.decision, "switch");
  assert.equal(verdict.model, "small");
  assert.match(verdict.reason, /^Switch to SMALL\. It passed 9 of 9 checks, the same as BIG, at an estimated 90% lower cost per 1,000 runs\./);
  const saving = verdict.figures.find((fig) => fig.label === "Saving against BIG");
  assert.deepEqual([saving.text, saving.state], ["90%", "estimated"]);
});

test("a cheaper model that beats the best by passing more is the switch", () => {
  const verdict = ok(build({ big: { passes: 6, tokens: 4000 }, small: { passes: 9, tokens: 100 } }, "big"));
  assert.equal(verdict.decision, "switch");
  assert.match(verdict.reason, /It passed 9 of 9 checks, 3 more than BIG, at an estimated 98% lower cost/);
});

test("a pick one check behind the best is one flipped result from losing, so it is test more", () => {
  const verdict = ok(build({ big: { passes: 9, tokens: 4000 }, small: { passes: 8, tokens: 100 } }, "big"));
  assert.equal(verdict.decision, "test-more");
  assert.equal(verdict.model, "small", "the page still says which model it would have picked");
  assert.match(verdict.reason, /^Test more\. One judged result decides this: if SMALL had failed one more check, the answer would be BIG instead of SMALL\./);
});

test("a cheaper model two behind is one flipped result from winning, so it is test more", () => {
  const verdict = ok(build({ big: { passes: 9, tokens: 4000 }, small: { passes: 7, tokens: 100 } }, "big"));
  assert.equal(verdict.decision, "test-more");
  assert.match(verdict.reason, /One judged result decides this: .* the answer would be SMALL instead of BIG\./);
});

test("a cheaper model three behind is out of the running and the verdict is stay", () => {
  const verdict = ok(build({ big: { passes: 9, tokens: 4000 }, small: { passes: 6, tokens: 100 } }, "big"));
  assert.equal(verdict.decision, "stay");
  assert.equal(verdict.model, "big");
  assert.match(verdict.reason, /^Stay on BIG\. It passed 9 of 9 checks\./);
  assert.match(verdict.reason, /The cheaper model passed fewer: SMALL 6 of 9\./);
});

test("staying with nothing cheaper in the run says so", () => {
  const verdict = ok(build({ small: { passes: 9, tokens: 100 }, big: { passes: 9, tokens: 4000 } }, "small"));
  assert.equal(verdict.decision, "stay");
  assert.match(verdict.reason, /No cheaper model was in this run\./);
});

test("when the current model is far behind, the switch can cost more and says so", () => {
  const verdict = ok(build({ weak: { passes: 3, tokens: 100 }, strong: { passes: 9, tokens: 400 } }, "weak"));
  assert.equal(verdict.decision, "switch");
  assert.equal(verdict.model, "strong");
  assert.match(verdict.reason, /It passed 9 of 9 checks, 6 more than WEAK, at an estimated 300% higher cost/);
  assert.ok(verdict.figures.some((fig) => fig.label.startsWith("Extra cost")));
});

test("equal cost goes to the faster model, then to the lower id, whatever the list order", () => {
  const data = build({ b: { passes: 9, tokens: 1000, ms: 900 }, a: { passes: 9, tokens: 1000, ms: 1200 }, c: { passes: 9, tokens: 1000, ms: 900 } }, "a");
  assert.equal(pickModel(summarize(data)), "b");
  assert.equal(pickModel(summarize({ ...data, models: [...data.models].reverse() })), "b");
});

test("every model tying on checks says so and picks the cheapest", () => {
  const verdict = ok(build({ big: { passes: 9, tokens: 4000 }, small: { passes: 9, tokens: 100 }, mid: { passes: 9, tokens: 1000 } }, "big"));
  assert.equal(verdict.model, "small");
  assert.match(verdict.reason, /Every model passed the same number, so the cheapest is the pick\./);
});

test("a tie below the maximum is just as steady as a tie at the top", () => {
  const verdict = ok(build({ big: { passes: 5, tokens: 4000 }, small: { passes: 5, tokens: 100 } }, "big"));
  assert.equal(verdict.decision, "switch");
});

test("a model that was not tested on every case makes the verdict test more, and is named", () => {
  const verdict = ok(build({ big: { passes: 9, tokens: 4000 }, small: { passes: 6, tokens: 100, notTested: ["t2"] } }, "big"));
  assert.equal(verdict.decision, "test-more");
  assert.match(verdict.reason, /^Test more\. SMALL \(2 of 3 test cases answered\) could not be compared fairly/);
});

test("if the current model was not tested the verdict is test more too", () => {
  const verdict = ok(build({ big: { passes: 9, tokens: 4000, notTested: ["t1", "t2", "t3"] }, small: { passes: 9, tokens: 100 } }, "big"));
  assert.equal(verdict.decision, "test-more");
  assert.match(verdict.reason, /BIG \(0 of 3 test cases answered\)/);
});

test("with no answer from any model there is nothing to compare", () => {
  const verdict = ok(build({ a: { passes: 0, notTested: ["t1", "t2", "t3"] }, b: { passes: 0, notTested: ["t1", "t2", "t3"] } }, "a"));
  assert.equal(verdict.decision, "test-more");
  assert.match(verdict.reason, /No model answered/);
});

test("while any check is unset the verdict waits and says how many", () => {
  const result = computeVerdict(build({ big: { passes: 9, tokens: 4000 }, small: { passes: 9, tokens: 100, unset: true } }, "big"));
  assert.equal(result.waiting, true);
  assert.match(result.reason, /9 check results are not set yet/);
});

test("a person setting a check changes the count and the verdict recomputes", () => {
  const data = build({ big: { passes: 9, tokens: 4000 }, small: { passes: 9, tokens: 100 } }, "big");
  assert.equal(ok(data).decision, "switch");
  // The person marks one of small's passes as a fail: 8 of 9, one behind: test more.
  const flipped = { ...data, judged: { ...data.judged, small: { ...data.judged.small, t1: setResult(data.judged.small.t1, "c1", false) } } };
  assert.equal(summarize(flipped).find((m) => m.id === "small").passed, 8);
  assert.equal(ok(flipped).decision, "test-more");
  assert.match(ok(flipped).evidence, /1 result set by you/);
});

test("setting a result marks it as the person's and drops the judge's quote", () => {
  const before = [{ checkId: "c1", pass: false, quote: "line", changedByUser: false }, { checkId: "c2", pass: true, changedByUser: false }];
  const after = setResult(before, "c1", true);
  assert.deepEqual(after[0], { checkId: "c1", pass: true, changedByUser: true });
  assert.deepEqual(after[1], before[1]);
});

test("the quoted line is a failure of another model where the pick passed", () => {
  const data = build({ big: { passes: 9, tokens: 4000 }, small: { passes: 9, tokens: 100 }, other: { passes: 6, tokens: 500 } }, "big");
  const quote = differingQuote(data, "small");
  assert.equal(quote.modelId, "other");
  assert.match(quote.line, /^line of other /);
  assert.ok(plan.checks.some((check) => check.question === quote.checkQuestion));
  assert.equal(ok(data).quote.modelId, "other");
});

test("with no quoted failure there is no quote", () => {
  assert.equal(ok(build({ big: { passes: 9, tokens: 4000 }, small: { passes: 9, tokens: 100 } }, "big")).quote, undefined);
});

test("the evidence line says who wrote the cases, how many were edited and who judged", () => {
  const data = build({ a: { passes: 9 }, b: { passes: 9 } }, "a");
  assert.equal(evidenceLine(data), "Three test cases, written by Writer, one run, judged by Judge. Enough to point, not to prove.");
  const edited = { ...data, plan: { ...plan, testCases: plan.testCases.map((c, i) => (i === 0 ? { ...c, edited: true } : c)) } };
  assert.match(evidenceLine(edited), /Three test cases, 1 edited by you, the rest written by Writer/);
});

test("the sentence is built only from figures that are listed with a state", () => {
  const verdict = ok(build({ big: { passes: 9, tokens: 4000 }, small: { passes: 9, tokens: 400 } }, "big"));
  for (const fig of verdict.figures) {
    assert.ok(["measured", "estimated", "generated", "judged", "recorded"].includes(fig.state), `${fig.label} has no state`);
  }
  const text = verdict.figures.map((fig) => fig.text).join(" ");
  assert.ok(text.includes("9 of 9") && text.includes("90%"));
  assert.ok(verdict.reason.includes("9 of 9") && verdict.reason.includes("90%"));
});

test("a change of verdict between two runs of the same cases is reported", () => {
  const names = { a: "A", b: "B" };
  const stay = { decision: "stay", model: "a", reason: "", evidence: "", figures: [] };
  const swap = { decision: "switch", model: "b", reason: "", evidence: "", figures: [] };
  assert.equal(verdictChangeNote(stay, { ...stay }, names), null);
  assert.equal(verdictChangeNote(stay, swap, names), "The verdict changed on this run. Before: stay on A. Now: switch to B.");
  assert.match(verdictChangeNote(swap, { ...stay, decision: "test-more" }, names), /Now: test more\./);
});

test("a model with no answered case has no pass count: never 0 of 0", () => {
  const data = build({ a: { passes: 9, tokens: 400 }, b: { passes: 0, notTested: ["t1", "t2", "t3"] } }, "a");
  const summary = summarize(data).find((m) => m.id === "b");
  assert.equal(summary.passed, null);
  assert.equal(summary.answered, 0);
  const verdict = ok(data);
  assert.ok(!verdict.figures.some((fig) => fig.text.startsWith("0 of")), "no zero-of-zero chip");
  assert.ok(!verdict.figures.some((fig) => fig.label.startsWith("B ")), "the untested model has no pass chip");
});

test("a switch carries the price date on the current model's cost as well", () => {
  const verdict = ok(build({ big: { passes: 9, tokens: 4000 }, small: { passes: 9, tokens: 400 } }, "big"));
  const current = verdict.figures.find((fig) => fig.label === "BIG cost");
  assert.match(current.note, /OpenRouter price checked 2026-10-09/);
});

test("answers cut off at the token limit are named in the evidence line", () => {
  const data = build({ a: { passes: 9 }, b: { passes: 9 } }, "a");
  data.cells.a.t1 = { ...data.cells.a.t1, truncated: true };
  data.cells.b.t2 = { ...data.cells.b.t2, truncated: true };
  assert.match(evidenceLine(data), /2 answers were cut off at the token limit and marked as far as they were written\./);
  data.cells.b.t2 = { ...data.cells.b.t2, truncated: false };
  assert.match(evidenceLine(data), /1 answer was cut off/);
});

test("on a recording the mean response time reads recorded, not measured, with no 'this run'", () => {
  const live = summarize(build({ a: { passes: 9 }, b: { passes: 9 } }, "a"))[0];
  assert.deepEqual([live.meanMs.state, live.meanMs.note], ["measured", "this run"]);
  const recorded = summarize({ ...build({ a: { passes: 9 }, b: { passes: 9 } }, "a"), recorded: true })[0];
  assert.deepEqual([recorded.meanMs.state, recorded.meanMs.note], ["recorded", undefined]);
});
