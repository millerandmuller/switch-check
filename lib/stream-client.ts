// Reads a run stream in the browser: a fetch response whose body is one JSON
// event per line. Works on any Response, so it is tested in Node.

import { parseEventLine, splitLines, type RunEvent } from "./events.ts";

export type ReadResult =
  // The server answered with a refusal: plain JSON with an error and a reason.
  | { kind: "refused"; status: number; error: string; reason: string }
  | { kind: "streamed"; complete: boolean };

export async function readRun(response: Response, onEvent: (event: RunEvent) => void): Promise<ReadResult> {
  const type = response.headers.get("content-type") ?? "";
  if (!response.ok || !type.includes("ndjson") || response.body === null) {
    let error = "The check could not be started.";
    let reason = "unavailable";
    try {
      const body = (await response.json()) as { error?: unknown; reason?: unknown };
      if (typeof body.error === "string") error = body.error;
      if (typeof body.reason === "string") reason = body.reason;
    } catch {
      // Not JSON: the generic message stands.
    }
    return { kind: "refused", status: response.status, error, reason };
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let sawEnd = false;
  for (;;) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const { lines, rest } = splitLines(buffer);
    buffer = rest;
    for (const line of lines) {
      const event = parseEventLine(line);
      if (event === null) continue;
      if (event.type === "done" || event.type === "followup-done" || event.type === "error") sawEnd = true;
      onEvent(event);
    }
    if (done) break;
  }
  const last = parseEventLine(buffer.trim());
  if (last !== null) {
    if (last.type === "done" || last.type === "followup-done" || last.type === "error") sawEnd = true;
    onEvent(last);
  }
  return { kind: "streamed", complete: sawEnd };
}
