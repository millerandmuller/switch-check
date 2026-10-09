import { handleStatus } from "@/lib/server/handlers";
import { jsonResponse, visitorOf } from "@/lib/server/http";
import { limitSecret, servicesFromEnv } from "@/lib/server/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// What is left of today's free checks, for the line above the Check button.
export async function GET(request: Request) {
  const visitor = visitorOf(request.headers, limitSecret(process.env));
  return jsonResponse(200, await handleStatus(visitor, servicesFromEnv(process.env)));
}
