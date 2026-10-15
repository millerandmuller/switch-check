// Reads OpenRouter's live model list and writes docs/models-checked.md (for
// people) and config/model-prices.json (for the app) for every model the app
// can call: the candidates, the prompt writer and the judges, all listed in
// config/candidates.json.
// It also reads OpenRouter's list of zero-data-retention endpoints and fails
// if any of those models has none at or under its listed price, because every
// call is sent with `zdr: true` and that price as its cap: such a model could
// only ever come back not tested.
// Both endpoints are public, so no API key is needed or read here.
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolveCandidates, renderReport, renderPrices, zdrCoverage, zdrGaps } from "./lib/model-prices.mjs";

const SOURCE_URL = "https://openrouter.ai/api/v1/models";
const ZDR_URL = "https://openrouter.ai/api/v1/endpoints/zdr";
const root = new URL("../", import.meta.url);
const candidatesPath = fileURLToPath(new URL("config/candidates.json", root));
const reportPath = fileURLToPath(new URL("docs/models-checked.md", root));
const pricesPath = fileURLToPath(new URL("config/model-prices.json", root));

function localDate(now = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

async function fetchList(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`OpenRouter answered ${response.status} ${response.statusText} for ${url}`);
  const body = await response.json();
  if (!Array.isArray(body.data)) throw new Error(`OpenRouter response from ${url} has no data array`);
  return body.data;
}

async function main() {
  const config = JSON.parse(await readFile(candidatesPath, "utf8"));
  const ids = [...new Set([...config.candidates, config.writer, ...config.judges].map((model) => model.id))];
  // Both lists are read before anything is written, so a failed read leaves
  // the earlier files as they were.
  const [models, endpoints] = await Promise.all([fetchList(SOURCE_URL), fetchList(ZDR_URL)]);
  const rows = resolveCandidates(models, ids);
  const reading = { checkedOn: localDate(), sourceUrl: SOURCE_URL };
  const zdr = { sourceUrl: ZDR_URL, coverage: zdrCoverage(rows, endpoints) };
  await writeFile(reportPath, renderReport(rows, reading, zdr));
  await writeFile(pricesPath, renderPrices(rows, reading, zdr));

  const missing = rows.filter((row) => !row.listed).map((row) => row.id);
  const gaps = zdrGaps(zdr.coverage);
  console.log(`Wrote docs/models-checked.md and config/model-prices.json (${rows.length - missing.length}/${rows.length} candidates listed)`);
  console.log(`Zero-data-retention endpoints at the listed price: ${rows.length - gaps.length}/${rows.length} models covered`);
  if (missing.length > 0) {
    console.error(`Not listed on OpenRouter: ${missing.join(", ")}`);
    process.exitCode = 1;
  }
  if (gaps.length > 0) {
    console.error(`No zero-data-retention endpoint at or under the listed price: ${gaps.join(", ")}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  // Fail loudly and leave any earlier report untouched.
  console.error(`check-models failed: ${error.message}`);
  process.exitCode = 1;
});
