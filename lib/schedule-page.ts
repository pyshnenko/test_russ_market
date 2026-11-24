import "server-only";
import { z } from "zod";
import { readSchedulePage } from "./repository";
import { getDays, periodOf } from "./schedule-calendar";
import { schedulePeriodSchema } from "./schedule";

export const pageNumberSchema = z.coerce.number().int().min(1).max(5000).default(1);
export const schedulePageSchema = z.object({
  query: z.string().trim().max(100).default(""),
  page: pageNumberSchema,
  period: schedulePeriodSchema.optional(),
});

export function todayInMoscow() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Moscow" }).format(new Date());
}

export function loadSchedulePage(id: string | null, { query, page, period }: z.infer<typeof schedulePageSchema>) {
  return readSchedulePage(id, { query, page, period: period ?? periodOf(getDays(todayInMoscow(), "week")) });
}
