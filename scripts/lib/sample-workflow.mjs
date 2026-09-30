// Guards the shipped sample workflow against the shape the form can load.
// The limits below are restated on purpose rather than imported from
// lib/workflow.ts: the node test runner cannot read the app's TypeScript, and
// a test that re-states the limit is the one that catches a change to it.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export const INPUT_COUNT = 3;
export const INPUT_MAX_CHARS = 4000;
export const INPUT_PLACEHOLDER = "{input}";

const SAMPLE_PATH = fileURLToPath(
  new URL("../../demo-data/sample-email-triage.json", import.meta.url),
);

export async function loadSampleWorkflow(path = SAMPLE_PATH) {
  return JSON.parse(await readFile(path, "utf8"));
}

// Returns one sentence per problem, empty when the workflow is loadable as is.
export function findSampleProblems(workflow) {
  const problems = [];

  if (typeof workflow.prompt !== "string" || workflow.prompt.trim() === "") {
    problems.push("The prompt is missing.");
  } else if (!workflow.prompt.includes(INPUT_PLACEHOLDER)) {
    problems.push(`The prompt has no ${INPUT_PLACEHOLDER} placeholder.`);
  }

  const inputs = workflow.inputs;
  if (!Array.isArray(inputs) || inputs.length !== INPUT_COUNT) {
    problems.push(`Expected exactly ${INPUT_COUNT} inputs, found ${Array.isArray(inputs) ? inputs.length : "none"}.`);
    return problems;
  }

  inputs.forEach((input, index) => {
    const position = index + 1;
    if (typeof input.text !== "string" || input.text.trim() === "") {
      problems.push(`Input ${position} has no text.`);
      return;
    }
    if (input.text.length > INPUT_MAX_CHARS) {
      problems.push(`Input ${position} is ${input.text.length - INPUT_MAX_CHARS} characters over the ${INPUT_MAX_CHARS} character limit.`);
    }
    if (typeof input.label !== "string" || input.label.trim() === "") {
      problems.push(`Input ${position} has no label.`);
    }
    // These emails are invented. The flag has to live in the data, so nothing
    // downstream can present them as real client mail.
    if (input.sample !== true) {
      problems.push(`Input ${position} is not marked "sample": true.`);
    }
  });

  return problems;
}
