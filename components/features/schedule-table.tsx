import { memo, useMemo, type Ref } from "react";
import clsx from "clsx";
import { dateKey, duration, shiftKey, type Employee, type Shift, type Workspace } from "@/lib/schedule";
import { formatFullDate, formatWeekday, type ScheduleView } from "@/lib/schedule-calendar";
import { EmployeeAvatar } from "./employee-avatar";
import { ScheduleCell } from "./schedule-cell";
import styles from "./schedule-table.module.css";

const hours = new Intl.NumberFormat("ru", { maximumFractionDigits: 2 });
const monthColumnWidth = 64;

export const ScheduleTable = memo(function ScheduleTable({
  gridRef, view, days, today, employees, shifts, coverage, filtered, loading, pending,
  periodReady, periodMessage, selected, draggedCell, dropTarget, onDate, onSelect, onEdit,
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
  periodReady: boolean;
  periodMessage?: string;
  selected: string[];
  draggedCell?: string;
  dropTarget: string | null;
  onDate: (date: string) => void;
  onSelect: (key: string) => void;
  onEdit: (key: string, title: string, shift?: Shift) => void;
}) {
  const compact = view === "month";
  const disabled = pending || loading || !periodReady;
  const columns = useMemo(() => days.map((day) => ({
    date: dateKey(day),
    number: day.getUTCDate(),
    weekday: formatWeekday(day),
    label: formatFullDate(day),
  })), [days]);
  const rows = useMemo(() => {
    if (!periodReady) return [];
    return employees.map((employee) => {
      let minutes = 0;
      const cells = columns.map(({ date, label }) => {
        const key = shiftKey(employee.id, date);
        const shift = shifts[key];
        if (shift) minutes += duration(shift);
        return { key, shift, title: `${employee.name}, ${label}` };
      });
      return { ...employee, cells, total: hours.format(minutes / 60) };
    });
  }, [columns, employees, periodReady, shifts]);
  const keys = useMemo(() => new Set(selected), [selected]);

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
            {columns.map(({ date, number, weekday, label }) => (
              <th scope="col" key={date} data-date={date} data-today={date === today || undefined} className={styles.dateHeading}>
                <button
                  type="button" aria-haspopup="dialog" aria-label={`Быстро назначить смену: ${label}`}
                  disabled={disabled} onClick={() => onDate(date)}
                  className={styles.dateButton}
                >
                  {compact ? (
                    <span className={styles.monthDate}>
                      <span>{weekday}</span>
                      <span className={styles.monthDay}>{number}</span>
                    </span>
                  ) : `${weekday} ${number}`}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody key={`${view}:${columns[0].date}`} className={styles.body}>
          {rows.map(({ id, name, role, avatar, total, cells }) => (
            <tr key={id} className={styles.row}>
              <th scope="row" className={styles.employee}>
                <div className={styles.employeeInfo}>
                  <EmployeeAvatar avatar={avatar} name={name} priority />
                  <div className={styles.employeeText}>
                    <div title={name} className={styles.employeeName}>{name}</div>
                    <div className={styles.employeeHours}>{role} · {total} ч</div>
                  </div>
                </div>
              </th>
              {cells.map(({ key, shift, title }) => (
                <ScheduleCell
                  key={key} cellKey={key} title={title} shift={shift} compact={compact} disabled={disabled}
                  selected={keys.has(key)} dragging={draggedCell === key} dropTarget={dropTarget === key}
                  onSelect={onSelect} onEdit={onEdit}
                />
                ))}
            </tr>
          ))}
          {(periodMessage || (periodReady && !employees.length)) && (
            <tr><td colSpan={days.length + 1} className={styles.empty}>
              {periodMessage ?? (filtered ? "Сотрудники не найдены" : "Добавьте сотрудников на главной странице")}
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
                <td key={date} data-covered={periodReady && count > 0 || undefined} className={styles.coverage}>{periodReady ? count : "—"}</td>
              );
            })}
          </tr>
        </tfoot>
      </table>
    </div>
  );
});
