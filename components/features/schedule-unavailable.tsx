"use client";

import { useTransition } from "react";
import Button from "@mui/material/Button";
import clsx from "clsx";
import styles from "@/components/ui/notice.module.css";
import { useRouter } from "next/navigation";

export function ScheduleUnavailable({ title = "График временно недоступен" }: { title?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className={styles.withinShell}>
      <section aria-labelledby="schedule-unavailable-title" className={clsx(styles.card, styles.unavailable)}>
        <h1 id="schedule-unavailable-title" className={styles.title}>{title}</h1>
        <p role="status" className={styles.detail}>{pending ? "Проверяем подключение…" : "Не удалось подключиться к базе данных."}</p>
        <Button type="button" variant="contained" disabled={pending} onClick={() => startTransition(() => router.refresh())} className={styles.button}>
          Попробовать снова
        </Button>
      </section>
    </div>
  );
}
