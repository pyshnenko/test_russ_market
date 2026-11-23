import "server-only";
import { z } from "zod";
import { loadSchedule } from "./repository";
import type { SchedulePageData, Workspace } from "./schedule";

const pageSize = 25;
export const schedulePageSchema = z.object({
  query: z.string().trim().max(100).default(""),
  page: z.coerce.number().int().min(1).max(5000).default(1),
});

export async function loadSchedulePage(id: string | null, request: z.infer<typeof schedulePageSchema>): Promise<SchedulePageData> {
  const snapshot = await loadSchedule(id);
  const words = request.query.toLocaleLowerCase("ru").split(/\s+/).filter(Boolean);
  const matches = snapshot.data.employees.filter(({ name }) => {
    const normalized = name.toLocaleLowerCase("ru");
    return words.every((word) => normalized.includes(word));
  });
  const pageCount = Math.max(1, Math.ceil(matches.length / pageSize));
  const page = Math.min(request.page, pageCount);
  const employees = matches.slice((page - 1) * pageSize, page * pageSize);
  const ids = new Set(employees.map(({ id }) => id));
  const shifts: Workspace["shifts"] = {};
  const coverage: SchedulePageData["coverage"] = {};
  for (const [key, shift] of Object.entries(snapshot.data.shifts)) {
    const [employeeId, date] = key.split("/");
    coverage[date] = (coverage[date] ?? 0) + 1;
    if (ids.has(employeeId)) shifts[key] = shift;
  }
  return {
    version: snapshot.version,
    publishedAt: snapshot.publishedAt,
    data: { employees, shifts, templates: snapshot.data.templates },
    coverage,
    pagination: { page, pageCount, total: matches.length, query: request.query },
  };
}
