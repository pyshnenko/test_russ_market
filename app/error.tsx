"use client";

import Button from "@mui/material/Button";
import styles from "@/components/ui/notice.module.css";

export default function ScheduleError({ reset }: { reset: () => void }) {
  return (
    <main className={styles.screen}>
      <div className={styles.card}>
        <h1 className={styles.title}>Не удалось открыть график</h1>
        <Button type="button" variant="contained" onClick={reset} className={styles.button}>Попробовать снова</Button>
      </div>
    </main>
  );
}
