import "server-only";
import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { z } from "zod";
import { auth } from "./auth";

const demoCookie = "schedule_workspace";
export const isDemo = () => !process.env.DATABASE_URL;

export async function workspaceId(create = false) {
  if (!isDemo()) {
    const session = await auth();
    return session?.user?.email === "manager@schedule.local" ? "manager" : null;
  }

  const jar = await cookies();
  const existing = z.uuid().safeParse(jar.get(demoCookie)?.value);
  if (existing.success) return existing.data;
  if (!create) return null;
  const id = randomUUID();
  jar.set(demoCookie, id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
  return id;
}
