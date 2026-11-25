import { after } from "next/server";
import { z } from "zod";
import { sendVisitorNotification } from "@/lib/ws/visitor-relay";

const httpOrigin = z.url({ protocol: /^https?$/ });

export function POST(request: Request) {
  const origin = httpOrigin.safeParse(request.headers.get("origin"));
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin.success || new URL(origin.data).host !== host) {
    return new Response(null, { status: 403 });
  }

  after(sendVisitorNotification);
  return new Response(null, { status: 204 });
}
