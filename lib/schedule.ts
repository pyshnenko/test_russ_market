import { z } from "zod";

export const employeeFields = z.object({
  name: z.string().trim().min(1, "Введите ФИО.").max(100, "ФИО должно быть не длиннее 100 символов."),
  role: z.string().trim().min(1, "Введите должность.").max(80, "Должность должна быть не длиннее 80 символов."),
});
export const employeeIdSchema = z.union([z.string().regex(/^[1-8]$/), z.uuid()]);
const avatarSchema = z.union([
  z.string().regex(/^\/employees\/[1-8]\.png$/),
  z.string().max(65_560).regex(/^data:image\/webp;base64,[A-Za-z0-9+/]+={0,2}$/),
]).nullable();
const employeeSchema = employeeFields.extend({ id: employeeIdSchema, avatar: avatarSchema });
export type Employee = z.infer<typeof employeeSchema>;

export const defaultEmployees: Employee[] = [
  { id: "1", name: "Кузнецова Алина", role: "агент" },
  { id: "2", name: "Волков Тимур", role: "агент" },
  { id: "3", name: "Морозова Виктория", role: "агент" },
  { id: "4", name: "Соколов Артём", role: "агент" },
  { id: "5", name: "Лебедева Полина", role: "агент" },
  { id: "6", name: "Новиков Кирилл", role: "агент" },
  { id: "7", name: "Ерохина Дарья", role: "агент" },
  { id: "8", name: "Гаврилов Егор", role: "агент" },
].map((employee) => ({ ...employee, avatar: `/employees/${employee.id}.png` }));
export const colors = {
  violet: { name: "Фиолетовый", hex: "#8b5cf6" },
  blue: { name: "Синий", hex: "#5978ec" },
  green: { name: "Зелёный", hex: "#14a69c" },
  amber: { name: "Янтарный", hex: "#e9a23b" },
};
export type PresetShiftColor = keyof typeof colors;
export const hexShiftColor = /^#[0-9a-fA-F]{6}$/;

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Укажите время в формате ЧЧ:ММ");
const shiftFields = z.object({
  name: z.string().trim().min(1, "Введите название смены").max(40, "Не более 40 символов"),
  start: time,
  end: time,
  color: z.union([z.enum(["violet", "blue", "green", "amber"]), z.string().regex(hexShiftColor)], {
    error: "Выберите цвет смены.",
  }),
});

function differentTimes(shift: { start: string; end: string }) {
  return shift.start !== shift.end;
}

export const shiftSchema = shiftFields.refine(differentTimes, "Время начала и конца должно различаться");
export const templateSchema = shiftFields.extend({ id: z.uuid() }).refine(differentTimes);
const dateSchema = z.iso.date();
export const schedulePeriodSchema = z.object({ from: dateSchema, to: dateSchema }).refine(({ from, to }) =>
  from <= to && Date.parse(to) - Date.parse(from) < 31 * 86_400_000
);
export type SchedulePeriod = z.infer<typeof schedulePeriodSchema>;
const shiftKeySeparator = "/";

export function shiftKey(employeeId: string, date: string) {
  return `${employeeId}${shiftKeySeparator}${date}`;
}

export function parseShiftKey(key: string) {
  const [employeeId, date, extra] = key.split(shiftKeySeparator);
  return employeeId && date && extra === undefined ? { employeeId, date } : null;
}

const shiftKeySchema = z.string().refine((key) => {
  const cell = parseShiftKey(key);
  return cell !== null && employeeIdSchema.safeParse(cell.employeeId).success && dateSchema.safeParse(cell.date).success;
});
const templatesSchema = z.array(templateSchema).max(50).refine((items) => new Set(items.map(({ id }) => id)).size === items.length);
const scheduleDataSchema = z.object({ shifts: z.record(shiftKeySchema, shiftSchema), templates: templatesSchema });
export const schedulePatchSchema = z.object({ changes: z.record(shiftKeySchema, shiftSchema.nullable()), templates: templatesSchema });

export const maxEmployees = 5000;
export const workspaceSchema = scheduleDataSchema.extend({
  employees: z.array(employeeSchema).max(maxEmployees).default(defaultEmployees),
}).refine(({ employees, shifts }) => {
  const ids = new Set(employees.map(({ id }) => id));
  return ids.size === employees.length && Object.keys(shifts).every((key) => {
    const cell = parseShiftKey(key);
    return cell !== null && ids.has(cell.employeeId);
  });
});

export type Shift = z.infer<typeof shiftSchema>;
export type Template = z.infer<typeof templateSchema>;
export type Workspace = z.infer<typeof workspaceSchema>;
export type Snapshot = { version: number; data: Workspace; publishedAt: string | null };
export type ShiftPatch = z.infer<typeof schedulePatchSchema>["changes"];
export type ShiftChanges = Record<string, { before: Shift | null; after: Shift | null }>;
export const schedulePageSize = 25;
export const schedulePageResponseSchema = z.object({
  version: z.number().int().nonnegative(),
  publishedAt: z.iso.datetime().nullable(),
  period: schedulePeriodSchema,
  data: scheduleDataSchema.extend({ employees: z.array(employeeSchema).max(schedulePageSize) }),
  coverage: z.record(dateSchema, z.number().int().nonnegative()),
  pagination: z.object({
    page: z.number().int().positive(),
    pageCount: z.number().int().positive(),
    total: z.number().int().nonnegative(),
    query: z.string().max(100),
  }),
});
export type SchedulePageData = z.infer<typeof schedulePageResponseSchema>;

export function patchShifts(shifts: Workspace["shifts"], changes: ShiftPatch) {
  const next = { ...shifts };
  for (const [key, shift] of Object.entries(changes)) {
    if (shift) next[key] = shift;
    else delete next[key];
  }
  return next;
}

export function patchCoverage(coverage: Record<string, number>, changes: ShiftChanges) {
  const next = { ...coverage };
  for (const [key, { before, after }] of Object.entries(changes)) {
    const cell = parseShiftKey(key);
    if (!cell) continue;
    const { date } = cell;
    next[date] = (next[date] ?? 0) + Number(!!after) - Number(!!before);
  }
  return next;
}

export function changesInPeriod(changes: ShiftChanges, { from, to }: SchedulePeriod): ShiftChanges {
  return Object.fromEntries(Object.entries(changes).filter(([key]) => {
    const cell = parseShiftKey(key);
    return cell && cell.date >= from && cell.date <= to;
  }));
}

export function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function duration(shift: Shift) {
  const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
  return (minutes(shift.end) - minutes(shift.start) + 1440) % 1440;
}
