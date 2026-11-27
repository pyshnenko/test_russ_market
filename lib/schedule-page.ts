import "server-only";
import { z } from "zod";
import { readSchedulePage } from "./repository";
import { getDays, periodOf } from "./schedule-calendar";
import { schedulePageSize, schedulePageSizeSchema, schedulePeriodSchema } from "./schedule";

export const pageNumberSchema = z.coerce.number().int().min(1).max(5000).default(1);
export const schedulePageSchema = z.object({
  query: z.string().trim().max(100).default(""),
  page: pageNumberSchema,
  pageSize: z.coerce.number().pipe(schedulePageSizeSchema).default(schedulePageSize),
  period: schedulePeriodSchema.optional(),
});

export function todayInMoscow() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Moscow" }).format(new Date());
}

export function loadSchedulePage(id: string | null, { query, page, pageSize = schedulePageSize, period }: Omit<z.infer<typeof schedulePageSchema>, "pageSize"> & {
  pageSize?: z.infer<typeof schedulePageSizeSchema>;
}) {
  return readSchedulePage(id, { query, page, pageSize, period: period ?? periodOf(getDays(todayInMoscow(), "week")) });
}
