import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";

export const loginSchema = z.object({
  password: z.string().min(1).max(256),
});

export const { auth, signIn, handlers } = NextAuth({
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { password: { type: "password" } },
      authorize(input) {
        const parsed = loginSchema.safeParse(input);
        const expected = process.env.SCHEDULE_ADMIN_PASSWORD;
        if (!parsed.success || !expected) return null;
        const hash = (value: string) => createHash("sha256").update(value).digest();
        return timingSafeEqual(hash(expected), hash(parsed.data.password))
          ? { id: "manager", name: "Менеджер", email: "manager@schedule.local" }
          : null;
      },
    }),
  ],
});
