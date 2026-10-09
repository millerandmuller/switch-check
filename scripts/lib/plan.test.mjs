// What the prompt writer returns is never trusted: counts and slots are enforced.
import test from "node:test";
import assert from "node:assert/strict";
import { extractJson, fillPrompt, parsePlan } from "../../lib/plan.ts";
import { planBody } from "./test-helpers.mjs";

test("a good reply becomes a plan with ids assigned here", () => {
  const result = parsePlan(planBody());
  assert.equal(result.ok, true);
  assert.deepEqual(result.plan.testCases.map((c) => c.id), ["t1", "t2", "t3"]);
  assert.deepEqual(result.plan.checks.map((c) => c.id), ["c1", "c2", "c3"]);
  assert.equal(result.plan.taskClass, "one-response");
  assert.equal(result.plan.slice, undefined);
});

test("ids the writer chose are ignored", () => {
  const result = parsePlan(planBody({ testInputs: ["a", "b", "c"], checks: [{ id: "x9", question: "one?" }, "two?", "three?"] }));
  assert.equal(result.ok, false); // an object where a question was expected is no question
});

test("the prompt needs its input slot exactly once", () => {
  assert.match(parsePlan(planBody({ prompt: "no slot here" })).error, /exactly once; it has 0/);
  assert.match(parsePlan(planBody({ prompt: "{input} and {input}" })).error, /exactly once; it has 2/);
  assert.match(parsePlan(planBody({ prompt: "" })).error, /prompt is missing/);
});

test("there are exactly three non-empty, distinct test inputs", () => {
  assert.match(parsePlan(planBody({ testInputs: ["a", "b"] })).error, /exactly 3/);
  assert.match(parsePlan(planBody({ testInputs: ["a", "b", "c", "d"] })).error, /exactly 3/);
  assert.match(parsePlan(planBody({ testInputs: ["a", "", "c"] })).error, /exactly 3/);
  assert.match(parsePlan(planBody({ testInputs: ["a", "a", "c"] })).error, /identical/);
  assert.match(parsePlan(planBody({ testInputs: ["a", "b", "x".repeat(1201)] })).error, /Test input 3 is longer than 1,200/);
});

test("there are three to five checks", () => {
  assert.match(parsePlan(planBody({ checks: ["one?", "two?"] })).error, /3 to 5/);
  assert.match(parsePlan(planBody({ checks: ["1?", "2?", "3?", "4?", "5?", "6?"] })).error, /3 to 5/);
  assert.equal(parsePlan(planBody({ checks: ["1?", "2?", "3?", "4?", "5?"] })).ok, true);
  assert.match(parsePlan(planBody({ checks: ["same?", "Same?", "other?"] })).error, /identical/);
});

test("there must be a list of additions", () => {
  assert.match(parsePlan(planBody({ additions: [] })).error, /added/);
  assert.match(parsePlan(planBody({ additions: ["x".repeat(161)] })).error, /too long/);
});

test("a project needs a slice with what was and was not tested", () => {
  assert.match(parsePlan(planBody({ taskClass: "project" })).error, /slice/);
  assert.match(parsePlan(planBody({ taskClass: "project", slice: { tested: "a" } })).error, /slice/);
  const ok = parsePlan(planBody({ taskClass: "project", slice: { tested: "the data model", notTested: "the screens" } }));
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.plan.slice, { tested: "the data model", notTested: "the screens" });
});

test("a one-response plan drops a slice it did not need", () => {
  const result = parsePlan(planBody({ slice: { tested: "a", notTested: "b" } }));
  assert.equal(result.plan.slice, undefined);
});

test("an unknown task class is refused", () => {
  assert.match(parsePlan(planBody({ taskClass: "epic" })).error, /taskClass/);
  assert.equal(parsePlan(null).ok, false);
  assert.equal(parsePlan("text").ok, false);
});

test("json is found inside a fence or a sentence", () => {
  assert.deepEqual(extractJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(extractJson('Here you go: {"a":{"b":2}} hope it helps'), { a: { b: 2 } });
  assert.equal(extractJson("no json"), null);
  assert.equal(extractJson("{broken"), null);
});

test("filling the slot does not read dollar signs as commands", () => {
  assert.equal(fillPrompt("Reply to:\n{input}\nThanks", "cost $& and $1"), "Reply to:\ncost $& and $1\nThanks");
});

test("test input length counts characters a person sees", () => {
  assert.equal(parsePlan(planBody({ testInputs: ["a", "b", "😀".repeat(1200)] })).ok, true);
  assert.match(parsePlan(planBody({ testInputs: ["a", "b", "😀".repeat(1201)] })).error, /Test input 3 is longer than 1,200 characters/);
});
