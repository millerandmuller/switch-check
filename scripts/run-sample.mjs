// Runs the sample workflow once on the default model pair through OpenRouter
// and saves what came back to demo-data/sample-results-<date>.json.
// Six calls, each capped at 600 output tokens. The key is read from
// .env.local and is never printed or written anywhere.
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { countTested, runSample } from "./lib/sample-run.mjs";

const root = new URL("../", import.meta.url);
const pathOf = (relative) => fileURLToPath(new URL(relative, root));

function localDate(now = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function readApiKey() {
  try {
    process.loadEnvFile(pathOf(".env.local"));
  } catch {
    // No .env.local: the key may still come from the environment.
  }
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set. Add it to .env.local.");
  return apiKey;
}

async function main() {
  const apiKey = readApiKey();
  const workflow = JSON.parse(await readFile(pathOf("demo-data/sample-email-triage.json"), "utf8"));
  const { default_pair: models } = JSON.parse(await readFile(pathOf("config/candidates.json"), "utf8"));
  const runDate = localDate();

  const file = await runSample({
    fetchImpl: fetch,
    now: () => performance.now(),
    apiKey,
    workflow,
    models,
    runDate,
  });

  const relativePath = `demo-data/sample-results-${runDate}.json`;
  await writeFile(pathOf(relativePath), `${JSON.stringify(file, null, 2)}\n`);

  const total = file.results.length * 2;
  const tested = countTested(file);
  console.log(`Wrote ${relativePath} (${tested} of ${total} outputs, ${models.current} and ${models.candidate})`);
  if (tested < total) {
    console.error(`${total - tested} of ${total} calls are saved as not tested. See the reasons in the file.`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`sample-results failed: ${error.message}`);
  process.exitCode = 1;
});
