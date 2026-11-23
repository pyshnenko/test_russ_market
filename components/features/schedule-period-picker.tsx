"use client";

import { useId, useState } from "react";
import dynamic from "next/dynamic";
import { ScheduleIconButton } from "./schedule-buttons";
import styles from "./schedule-period.module.css";
import { dateKey } from "@/lib/schedule";
import { formatMonthYear, shiftMonth, type ScheduleView } from "@/lib/schedule-calendar";
import { Icon } from "./icon";
import { MonthOptions, WeekOptions } from "./schedule-period-options";

const Popover = dynamic(() => import("@mui/material/Popover"));

export function SchedulePeriodPicker({ view, label, anchor, today, onSelect }: {
  view: ScheduleView;
  label: string;
  anchor: string;
  today: string;
  onSelect: (date: string) => void;
}) {
  const id = useId();
  const [trigger, setTrigger] = useState<HTMLButtonElement | null>(null);
  const [cursor, setCursor] = useState(anchor);
  const isWeek = view === "week";
  const title = isWeek ? "Выбрать неделю" : "Выбрать месяц";
  const shownDate = new Date(cursor);

  function browse(offset: -1 | 1) {
    setCursor((date) => dateKey(shiftMonth(date, offset * (isWeek ? 1 : 12))));
  }

  function select(date: string) {
    setTrigger(null);
    onSelect(date);
  }

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={!!trigger}
        aria-controls={trigger ? id : undefined}
        title={title}
        onClick={(event) => {
          setCursor(anchor);
          setTrigger(event.currentTarget);
        }}
        className={styles.trigger}
      >
        {label}
      </button>
      {trigger && (
        <Popover
          open
          anchorEl={trigger}
          onClose={() => setTrigger(null)}
          anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
          transformOrigin={{ vertical: "top", horizontal: "right" }}
          marginThreshold={12}
          slotProps={{
            paper: {
              id,
              role: "dialog",
              "aria-modal": true,
              "aria-label": title,
              className: styles.paper,
            },
          }}
        >
          <div className={styles.navigation}>
            <ScheduleIconButton aria-label={isWeek ? "Предыдущий месяц" : "Предыдущий год"} onClick={() => browse(-1)}><Icon name="left" /></ScheduleIconButton>
            <span aria-live="polite" className={styles.periodTitle}>
              {isWeek ? formatMonthYear(shownDate) : shownDate.getUTCFullYear()}
            </span>
            <ScheduleIconButton aria-label={isWeek ? "Следующий месяц" : "Следующий год"} onClick={() => browse(1)}><Icon name="right" /></ScheduleIconButton>
          </div>

          {isWeek
            ? <WeekOptions cursor={cursor} anchor={anchor} today={today} onSelect={select} />
            : <MonthOptions year={shownDate.getUTCFullYear()} anchor={anchor} onSelect={select} />}

          <div className={styles.footer}>
            <button
              type="button"
              className={styles.today}
              onClick={() => select(today)}
            >Сегодня</button>
          </div>
        </Popover>
      )}
    </>
  );
}
