"use server";

import { AuthError } from "next-auth";
import { loginSchema, signIn } from "@/lib/auth";

export async function login(_: string, form: FormData) {
  const input = loginSchema.safeParse({ password: form.get("password") });
  if (!input.success) return "Введите пароль менеджера.";
  try {
    await signIn("credentials", { ...input.data, redirectTo: "/" });
    return "";
  } catch (error) {
    if (error instanceof AuthError && error.type === "CredentialsSignin") return "Неверный пароль.";
    throw error;
  }
}
