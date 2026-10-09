// Requests are checked before anything is spent on them.
import test from "node:test";
import assert from "node:assert/strict";
import { parseCheckRequest, parseFollowupRequest } from "../../lib/request.ts";

const allowed = ["a/one", "a/two", "b/three", "b/four", "c/five"];
const good = { task: "Sort my emails", models: ["a/one", "b/three"], current: "a/one" };

test("a good request passes", () => {
  const result = parseCheckRequest(good, allowed);
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { kind: "fresh", task: "Sort my emails", models: ["a/one", "b/three"], current: "a/one" });
});

test("the task is trimmed, required and limited to 2,000 characters", () => {
  assert.equal(parseCheckRequest({ ...good, task: "  hi  " }, allowed).value.task, "hi");
  assert.match(parseCheckRequest({ ...good, task: "   " }, allowed).error, /Type what you want/);
  assert.equal(parseCheckRequest({ ...good, task: "x".repeat(2000) }, allowed).ok, true);
  assert.match(parseCheckRequest({ ...good, task: "x".repeat(2001) }, allowed).error, /2,001 characters; the limit is 2,000/);
});

test("two to four models, each offered, none twice", () => {
  assert.match(parseCheckRequest({ ...good, models: ["a/one"] }, allowed).error, /at least 2/);
  assert.match(parseCheckRequest({ ...good, models: allowed }, allowed).error, /at most 4/);
  assert.equal(parseCheckRequest({ ...good, models: allowed.slice(0, 4) }, allowed).ok, true);
  assert.match(parseCheckRequest({ ...good, models: ["a/one", "a/one"] }, allowed).error, /twice/);
  assert.match(parseCheckRequest({ ...good, models: ["a/one", "x/secret"] }, allowed).error, /not offered/);
  assert.match(parseCheckRequest({ ...good, models: "a/one" }, allowed).error, /Pick the models/);
});

test("the model used today must be one of the models picked", () => {
  assert.match(parseCheckRequest({ ...good, current: "c/five" }, allowed).error, /must be one of/);
  assert.match(parseCheckRequest({ ...good, current: undefined }, allowed).error, /must be one of/);
});

test("anything that is not an object is not understood", () => {
  for (const body of [null, "x", 5, [], undefined]) assert.equal(parseCheckRequest(body, allowed).ok, false);
});

test("a repeat names a ticket and three non-empty test cases", () => {
  const ticket = "abcd1234efgh5678";
  const ok = parseCheckRequest({ rerun: { ticket, testCases: [" a ", "b", "c"] } }, allowed);
  assert.deepEqual(ok.value, { kind: "rerun", ticket, testCases: ["a", "b", "c"] });
  assert.match(parseCheckRequest({ rerun: { ticket: "../etc", testCases: ["a", "b", "c"] } }, allowed).error, /can no longer be repeated/);
  assert.match(parseCheckRequest({ rerun: { ticket, testCases: ["a", "b"] } }, allowed).error, /exactly 3/);
  assert.match(parseCheckRequest({ rerun: { ticket, testCases: ["a", " ", "c"] } }, allowed).error, /Test case 2 is empty/);
  assert.match(parseCheckRequest({ rerun: { ticket, testCases: ["a", "b", "x".repeat(1201)] } }, allowed).error, /Test case 3 is longer than 1,200/);
});

test("a follow-up needs a ticket, a known kind and a model", () => {
  const ticket = "abcd1234efgh5678";
  assert.deepEqual(parseFollowupRequest({ ticket, kind: "words", model: "a/one" }).value, { ticket, kind: "words", model: "a/one" });
  assert.equal(parseFollowupRequest({ ticket, kind: "shape", model: "a/one" }).ok, true);
  assert.equal(parseFollowupRequest({ ticket, kind: "variant", model: "a/one" }).ok, true);
  assert.equal(parseFollowupRequest({ ticket, kind: "hack", model: "a/one" }).ok, false);
  assert.equal(parseFollowupRequest({ ticket: "x", kind: "words", model: "a/one" }).ok, false);
  assert.equal(parseFollowupRequest({ ticket, kind: "words" }).ok, false);
  assert.equal(parseFollowupRequest(null).ok, false);
});

test("the limit counts characters a person sees, so 2,000 emoji are 2,000", () => {
  assert.equal(parseCheckRequest({ ...good, task: "😀".repeat(2000) }, allowed).ok, true);
  assert.match(parseCheckRequest({ ...good, task: "😀".repeat(2001) }, allowed).error, /2,001 characters/);
});

test("a test case is limited in characters a person sees, not in utf-16 units", () => {
  const ticket = "abcd1234efgh5678";
  assert.equal(parseCheckRequest({ rerun: { ticket, testCases: ["a", "b", "😀".repeat(1200)] } }, allowed).ok, true);
  assert.match(parseCheckRequest({ rerun: { ticket, testCases: ["a", "b", "😀".repeat(1201)] } }, allowed).error, /Test case 3 is longer than 1,200/);
});
