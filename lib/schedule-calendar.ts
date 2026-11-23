export type ScheduleView = "week" | "month";

const timeZone = "UTC";
export const formatFullDate = new Intl.DateTimeFormat("ru", { dateStyle: "long", timeZone }).format;
export const formatShortDate = new Intl.DateTimeFormat("ru", { day: "numeric", month: "short", timeZone }).format;
export const formatWeekday = new Intl.DateTimeFormat("ru", { weekday: "short", timeZone }).format;
export const formatMonthYear = new Intl.DateTimeFormat("ru", { month: "long", year: "numeric", timeZone }).format;
export const formatMonth = new Intl.DateTimeFormat("ru", { month: "long", timeZone }).format;

export function isSameMonth(first: string, second: string) {
  return first.slice(0, 7) === second.slice(0, 7);
}

export function monthFocusDate(anchor: string, week: string[], hasShift: (date: string) => boolean) {
  const scheduled = week.filter(hasShift);
  return scheduled.find((date) => isSameMonth(date, anchor)) ?? scheduled[0] ?? anchor;
}

export function addDays(date: Date, offset: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + offset);
  return next;
}

function mondayOffset(date: Date) {
  return (date.getUTCDay() + 6) % 7;
}

function weekFrom(monday: Date) {
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
}

export function getDays(anchor: string, view: ScheduleView) {
  const first = new Date(anchor);
  if (view === "week") return weekFrom(addDays(first, -mondayOffset(first)));

  first.setUTCDate(1);
  const last = new Date(first);
  last.setUTCMonth(last.getUTCMonth() + 1, 0);
  return Array.from({ length: last.getUTCDate() }, (_, index) => addDays(first, index));
}

export function getCalendarWeeks(anchor: string) {
  const days = getDays(anchor, "month");
  const leadingDays = mondayOffset(days[0]);
  const firstMonday = addDays(days[0], -leadingDays);
  return Array.from({ length: Math.ceil((leadingDays + days.length) / 7) }, (_, index) =>
    weekFrom(addDays(firstMonday, index * 7)),
  );
}

export function shiftMonth(anchor: string, offset: number) {
  const date = new Date(anchor);
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + offset);
  return date;
}
