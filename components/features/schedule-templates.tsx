import { useState, type FormEvent } from "react";
import styles from "./schedule-templates.module.css";
import { duration, shiftSchema, type Shift, type Template } from "@/lib/schedule";
import { Icon } from "./icon";
import { ScheduleButton, ScheduleIconButton } from "./schedule-buttons";

const hours = new Intl.NumberFormat("ru", { maximumFractionDigits: 2 });

function ShiftTimeField({ name, label, value, onChange }: {
  name: "start" | "end";
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className={styles.label}>
      {label}
      <input
        name={name} type="time" required value={value}
        onChange={(event) => onChange(event.target.value)}
        className={styles.time}
      />
    </label>
  );
}

export function ScheduleTemplates({
  visible, templates, pending, hasSelection, feedback,
  onEdit, onApply, onFeedback,
}: {
  visible: boolean;
  templates: Template[];
  pending: boolean;
  hasSelection: boolean;
  feedback: string;
  onEdit: (template?: Template) => void;
  onApply: (shift: Shift) => void;
  onFeedback: (message: string) => void;
}) {
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("17:00");
  const templateHint = hasSelection
    ? "Поставить в выделенные ячейки или перетащить в календарь"
    : "Перетащите в календарь или сначала выделите ячейки";

  function applyTemplate(template: Template) {
    if (hasSelection) onApply(template);
    else onFeedback("Выделите ячейки в календаре.");
  }

  function applyCustomShift(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hasSelection || pending) return;
    const result = shiftSchema.safeParse({ name: "Своя смена", start, end, color: "amber" });
    if (result.success) onApply(result.data);
    else onFeedback(result.error.issues[0].message);
  }

  return (
    <aside aria-label="Назначение смен" data-inactive={!visible || undefined} className={styles.panel}>
      <div className={styles.heading}>
        <h2 className={styles.title}>Шаблоны смен</h2>
        <ScheduleIconButton
          aria-label="Добавить шаблон" title="Добавить шаблон"
          disabled={pending || templates.length >= 50} className={styles.addButton}
          onClick={() => onEdit()}
        ><Icon name="plus" /></ScheduleIconButton>
      </div>
      <div className={styles.templates}>
        {templates.map((template, index) => (
          <div key={template.id} data-color={template.color} className={styles.card}>
            <button
              type="button" disabled={pending} data-template-source={template.id} title={templateHint}
              onClick={() => applyTemplate(template)}
              className={styles.template}
            >
              <span className={styles.templateName}>{template.name}</span>
              <span>{template.start} – {template.end} · {hours.format(duration(template) / 60)} ч</span>
            </button>
            <button
              type="button" disabled={pending} aria-label={`Редактировать шаблон «${template.name}»`} title="Редактировать шаблон"
              className={styles.editButton}
              onClick={() => onEdit(template)}
            >
              {index < 9 ? index + 1 : <Icon name="edit" />}
            </button>
          </div>
        ))}
      </div>
      <form aria-labelledby="custom-shift-title" noValidate className={styles.customShift} onSubmit={applyCustomShift}>
        <h2 id="custom-shift-title" className={styles.title}>Своя смена</h2>
        <div className={styles.times}>
          <ShiftTimeField name="start" label="Начало" value={start} onChange={(value) => { setStart(value); onFeedback(""); }} />
          <ShiftTimeField name="end" label="Конец" value={end} onChange={(value) => { setEnd(value); onFeedback(""); }} />
        </div>
        <ScheduleButton type="submit" variant="secondary" disabled={!hasSelection || pending} className={styles.apply}>
          <Icon name="plus" /> Поставить в выделенные
        </ScheduleButton>
      </form>
      <div aria-live="polite" className={styles.feedback}>{feedback}</div>
    </aside>
  );
}
