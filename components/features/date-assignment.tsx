"use client";

import { useState } from "react";
import Dialog from "@mui/material/Dialog";
import Button from "@mui/material/Button";
import { ScheduleButton } from "./schedule-buttons";
import styles from "./schedule-dialogs.module.css";
import { parseShiftKey, shiftKey, type Employee, type Template, type Workspace } from "@/lib/schedule";

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
  const [keys, setKeys] = useState(() => selected.filter((key) => parseShiftKey(key)?.date === date));

  return (
    <Dialog open onClose={onClose} aria-labelledby="date-assignment-title" fullWidth maxWidth="xs" scroll="paper">
      <div className={styles.assignment}>
        <div>
          <h2 id="date-assignment-title" className={styles.title}>Назначить смену</h2>
          <p className={styles.date}>{label}</p>
        </div>
        <fieldset className={styles.employees}>
          <legend className={styles.legend}>Сотрудники</legend>
          {scoped && <p className={styles.hint}>Сотрудники с текущей страницы таблицы</p>}
          {!employees.length && <p className={styles.emptyEmployees}>На текущей странице нет сотрудников.</p>}
          {employees.map(({ id, name }) => {
            const key = shiftKey(id, date);
            const shift = shifts[key];
            return (
              <label key={id} className={styles.employee}>
                <input type="checkbox" checked={keys.includes(key)} className={styles.checkbox} onChange={(event) => {
                  const checked = event.target.checked;
                  setKeys((current) => checked ? [...current, key] : current.filter((value) => value !== key));
                }} />
                <span className={styles.employeeName}>{name}</span>
                {shift && <span className={styles.hours}>{shift.start}–{shift.end}</span>}
              </label>
            );
          })}
        </fieldset>
        <div role="group" aria-label="Шаблоны смен" className={styles.templates}>
          <h3 className={styles.templatesTitle}>Шаблоны смен</h3>
          {templates.map((template) => (
            <ScheduleButton key={template.id} type="button" variant="secondary" disabled={!keys.length} onClick={() => onApply(keys, template)} className={styles.template}>
              <span>{template.name}</span>
              <span className={styles.time}>{template.start}–{template.end}</span>
            </ScheduleButton>
          ))}
          {!templates.length && <p className={styles.empty}>Добавьте шаблон в панели смен.</p>}
        </div>
        <Button type="button" onClick={onClose} className={styles.close}>Закрыть</Button>
      </div>
    </Dialog>
  );
}
