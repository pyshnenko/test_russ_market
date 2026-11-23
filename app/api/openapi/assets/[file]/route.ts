import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

const asset = z.literal("swagger-ui-bundle.js");

export async function GET(_: Request, context: { params: Promise<{ file: string }> }) {
  const parsed = asset.safeParse((await context.params).file);
  if (!parsed.success) return new Response(null, { status: 404 });
  const file = await readFile(join(process.cwd(), "node_modules", "swagger-ui-dist", parsed.data));
  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": "text/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
