"use client";

import { useActionState } from "react";
import Button from "@mui/material/Button";
import clsx from "clsx";
import styles from "@/components/ui/notice.module.css";
import { login } from "@/app/login/actions";

export function LoginForm() {
  const [error, action, pending] = useActionState(login, "");
  return (
    <form action={action} className={clsx(styles.card, styles.login)}>
      <h1 className={styles.loginTitle}>Вход в CRM</h1>
      <label className={styles.loginField}>
        Пароль менеджера
        <input type="password" name="password" required maxLength={256} autoComplete="current-password" className={styles.password} />
      </label>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      <Button type="submit" variant="contained" disabled={pending} className={styles.button}>{pending ? "Вход…" : "Войти"}</Button>
    </form>
  );
}
