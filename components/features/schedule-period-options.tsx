import clsx from "clsx";
import styles from "./schedule-period.module.css";
import { dateKey } from "@/lib/schedule";
import { formatFullDate, formatMonth, formatMonthYear, formatWeekday, getCalendarWeeks, getDays, isSameMonth } from "@/lib/schedule-calendar";


export function WeekOptions({ cursor, anchor, today, onSelect }: {
  cursor: string;
  anchor: string;
  today: string;
  onSelect: (date: string) => void;
}) {
  const weeks = getCalendarWeeks(cursor);
  const selectedMonday = dateKey(getDays(anchor, "week")[0]);

  return (
    <div className={styles.weeks}>
      <div aria-hidden="true" className={styles.weekdays}>
        {weeks[0].map((date) => <span key={dateKey(date)}>{formatWeekday(date)}</span>)}
      </div>
      {weeks.map((week) => {
        const monday = dateKey(week[0]);
        const selected = monday === selectedMonday;

        return (
          <button
            type="button"
            key={monday}
            aria-label={`Неделя с ${formatFullDate(week[0])} по ${formatFullDate(week[6])}`}
            aria-pressed={selected}
            className={clsx(styles.option, styles.week)}
            onClick={() => onSelect(monday)}
          >
            {week.map((date) => {
              const key = dateKey(date);
              return (
                <span key={key} className={clsx(!isSameMonth(key, cursor) && styles.outsideMonth, key === today && styles.currentDay)}>
                  {date.getUTCDate()}
                </span>
              );
            })}
          </button>
        );
      })}
    </div>
  );
}

export function MonthOptions({ year, anchor, onSelect }: {
  year: number;
  anchor: string;
  onSelect: (date: string) => void;
}) {
  const months = Array.from({ length: 12 }, (_, index) => new Date(Date.UTC(year, index, 1)));

  return (
    <div className={styles.months}>
      {months.map((date) => {
        const key = dateKey(date);

        return (
          <button
            type="button"
            key={key}
            aria-label={formatMonthYear(date)}
            aria-pressed={isSameMonth(key, anchor)}
            className={clsx(styles.option, styles.month)}
            onClick={() => onSelect(key)}
          >
            {formatMonth(date)}
          </button>
        );
      })}
    </div>
  );
}
