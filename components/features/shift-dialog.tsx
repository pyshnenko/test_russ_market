"use client";

import { useState, type FormEvent } from "react";
import Dialog from "@mui/material/Dialog";
import Button from "@mui/material/Button";
import { colors, shiftSchema, type Shift } from "@/lib/schedule";
import styles from "./schedule-dialogs.module.css";

export function ShiftDialog({ title, value, onClose, onSave, onRemove }: {
  title: string;
  value?: Shift;
  onClose: () => void;
  onSave: (value: Shift) => void;
  onRemove: () => void;
}) {
  const [error, setError] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = shiftSchema.safeParse(Object.fromEntries(new FormData(event.currentTarget)));
    if (!result.success) {
      setError(result.error.issues[0].message);
      return;
    }
    onSave(result.data);
  }

  return (
    <Dialog open onClose={onClose} aria-labelledby="shift-dialog-title" fullWidth maxWidth="xs">
      <form onSubmit={submit} className={styles.form}>
        <h2 id="shift-dialog-title" className={styles.title}>{title}</h2>
        <label className={styles.label}>Название<input className={styles.field} name="name" autoFocus required maxLength={40} defaultValue={value?.name} /></label>
        <div className={styles.times}>
          <label className={styles.label}>Начало<input className={styles.field} type="time" name="start" required defaultValue={value?.start ?? "09:00"} /></label>
          <label className={styles.label}>Конец<input className={styles.field} type="time" name="end" required defaultValue={value?.end ?? "17:00"} /></label>
        </div>
        <label className={styles.label}>Цвет<select className={styles.field} name="color" defaultValue={value?.color ?? "blue"}>
          {Object.entries(colors).map(([key, color]) => <option key={key} value={key}>{color.name}</option>)}
        </select></label>
        {error && <p role="alert" className={styles.error}>{error}</p>}
        <div className={styles.actions}>
          {value && <Button type="button" className={styles.deleteButton} onClick={onRemove}>Удалить</Button>}
          <Button type="button" className={styles.cancelButton} onClick={onClose}>Отмена</Button>
          <Button type="submit" variant="contained" className={styles.confirmButton}>Применить</Button>
        </div>
      </form>
    </Dialog>
  );
}
