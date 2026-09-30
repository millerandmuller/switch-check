import test from "node:test";
import assert from "node:assert/strict";
import { loadSampleWorkflow, findSampleProblems } from "./sample-workflow.mjs";

const workflow = await loadSampleWorkflow();

test("the shipped sample prompt carries the {input} placeholder", () => {
  assert.ok(workflow.prompt.includes("{input}"));
});

test("the shipped sample has exactly 3 inputs, none over 4,000 characters", () => {
  assert.equal(workflow.inputs.length, 3);
  for (const input of workflow.inputs) {
    assert.ok(input.text.length <= 4000, `${input.label} is ${input.text.length} characters`);
  }
});

test("every shipped sample input is labeled and marked as a sample in the data", () => {
  for (const input of workflow.inputs) {
    assert.equal(input.sample, true);
    assert.ok(input.label.trim().length > 0);
  }
});

test("the shipped sample workflow has no problems at all", () => {
  assert.deepEqual(findSampleProblems(workflow), []);
});

test("findSampleProblems names a missing placeholder, a wrong count and an unmarked sample", () => {
  assert.deepEqual(findSampleProblems({ prompt: "no placeholder", inputs: [] }), [
    "The prompt has no {input} placeholder.",
    "Expected exactly 3 inputs, found 0.",
  ]);

  const unmarked = {
    prompt: "Email: {input}",
    inputs: [
      { label: "a", sample: true, text: "a" },
      { label: "b", sample: true, text: "b" },
      { label: "c", sample: false, text: "c" },
    ],
  };
  assert.deepEqual(findSampleProblems(unmarked), ['Input 3 is not marked "sample": true.']);
});

test("findSampleProblems names which input is over the limit and by how much", () => {
  const tooLong = {
    prompt: "Email: {input}",
    inputs: [
      { label: "a", sample: true, text: "a" },
      { label: "b", sample: true, text: "x".repeat(4007) },
      { label: "c", sample: true, text: "c" },
    ],
  };
  assert.deepEqual(findSampleProblems(tooLong), [
    "Input 2 is 7 characters over the 4000 character limit.",
  ]);
});
