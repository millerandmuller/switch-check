// The thin layer between a Request and the handlers: reads the body, finds the
// visitor, and writes a handler's result as a response. The streamed body is
// one JSON event per line.

import { encodeEvent, type RunEvent } from "../events.ts";
import { LIMITS } from "../limits.ts";
import { visitorId } from "./guard.ts";
import type { Handled } from "./handlers.ts";

const NO_STORE = { "Cache-Control": "no-store" };

export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...NO_STORE },
  });
}

// The body as parsed JSON, or a response to send back instead.
export async function readJsonBody(request: Request): Promise<{ ok: true; body: unknown } | { ok: false; response: Response }> {
  // A cross-site page can send text/plain without a preflight; JSON it cannot.
  // The media type itself, not the whole header: "text/plain; x=application/json"
  // is still a request a cross-site page can send without a preflight.
  const mediaType = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (mediaType !== "application/json") {
    return { ok: false, response: jsonResponse(415, { error: "The request was not understood.", reason: "input" }) };
  }
  const text = await request.text();
  if (text.length > LIMITS.maxBodyBytes) {
    return { ok: false, response: jsonResponse(413, { error: "That request is too large.", reason: "input" }) };
  }
  try {
    return { ok: true, body: JSON.parse(text) };
  } catch {
    return { ok: false, response: jsonResponse(400, { error: "The request was not understood.", reason: "input" }) };
  }
}

// An IPv6 network of a household or an office is one /64: every address in it
// counts as one visitor, so changing the end of the address buys nothing.
export function addressKey(raw: string): string {
  // Brackets, a port, a zone id, spaces and leading zeros in an IPv4 part do
  // not make a different address.
  let address = raw.trim().split("%")[0];
  const bracketed = /^\[([^\]]*)\](?::\d+)?$/.exec(address);
  if (bracketed) address = bracketed[1];
  address = address.replace(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/, "$1");
  // Leading zeros in the dotted IPv4 part only.
  address = address.replace(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/, (v4) => v4.split(".").map((octet) => String(Number(octet))).join("."));
  const mapped = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i.exec(address);
  if (mapped) return mapped[1];
  if (!address.includes(":") || address.includes(".")) return address;
  const [head, tail = ""] = address.split("%")[0].split("::");
  const front = head === "" ? [] : head.split(":");
  const back = tail === "" ? [] : tail.split(":");
  const groups = address.includes("::") ? [...front, ...Array(Math.max(0, 8 - front.length - back.length)).fill("0"), ...back] : front;
  // An IPv4 address written in hex inside an IPv6 one (::ffff:102:304) is that
  // IPv4 address, not a network of its own.
  if (groups.length === 8 && groups.slice(0, 5).every((g) => /^0*$/.test(g)) && /^0*ffff$/i.test(groups[5])) {
    const high = parseInt(groups[6] || "0", 16);
    const low = parseInt(groups[7] || "0", 16);
    return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
  }
  return `${groups.slice(0, 4).map((group) => group.toLowerCase().replace(/^0+(?=.)/, "")).join(":")}::/64`;
}

// Vercel puts the caller's address first in x-forwarded-for.
export function visitorOf(headers: Headers, secret: string): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address = forwarded || headers.get("x-real-ip") || "unknown";
  return visitorId(addressKey(address), secret);
}

export function toResponse(handled: Handled): Response {
  if (handled.kind === "reject") {
    return jsonResponse(handled.status, { error: handled.error, reason: handled.reason });
  }
  const encoder = new TextEncoder();
  const events = handled.events;
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await events.next();
        if (next.done) {
          controller.close();
          return;
        }
        controller.enqueue(encoder.encode(encodeEvent(next.value)));
      } catch {
        // Whatever went wrong, the page gets one plain event, not a broken pipe.
        const failure: RunEvent = { type: "error", kind: "failed", message: "The run stopped unexpectedly. Here are three recorded examples." };
        controller.enqueue(encoder.encode(encodeEvent(failure)));
        controller.close();
      }
    },
    async cancel() {
      await events.return(undefined);
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "X-Accel-Buffering": "no", ...NO_STORE },
  });
}
