// The plain text "Copy this verdict" puts on the clipboard. Pure: every word
// is the page's own, and a recording or a replay says so in the page's words,
// so a pasted result never passes for a run that happened just now.

import { dateOnly } from "./format.ts";
import type { Verdict } from "./verdict.ts";

export type VerdictSource = { source: "live" | "cached" | "recorded" | null; at: string | null };

export function verdictText(verdict: Verdict, run: VerdictSource, names: Record<string, string>, address: string): string {
  const lines = [`Switch Check: ${verdict.reason}`, verdict.evidence];
  if (verdict.quote) {
    const { modelId, checkQuestion, line } = verdict.quote;
    lines.push(`Where they differed. ${names[modelId] ?? modelId} failed the check “${checkQuestion}” on this line: “${line}”`);
  }
  if (run.source === "recorded" && run.at !== null) lines.push(`Recorded on ${dateOnly(run.at)}. Nothing on this page was run just now.`);
  if (run.source === "cached") lines.push("Replayed from earlier today. Nothing was run just now.");
  lines.push(address);
  return lines.join("\n");
}
