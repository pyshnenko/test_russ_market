import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { managerWorkspaceId } from "@/lib/access";
import { getDatabaseErrorCode } from "@/lib/database-errors";
import { loadSchedulePage } from "@/lib/schedule-page";

const readinessToken = z.string().regex(/^[a-f0-9]{64}$/);
const headers = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const secret = process.env.AUTH_SECRET;
  const token = readinessToken.safeParse(request.headers.get("Authorization")?.match(/^Bearer (.+)$/i)?.[1]);
  if (!secret || !token.success) return new Response(null, { status: 401, headers });

  const expected = createHmac("sha256", secret).update("schedule-readiness").digest();
  if (!timingSafeEqual(expected, Buffer.from(token.data, "hex"))) return new Response(null, { status: 401, headers });
  if (!process.env.DATABASE_URL) return new Response(null, { status: 503, headers });

  try {
    await loadSchedulePage(managerWorkspaceId, { query: "", page: 1 });
    return new Response(null, { status: 204, headers });
  } catch (error) {
    console.warn("Schedule readiness check failed", getDatabaseErrorCode(error) ?? "unknown");
    return new Response(null, { status: 503, headers });
  }
}
