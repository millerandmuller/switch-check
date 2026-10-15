import test from "node:test";
import assert from "node:assert/strict";
import { perMillion, resolveCandidates, renderReport, renderPrices, zdrCoverage, zdrGaps } from "./model-prices.mjs";

test("perMillion converts per-token strings without float noise", () => {
  assert.equal(perMillion("0.000002"), 2);
  assert.equal(perMillion("0.0000001"), 0.1);
  assert.equal(perMillion("0.00001"), 10);
});

test("perMillion returns null for missing or invalid prices", () => {
  assert.equal(perMillion(undefined), null);
  assert.equal(perMillion("abc"), null);
  assert.equal(perMillion("-1"), null);
});

const models = [
  { id: "a/one", name: "A: One", context_length: 1000, pricing: { prompt: "0.000002", completion: "0.00001" } },
];

test("resolveCandidates keeps candidate order and flags unlisted ids", () => {
  const rows = resolveCandidates(models, ["b/missing", "a/one"]);
  assert.deepEqual(rows[0], { id: "b/missing", listed: false });
  assert.equal(rows[1].inputPerMillion, 2);
  assert.equal(rows[1].outputPerMillion, 10);
});

test("renderReport shows price, date and NOT LISTED rows", () => {
  const rows = resolveCandidates(models, ["a/one", "b/missing"]);
  const zdr = { sourceUrl: "https://example.test/zdr", coverage: { "a/one": ["google-vertex/global"], "b/missing": [] } };
  const report = renderReport(rows, { checkedOn: "2026-09-28", sourceUrl: "https://example.test" }, zdr);
  assert.match(report, /\| `a\/one` \| A: One \| \$2\.00 \| \$10\.00 \| 1,000 \| google-vertex\/global \| 2026-09-28 \|/);
  assert.match(report, /\| `b\/missing` \| NOT LISTED .*\| NONE \|/);
  assert.match(report, /https:\/\/example\.test\/zdr on 2026-09-28/);
});

test("renderPrices gives the app each price with its source and date, and marks unlisted ids", () => {
  const rows = resolveCandidates(models, ["a/one", "b/missing"]);
  const zdr = { sourceUrl: "https://example.test/zdr", coverage: { "a/one": ["google-vertex/global"], "b/missing": [] } };
  const file = JSON.parse(renderPrices(rows, { checkedOn: "2026-09-28", sourceUrl: "https://example.test" }, zdr));
  assert.equal(file.source_url, "https://example.test");
  assert.equal(file.zdr_source_url, "https://example.test/zdr");
  assert.equal(file.checked_on, "2026-09-28");
  assert.deepEqual(file.models, {
    "a/one": { listed: true, input_per_million: 2, output_per_million: 10, zdr_at_price: ["google-vertex/global"] },
    "b/missing": { listed: false, zdr_at_price: [] },
  });
});

// F1: every call is sent with zdr: true and its listed price as the cap, so a
// model with no zero-data-retention endpoint at or under that price could only
// ever come back not tested. check-models fails on any such model.
test("the ZDR check fails a model with no zero-data-retention endpoint, or only dearer or tier-only ones", () => {
  const listed = [
    { id: "ok/model", name: "OK", context_length: 1, pricing: { prompt: "0.000002", completion: "0.00001" } },
    { id: "absent/model", name: "Absent", context_length: 1, pricing: { prompt: "0.000001", completion: "0.000002" } },
    { id: "dear/model", name: "Dear", context_length: 1, pricing: { prompt: "0.000002", completion: "0.00001" } },
    { id: "flex/model", name: "Flex", context_length: 1, pricing: { prompt: "0.00000075", completion: "0.00000375" } },
  ];
  const rows = resolveCandidates(listed, listed.map((model) => model.id));
  // The ZDR list holds only zero-data-retention endpoints, so a model with
  // only ordinary endpoints is simply absent from it.
  const endpoints = [
    { model_id: "ok/model", tag: "google-vertex/europe", service_tier: null, pricing: { prompt: "0.0000022", completion: "0.000011" } },
    { model_id: "ok/model", tag: "google-vertex/global", service_tier: null, pricing: { prompt: "0.000002", completion: "0.00001" } },
    // 10% over on output only: still above the cap.
    { model_id: "dear/model", tag: "azure/eu", service_tier: null, pricing: { prompt: "0.000002", completion: "0.000011" } },
    // Cheap, but a flex tier the request never opts into, so it is never routed to.
    { model_id: "flex/model", tag: "google-vertex/global/flex", service_tier: "flex", pricing: { prompt: "0.000000375", completion: "0.000001875" } },
    { model_id: "other/model", tag: "x", service_tier: null, pricing: { prompt: "0", completion: "0" } },
  ];
  const coverage = zdrCoverage(rows, endpoints);
  assert.deepEqual(coverage["ok/model"], ["google-vertex/global"]);
  assert.deepEqual(zdrGaps(coverage), ["absent/model", "dear/model", "flex/model"]);
  // All covered: nothing to fail on.
  assert.deepEqual(zdrGaps(zdrCoverage(rows.slice(0, 1), endpoints)), []);
});
