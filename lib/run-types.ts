// The shapes a run is made of. Types only: no behaviour lives here.

import type { Figure } from "./figure.ts";

export type TestCase = { id: string; input: string; edited?: boolean };

export type Check = { id: string; question: string };

export type TaskPlan = {
  // Contains one {input} slot, filled with a test case for each call.
  prompt: string;
  // What was added to the person's words, one line each.
  additions: string[];
  testCases: TestCase[];
  checks: Check[];
  taskClass: "one-response" | "project";
  // Only for a project: the slice that was tested, and what was not.
  slice?: { tested: string; notTested: string };
};

export type Cell =
  | {
      status: "answered";
      // Exactly as the model returned it.
      text: string;
      ms: Figure<number>;
      inputTokens: number | null;
      outputTokens: number | null;
      // True when the model stopped because it hit the token cap.
      truncated: boolean;
    }
  | { status: "not-tested"; reason: string };

// pass is null while a check is unset: the judge failed and the person has
// not set it yet. The verdict waits for every check of an answered cell.
export type CheckResult = {
  checkId: string;
  pass: boolean | null;
  // The line of the answer that decided a fail, verbatim.
  quote?: string;
  changedByUser: boolean;
};

export const INPUT_SLOT = "{input}";
