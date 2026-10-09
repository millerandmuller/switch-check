// Runs the three example tasks once through the real pipeline and saves what
// came back, exactly, as demo-data/examples/<id>.json. The page serves these
// when a visitor asks for an example, when the daily limit is reached and when
// the provider is down, and always labels them as recorded.
//
//   npm run record-examples            record all three
//   npm run record-examples -- triage  record one by id
//
// Needs OPENROUTER_API_KEY (read from .env.local by the npm script). Costs a
// few cents per example. Nothing here edits an answer. A run that ends without
// a verdict is run again; a run that finishes is kept as it came out, including
// a follow-up where a model could not answer. Do not patch the file, and do not
// run again to get a nicer result.
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { liveDeps, modelConfig, modelPrices } from "../lib/server/live-deps.ts";
import { runCheck, runPromptTest, runShape, wordsTemplate } from "../lib/server/pipeline.ts";
import { replay, toRunData } from "../lib/events.ts";
import { computeVerdict } from "../lib/verdict.ts";

const OUT = fileURLToPath(new URL("../demo-data/examples/", import.meta.url));

export const EXAMPLES = [
  {
    id: "triage",
    title: "Triage customer emails",
    task: "Triage my customer emails: give each one a priority, a category and a short draft reply.",
  },
  {
    id: "classify",
    title: "Sort support tickets",
    task: "Tell me whether each support ticket is about billing, a bug, or a feature request.",
  },
  {
    id: "time-tracker",
    title: "Build a time tracker",
    task: "I want to build a Next.js app where my team can track the time they spend on tasks, a bit like Jira crossed with Notion.",
  },
];

const MODELS = modelConfig.default_models;
const CURRENT = modelConfig.default_current;

async function collect(generator, events) {
  for await (const event of generator) events.push(event);
}

async function record(example, deps) {
  const startedAt = Date.now();
  const events = [];
  await collect(runCheck(deps, { task: example.task, models: MODELS, current: CURRENT }, `recorded-${example.id}`), events);
  const checkMs = Date.now() - startedAt;

  const state = replay(events);
  if (state.serverVerdict === null || state.plan === null) {
    throw new Error(`${example.id}: the run ended without a verdict (${state.error?.message ?? state.judgeFailed ?? "unknown"}). Run it again.`);
  }
  // The same two follow-ups the page starts on its own, on the recommended model.
  const model = state.serverVerdict.model;
  await Promise.all([
    collect(runPromptTest(deps, { kind: "words", template: wordsTemplate(example.task), plan: state.plan, model, models: MODELS }), events),
    collect(runShape(deps, { plan: state.plan, model }), events),
  ]);

  const names = Object.fromEntries(modelConfig.candidates.map((m) => [m.id, m.name]));
  const data = toRunData(replay(events), {
    prices: modelPrices.models, priceCheckedOn: modelPrices.checked_on, names,
    writerName: modelConfig.writer.name, judgeName: replay(events).judge?.name ?? "",
  });
  const verdict = computeVerdict(data);
  return {
    id: example.id,
    title: example.title,
    task: example.task,
    models: MODELS,
    current: CURRENT,
    recorded_on: new Date(startedAt).toISOString(),
    note: "One real run of this task through the same code the page uses. Answers, times and token counts are as returned. Nothing in this file was edited by hand.",
    check_ms: checkMs,
    verdict_decision: verdict.waiting ? "waiting" : verdict.verdict.decision,
    events,
  };
}

async function main() {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY is not set. Run this with npm run record-examples.");
  const wanted = process.argv.slice(2);
  const todo = wanted.length ? EXAMPLES.filter((e) => wanted.includes(e.id)) : EXAMPLES;
  if (todo.length === 0) throw new Error(`No example matches ${wanted.join(", ")}.`);
  await mkdir(OUT, { recursive: true });
  const deps = liveDeps(key);
  for (const example of todo) {
    const saved = await record(example, deps);
    await writeFile(`${OUT}${example.id}.json`, `${JSON.stringify(saved, null, 1)}\n`);
    const slow = saved.check_ms > 40_000 ? "  SLOWER THAN 40 s: a live visitor would wait that long" : "";
    console.log(`${example.id}: ${saved.verdict_decision}, check took ${(saved.check_ms / 1000).toFixed(1)} s, ${saved.events.length} events${slow}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`record-examples failed: ${error.message}`);
    process.exitCode = 1;
  });
}
