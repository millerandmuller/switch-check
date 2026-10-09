// The three recorded examples, imported as data so they ship with the page and
// need no call. Each was made once by scripts/record-examples.mjs with the same
// pipeline the page uses. Types only beyond the imports.

import classify from "../demo-data/examples/classify.json" with { type: "json" };
import timeTracker from "../demo-data/examples/time-tracker.json" with { type: "json" };
import triage from "../demo-data/examples/triage.json" with { type: "json" };
import type { RunEvent } from "./events.ts";

export type RecordedExample = {
  id: string;
  title: string;
  task: string;
  models: string[];
  current: string;
  recorded_on: string;
  check_ms: number;
  events: RunEvent[];
};

// The order they are offered in: the plain one first, the project last.
export const EXAMPLES = [triage, classify, timeTracker] as unknown as RecordedExample[];
