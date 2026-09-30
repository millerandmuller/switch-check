// One comparison draft: the prompt, three inputs and the two models, plus the
// rules for what makes it complete. Pure and UI-free, so the form, the tests
// and the later comparison steps share one definition of "ready".

export const INPUT_COUNT = 3;
export const INPUT_MAX_CHARS = 4000;
export const INPUT_PLACEHOLDER = "{input}";

export type WorkflowDraft = {
  prompt: string;
  inputs: string[];
  currentModel: string;
  candidateModel: string;
};

// null means "nothing wrong with this field". Every refusal carries the
// sentence the person reads next to the field it belongs to.
export type DraftProblems = {
  prompt: string | null;
  inputs: (string | null)[];
  models: string | null;
};

export function emptyDraft(currentModel: string, candidateModel: string): WorkflowDraft {
  return {
    prompt: "",
    inputs: Array.from({ length: INPUT_COUNT }, () => ""),
    currentModel,
    candidateModel,
  };
}

function plural(count: number, word: string) {
  return `${count.toLocaleString("en-US")} ${word}${count === 1 ? "" : "s"}`;
}

function promptProblem(prompt: string): string | null {
  if (prompt.trim() === "") {
    return "Your prompt is missing. Paste the prompt you already use.";
  }
  if (!prompt.includes(INPUT_PLACEHOLDER)) {
    return `The prompt has no ${INPUT_PLACEHOLDER} placeholder. It marks the spot where each of your three inputs is put into the prompt, so both models read exactly the same thing.`;
  }
  return null;
}

function inputProblem(value: string, position: number): string | null {
  if (value.trim() === "") {
    return `Input ${position} is missing. All three inputs are needed.`;
  }
  const over = value.length - INPUT_MAX_CHARS;
  if (over > 0) {
    return `Input ${position} is ${plural(over, "character")} over the ${INPUT_MAX_CHARS.toLocaleString("en-US")} character limit.`;
  }
  return null;
}

function modelsProblem(currentModel: string, candidateModel: string): string | null {
  if (currentModel === candidateModel) {
    return "The two models must differ. Pick another model to compare with.";
  }
  return null;
}

export function findProblems(draft: WorkflowDraft): DraftProblems {
  return {
    prompt: promptProblem(draft.prompt),
    inputs: draft.inputs.map((value, index) => inputProblem(value, index + 1)),
    models: modelsProblem(draft.currentModel, draft.candidateModel),
  };
}

export function isComplete(problems: DraftProblems): boolean {
  return (
    problems.prompt === null &&
    problems.models === null &&
    problems.inputs.every((problem) => problem === null)
  );
}
