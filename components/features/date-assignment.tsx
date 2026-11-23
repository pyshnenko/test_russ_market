"use client";

import { useState } from "react";
import Dialog from "@mui/material/Dialog";
import { shiftKey, type Employee, type Template, type Workspace } from "@/lib/schedule";

export function DateAssignment({ date, label, shifts, templates, employees, scoped, selected, onClose, onApply }: {
  date: string;
  label: string;
  shifts: Workspace["shifts"];
  templates: Template[];
  employees: Employee[];
  scoped: boolean;
  selected: string[];
  onClose: () => void;
  onApply: (keys: string[], template: Template) => void;
}) {
  const [keys, setKeys] = useState(() => selected.filter((key) => key.endsWith(`/${date}`)));

  return (
    <Dialog open onClose={onClose} aria-labelledby="date-assignment-title" fullWidth maxWidth="xs" scroll="paper">
      <div className="grid min-h-0 gap-4 overflow-y-auto p-4 text-sm sm:p-6">
        <div>
          <h2 id="date-assignment-title" className="text-xl font-medium">Назначить смену</h2>
          <p className="mt-1 text-[#636770]">{label}</p>
        </div>
        <fieldset className="grid gap-0.5">
          <legend className="mb-2 font-medium">Сотрудники</legend>
          {scoped && <p className="px-2 text-xs text-[#636770]">Сотрудники с текущей страницы таблицы</p>}
          {!employees.length && <p className="px-2 text-[#636770]">На текущей странице нет сотрудников.</p>}
          {employees.map(({ id, name }) => {
            const key = shiftKey(id, date);
            const shift = shifts[key];
            return (
              <label key={id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-[#eff0f4]">
                <input type="checkbox" checked={keys.includes(key)} className="size-4 shrink-0 accent-[#5978ec]" onChange={(event) => {
                  const checked = event.target.checked;
                  setKeys((current) => checked ? [...current, key] : current.filter((value) => value !== key));
                }} />
                <span className="flex-1">{name}</span>
                {shift && <span className="text-xs whitespace-nowrap text-[#636770]">{shift.start}–{shift.end}</span>}
              </label>
            );
          })}
        </fieldset>
        <div role="group" aria-label="Шаблоны смен" className="grid gap-1">
          <h3 className="mb-1 font-medium">Шаблоны смен</h3>
          {templates.map((template) => (
            <button key={template.id} type="button" disabled={!keys.length} onClick={() => onApply(keys, template)} className="flex cursor-pointer flex-wrap justify-between gap-x-2 rounded-lg bg-[#e7ecff] px-3 py-2 text-left text-[#2047d9] enabled:hover:bg-[#cfd8fa] enabled:active:bg-[#bac8f5] disabled:cursor-default disabled:bg-[#eff0f4] disabled:text-[#777b84]">
              <span>{template.name}</span>
              <span className="whitespace-nowrap">{template.start}–{template.end}</span>
            </button>
          ))}
          {!templates.length && <p className="text-[#636770]">Добавьте шаблон в панели смен.</p>}
        </div>
        <button type="button" onClick={onClose} className="justify-self-end rounded-lg px-3 py-2 hover:bg-[#eff0f4]">Закрыть</button>
      </div>
    </Dialog>
  );
}
