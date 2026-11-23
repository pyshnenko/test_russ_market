"use client";

import { useActionState } from "react";
import { login } from "@/app/login/actions";

export function LoginForm() {
  const [error, action, pending] = useActionState(login, "");
  return (
    <form action={action} className="grid w-full max-w-sm gap-4 rounded-2xl bg-white p-8">
      <h1 className="text-2xl">Вход в CRM</h1>
      <label className="grid gap-2 text-sm">
        Пароль менеджера
        <input type="password" name="password" required maxLength={256} autoComplete="current-password" className="rounded-lg bg-[#eff0f4] px-4 py-3" />
      </label>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <button disabled={pending} className="rounded-lg bg-[#5978ec] px-4 py-3 text-white disabled:opacity-60">{pending ? "Вход…" : "Войти"}</button>
    </form>
  );
}
