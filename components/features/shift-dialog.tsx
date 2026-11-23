"use client";

import { useState, type FormEvent } from "react";
import Dialog from "@mui/material/Dialog";
import { colors, shiftSchema, type Shift } from "@/lib/schedule";

const field = "min-w-0 rounded-lg bg-[#eff0f4] px-3 py-2.5 outline-none focus-visible:ring-2 focus-visible:ring-[#5978ec]";

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
      <form onSubmit={submit} className="grid gap-4 p-6 text-sm">
        <h2 id="shift-dialog-title" className="text-xl font-medium">{title}</h2>
        <label className="grid gap-1">Название<input className={field} name="name" autoFocus required maxLength={40} defaultValue={value?.name} /></label>
        <div className="grid grid-cols-2 gap-2">
          <label className="grid gap-1">Начало<input className={field} type="time" name="start" required defaultValue={value?.start ?? "09:00"} /></label>
          <label className="grid gap-1">Конец<input className={field} type="time" name="end" required defaultValue={value?.end ?? "17:00"} /></label>
        </div>
        <label className="grid gap-1">Цвет<select className={field} name="color" defaultValue={value?.color ?? "blue"}>
          {Object.entries(colors).map(([key, color]) => <option key={key} value={key}>{color.name}</option>)}
        </select></label>
        {error && <p role="alert" className="text-red-700">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          {value && <button type="button" className="mr-auto cursor-pointer rounded-lg px-2 text-red-700 hover:bg-red-50" onClick={onRemove}>Удалить</button>}
          <button type="button" className="cursor-pointer rounded-lg bg-[#eff0f4] px-3 py-2" onClick={onClose}>Отмена</button>
          <button className="cursor-pointer rounded-lg bg-[#5978ec] px-3 py-2 text-white">Применить</button>
        </div>
      </form>
    </Dialog>
  );
}
