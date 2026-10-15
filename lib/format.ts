// How times, token counts and ages are written on the page. Pure.

import { formatSeconds } from "./cost-speed.ts";

export function formatMs(ms: number): string {
  return `${formatSeconds(ms)} s`;
}

// "1,204 in, 322 out" or null when the API reported none.
export function tokensText(inputTokens: number | null, outputTokens: number | null): string | null {
  if (inputTokens === null && outputTokens === null) return null;
  const parts: string[] = [];
  if (inputTokens !== null) parts.push(`${inputTokens.toLocaleString("en-US")} in`);
  if (outputTokens !== null) parts.push(`${outputTokens.toLocaleString("en-US")} out`);
  return parts.join(", ");
}

// "3 minutes ago", "2 hours ago", "1 day ago". A time in the future reads as
// "just now" so a skewed clock never prints a negative age.
export function ageText(thenIso: string, nowMs: number): string {
  const seconds = Math.max(0, Math.round((nowMs - Date.parse(thenIso)) / 1000));
  if (seconds < 60) return "just now";
  const units: [number, string][] = [
    [86_400, "day"],
    [3_600, "hour"],
    [60, "minute"],
  ];
  for (const [size, name] of units) {
    if (seconds >= size) {
      const count = Math.floor(seconds / size);
      return `${count} ${name}${count === 1 ? "" : "s"} ago`;
    }
  }
  return "just now";
}

export function dateOnly(iso: string): string {
  return iso.slice(0, 10);
}

// The note at the top of the verdict card: where the run came from, in words a
// reader cannot miss. A recording names the task it was recorded for, because
// showing it does not put that task in the task box. A live run has no note.
export function sourceNote(
  source: "live" | "cached" | "recorded" | null,
  at: string | null,
  task: string | null,
  nowMs: number,
): { lead: string; rest: string } | null {
  if (at === null) return null;
  if (source === "recorded") {
    // The task is quoted as typed; a full stop follows the quote only when the task has none of its own.
    const forTask = task === null ? "." : ` for the task \u201c${task}\u201d${/[.!?]$/.test(task) ? "" : "."}`;
    return { lead: `Recorded on ${dateOnly(at)}${forTask}`, rest: "Nothing on this page was run just now. Times read recorded, not measured." };
  }
  if (source === "cached") {
    const age = ageText(at, nowMs);
    return {
      lead: `${age === "just now" ? "Replayed from earlier today" : `Recorded ${age}`}.`,
      rest: "The same task on the same models was checked earlier today, so this is that run, shown again. Nothing was run just now.",
    };
  }
  return null;
}
