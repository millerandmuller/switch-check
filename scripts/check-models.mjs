// Reads OpenRouter's live model list and writes docs/models-checked.md
// for the candidate models in config/candidates.json.
// The models endpoint is public, so no API key is needed or read here.
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolveCandidates, renderReport } from "./lib/model-prices.mjs";

const SOURCE_URL = "https://openrouter.ai/api/v1/models";
const root = new URL("../", import.meta.url);
const candidatesPath = fileURLToPath(new URL("config/candidates.json", root));
const reportPath = fileURLToPath(new URL("docs/models-checked.md", root));

function localDate(now = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

async function fetchModels() {
  const response = await fetch(SOURCE_URL, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`OpenRouter answered ${response.status} ${response.statusText}`);
  const body = await response.json();
  if (!Array.isArray(body.data)) throw new Error("OpenRouter response has no data array");
  return body.data;
}

async function main() {
  const { candidates } = JSON.parse(await readFile(candidatesPath, "utf8"));
  const models = await fetchModels();
  const rows = resolveCandidates(models, candidates);
  await writeFile(reportPath, renderReport(rows, { checkedOn: localDate(), sourceUrl: SOURCE_URL }));

  const missing = rows.filter((row) => !row.listed).map((row) => row.id);
  console.log(`Wrote docs/models-checked.md (${rows.length - missing.length}/${rows.length} candidates listed)`);
  if (missing.length > 0) {
    console.error(`Not listed on OpenRouter: ${missing.join(", ")}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  // Fail loudly and leave any earlier report untouched.
  console.error(`check-models failed: ${error.message}`);
  process.exitCode = 1;
});
