import test from "node:test";
import assert from "node:assert/strict";
import { perMillion, resolveCandidates, renderReport } from "./model-prices.mjs";

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
  const report = renderReport(rows, { checkedOn: "2026-09-28", sourceUrl: "https://example.test" });
  assert.match(report, /\| `a\/one` \| A: One \| \$2\.00 \| \$10\.00 \| 1,000 \| 2026-09-28 \|/);
  assert.match(report, /\| `b\/missing` \| NOT LISTED /);
});
