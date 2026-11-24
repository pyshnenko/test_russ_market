import type { Ref } from "react";
import clsx from "clsx";
import { dateKey, duration, shiftKey, type Employee, type Shift, type Workspace } from "@/lib/schedule";
import { formatFullDate, formatWeekday, type ScheduleView } from "@/lib/schedule-calendar";
import { EmployeeAvatar } from "./employee-avatar";
import { ScheduleCell } from "./schedule-cell";
import styles from "./schedule-table.module.css";

const hours = new Intl.NumberFormat("ru", { maximumFractionDigits: 2 });
const monthColumnWidth = 64;

export function ScheduleTable({
  gridRef, view, days, today, employees, shifts, coverage, filtered, loading, pending,
  selected, draggedCell, dropTarget, onDate, onSelect, onEdit,
}: {
  gridRef: Ref<HTMLDivElement>;
  view: ScheduleView;
  days: Date[];
  today: string;
  employees: Employee[];
  shifts: Workspace["shifts"];
  coverage: Record<string, number>;
  filtered: boolean;
  loading: boolean;
  pending: boolean;
  selected: string[];
  draggedCell?: string;
  dropTarget: string | null;
  onDate: (date: string) => void;
  onSelect: (key: string) => void;
  onEdit: (key: string, title: string, shift?: Shift) => void;
}) {
  const compact = view === "month";
  const disabled = pending || loading;
  const columns = days.map((day) => ({ day, date: dateKey(day) }));
  const keys = new Set(selected);

  return (
    <div
      ref={gridRef} tabIndex={0} role="region" aria-label="Таблица смен" aria-busy={loading}
      className={styles.viewport}
    >
      <table
        style={compact ? { minWidth: `calc(var(--employee-width) + ${days.length * monthColumnWidth}px)` } : undefined}
        className={clsx(styles.table, !compact && styles.weekTable)}
      >
        <colgroup>
          <col className={styles.employeeColumn} />
          {columns.map(({ date }) => <col key={date} style={compact ? { width: monthColumnWidth } : undefined} />)}
        </colgroup>
        <thead className={styles.header}>
          <tr className={styles.headerRow}>
            <th scope="col" className={styles.employeeHeading}>Сотрудник</th>
            {columns.map(({ day, date }) => (
              <th scope="col" key={date} data-date={date} data-today={date === today || undefined} className={styles.dateHeading}>
                <button
                  type="button" aria-haspopup="dialog" aria-label={`Быстро назначить смену: ${formatFullDate(day)}`}
                  disabled={disabled} onClick={() => onDate(date)}
                  className={styles.dateButton}
                >
                  {compact ? (
                    <span className={styles.monthDate}>
                      <span>{formatWeekday(day)}</span>
                      <span className={styles.monthDay}>{day.getUTCDate()}</span>
                    </span>
                  ) : `${formatWeekday(day)} ${day.getUTCDate()}`}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody key={`${view}:${columns[0].date}`} className={styles.body}>
          {employees.map(({ id, name, role, avatar }) => {
            const total = columns.reduce((sum, { date }) => {
              const shift = shifts[shiftKey(id, date)];
              return sum + (shift ? duration(shift) : 0);
            }, 0);

            return (
              <tr key={id} className={styles.row}>
                <th scope="row" className={styles.employee}>
                  <div className={styles.employeeInfo}>
                    <EmployeeAvatar avatar={avatar} name={name} priority />
                    <div className={styles.employeeText}>
                      <div title={name} className={styles.employeeName}>{name}</div>
                      <div className={styles.employeeHours}>{role} · {hours.format(total / 60)} ч</div>
                    </div>
                  </div>
                </th>
                {columns.map(({ day, date }) => {
                  const key = shiftKey(id, date);
                  const shift = shifts[key];
                  const title = `${name}, ${formatFullDate(day)}`;

                  return (
                    <ScheduleCell
                      key={key} cellKey={key} title={title} shift={shift} compact={compact} disabled={disabled}
                      selected={keys.has(key)} dragging={draggedCell === key} dropTarget={dropTarget === key}
                      onSelect={() => onSelect(key)} onEdit={() => onEdit(key, title, shift)}
                    />
                  );
                })}
              </tr>
            );
          })}
          {!employees.length && (
            <tr><td colSpan={days.length + 1} className={styles.empty}>
              {filtered ? "Сотрудники не найдены" : "Добавьте сотрудников на главной странице"}
            </td></tr>
          )}
          <tr aria-hidden="true" className={styles.spacer}><td colSpan={days.length + 1} /></tr>
        </tbody>
        <tfoot className={styles.footer}>
          <tr>
            <th scope="row" className={styles.coverageHeading}>Покрытие</th>
            {columns.map(({ date }) => {
              const count = coverage[date] ?? 0;
              return (
                <td key={date} data-covered={count > 0 || undefined} className={styles.coverage}>{count}</td>
              );
            })}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
