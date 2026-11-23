"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import sharp from "sharp";
import { z } from "zod";
import { workspaceId } from "@/lib/access";
import { getDatabaseErrorCode, isDatabaseUnavailable } from "@/lib/database-errors";
import { loadSchedule, persistSchedule } from "@/lib/repository";
import { employeeFields, employeeIdSchema, maxEmployees } from "@/lib/schedule";

const versionSchema = z.string().regex(/^\d{1,10}$/).transform(Number);
const avatarFile = z.file().max(5 * 1024 * 1024, "Загрузите изображение размером до 5 МБ.")
  .mime(["image/jpeg", "image/png", "image/webp"], "Допустимые форматы аватара: JPEG, PNG и WebP.");

const employeeAction = z.discriminatedUnion("intent", [
  employeeFields.extend({ intent: z.literal("create"), version: versionSchema, avatar: avatarFile.optional() }),
  employeeFields.extend({ intent: z.literal("edit"), version: versionSchema, id: employeeIdSchema, avatar: avatarFile.optional(), removeAvatar: z.boolean() }),
  z.object({ intent: z.literal("delete"), version: versionSchema, id: employeeIdSchema }),
]);

export type EmployeeActionResult = { success?: boolean; error?: string };

async function encodeAvatar(file: File) {
  const buffer = Buffer.from(await file.arrayBuffer());
  const jpeg = buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
  const png = buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const webp = buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP";
  if (!jpeg && !png && !webp) throw new Error("Unsupported image signature");
  const image = await sharp(buffer, { limitInputPixels: 25_000_000 })
    .rotate().resize(192, 192, { fit: "cover" }).webp({ quality: 76 }).toBuffer();
  if (image.length > 48 * 1024) throw new Error("Avatar output exceeds size limit");
  return `data:image/webp;base64,${image.toString("base64")}`;
}

export async function mutateEmployee(_: EmployeeActionResult, form: FormData): Promise<EmployeeActionResult> {
  const file = form.get("avatar");
  const parsed = employeeAction.safeParse({
    intent: form.get("intent"),
    id: form.get("id"),
    version: form.get("version"),
    name: form.get("name"),
    role: form.get("role"),
    avatar: file instanceof File && file.size === 0 ? undefined : file ?? undefined,
    removeAvatar: form.get("removeAvatar") === "on",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const workspace = await workspaceId(true);
  if (!workspace) return { error: "Сеанс завершён. Войдите снова." };

  const input = parsed.data;
  const conflict = { error: "Данные изменены в другой вкладке. Закройте форму и обновите страницу." };
  try {
    const snapshot = await loadSchedule(workspace);
    if (snapshot.version !== input.version) return conflict;
    const { employees, shifts, templates } = snapshot.data;
    const existing = input.intent === "create" ? undefined : employees.find(({ id }) => id === input.id);
    if (input.intent !== "create" && !existing) return { error: "Сотрудник уже удалён." };
    if (input.intent === "create" && employees.length >= maxEmployees) return { error: "Достигнут лимит сотрудников." };

    let nextEmployees = employees;
    let nextShifts = shifts;
    if (input.intent === "delete") {
      nextEmployees = employees.filter(({ id }) => id !== input.id);
      nextShifts = Object.fromEntries(Object.entries(shifts).filter(([key]) => !key.startsWith(`${input.id}/`)));
    } else {
      let avatar = input.intent === "edit" && input.removeAvatar ? null : existing?.avatar ?? null;
      if (input.avatar) {
        try {
          avatar = await encodeAvatar(input.avatar);
        } catch {
          return { error: "Не удалось открыть изображение. Выберите другой файл JPEG, PNG или WebP." };
        }
      }
      const person = { id: existing?.id ?? randomUUID(), name: input.name, role: input.role, avatar };
      nextEmployees = input.intent === "create" ? [...employees, person] : employees.map((item) => item.id === person.id ? person : item);
    }
    const { updated } = await persistSchedule(workspace, input.version, { employees: nextEmployees, shifts: nextShifts, templates }, false);
    if (!updated) return conflict;
    revalidatePath("/employees");
    revalidatePath("/");
    return { success: true };
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      console.warn("Employee database unavailable", getDatabaseErrorCode(error));
      return { error: "База данных недоступна. Попробуйте ещё раз." };
    }
    console.error("Employee mutation failed", getDatabaseErrorCode(error) ?? "unexpected error");
    return { error: "Не удалось сохранить изменения. Попробуйте ещё раз." };
  }
}
