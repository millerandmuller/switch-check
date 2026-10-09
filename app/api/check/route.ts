import { handleCheck } from "@/lib/server/handlers";
import { jsonResponse, readJsonBody, toResponse, visitorOf } from "@/lib/server/http";
import { limitSecret, servicesFromEnv } from "@/lib/server/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The longest a check may run, in seconds. The pipeline plans for 55 of them.
export const maxDuration = 60;

export async function POST(request: Request) {
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  try {
    const visitor = visitorOf(request.headers, limitSecret(process.env));
    return toResponse(await handleCheck(body.body, visitor, servicesFromEnv(process.env)));
  } catch (error) {
    // The name only: a message could hold request text.
    console.error(`api/check failed: ${error instanceof Error ? error.name : "unknown"}`);
    return jsonResponse(500, { error: "Something went wrong before the check could start. Here are three recorded examples.", reason: "unavailable" });
  }
}
