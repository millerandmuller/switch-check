// The text "Copy this verdict" copies: the page's own sentences, an honest
// source line for recordings and replays, and the address, nothing else.
import test from "node:test";
import assert from "node:assert/strict";
import { verdictText } from "../../lib/verdict-text.ts";

const ADDRESS = "https://switch-check.vercel.app/";
const names = { "anthropic/claude-sonnet-5.5": "Claude Sonnet 5.5" };
const verdict = {
  decision: "switch",
  model: "anthropic/claude-haiku-5.5",
  reason: "Switch to Claude Haiku 5.5. It passed 12 of 12 checks, the same as Claude Sonnet 5.5, at an estimated 93% lower cost per 1,000 runs. Every model passed all 12 checks, so these checks did not separate them. The pick is the cheapest of equals, not the best of them.",
  evidence: "Three test cases, written by Gemini 3.8 Flash, one run, judged by Gemini 3.8 Flash, the model that wrote them. Enough to point, not to prove.",
  figures: [],
};
const live = { source: "live", at: null };
const recorded = { source: "recorded", at: "2026-10-09T11:59:00.000Z" };
const cached = { source: "cached", at: "2026-10-15T09:00:00.000Z" };

test("a live run copies as three lines: the verdict, the evidence, the address", () => {
  const lines = verdictText(verdict, live, names, ADDRESS).split("\n");
  assert.deepEqual(lines, [`Switch Check: ${verdict.reason}`, verdict.evidence, ADDRESS]);
});

test("a recorded run copies as four lines and says it was recorded", () => {
  const lines = verdictText(verdict, recorded, names, ADDRESS).split("\n");
  assert.equal(lines.length, 4);
  assert.equal(lines[2], "Recorded on 2026-10-09. Nothing on this page was run just now.");
  assert.equal(lines[3], ADDRESS);
});

test("a cache replay says it was replayed, never that it ran just now", () => {
  const lines = verdictText(verdict, cached, names, ADDRESS).split("\n");
  assert.equal(lines[2], "Replayed from earlier today. Nothing was run just now.");
  assert.equal(lines.length, 4);
});

test("a result the person set is named in line 2 exactly as the page names it", () => {
  const set = { ...verdict, evidence: `${verdict.evidence} 1 result set by you.` };
  assert.ok(verdictText(set, live, names, ADDRESS).split("\n")[1].includes("1 result set by you"));
});

test("the quoted failing line comes after the evidence, with the model's name", () => {
  const quoted = { ...verdict, quote: { modelId: "anthropic/claude-sonnet-5.5", checkQuestion: "Does it name one category?", line: "Billing, or maybe a bug." } };
  const lines = verdictText(quoted, live, names, ADDRESS).split("\n");
  assert.equal(lines[2], "Where they differed. Claude Sonnet 5.5 failed the check “Does it name one category?” on this line: “Billing, or maybe a bug.”");
  assert.equal(lines.at(-1), ADDRESS);
});

test("the copied text never carries a placeholder or an exclamation mark", () => {
  for (const run of [live, recorded, cached]) {
    const text = verdictText(verdict, run, names, ADDRESS);
    assert.doesNotMatch(text, /undefined|null|NaN|!/);
  }
});
