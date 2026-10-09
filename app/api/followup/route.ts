import { handleFollowup } from "@/lib/server/handlers";
import { jsonResponse, readJsonBody, toResponse } from "@/lib/server/http";
import { servicesFromEnv } from "@/lib/server/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  try {
    return toResponse(await handleFollowup(body.body, servicesFromEnv(process.env)));
  } catch (error) {
    // The name only: a message could hold request text.
    console.error(`api/followup failed: ${error instanceof Error ? error.name : "unknown"}`);
    return jsonResponse(500, { error: "The follow-up could not start.", reason: "unavailable" });
  }
}
