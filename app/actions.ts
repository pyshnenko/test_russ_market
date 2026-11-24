"use server";

import { z } from "zod";
import { workspaceId } from "@/lib/access";
import { getDatabaseErrorCode, isDatabaseUnavailable } from "@/lib/database-errors";
import { persistSchedulePatch } from "@/lib/repository";
import { schedulePatchSchema } from "@/lib/schedule";

const inputSchema = z.object({
  version: z.number().int().min(0).max(2_000_000_000),
  data: schedulePatchSchema,
  edited: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
});

export type SaveResult = {
  error?: string;
  version?: number;
  savedEdit?: number;
  published?: boolean;
  publishedAt?: string | null;
};

export async function saveSchedule(previous: SaveResult, form: FormData): Promise<SaveResult> {
  const fail = (error: string): SaveResult => ({ ...previous, error });
  const raw = form.get("payload");
  if (typeof raw !== "string" || Buffer.byteLength(raw) > 500_000) return fail("Проверьте размер графика.");

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return fail("Данные графика повреждены.");
  }

  const parsed = inputSchema.safeParse(payload);
  if (!parsed.success) return fail("Проверьте смены и шаблоны.");

  const id = await workspaceId(true);
  if (!id) return fail("Сеанс завершён. Войдите снова.");

  const { version, data, edited } = parsed.data;
  const intent = z.enum(["save", "publish"]).safeParse(form.get("intent") ?? "save");
  if (!intent.success) return fail("Неизвестное действие.");
  const publish = intent.data === "publish";
  const conflict = "График изменён в другой вкладке. Обновите страницу перед повторным сохранением.";
  try {
    const result = await persistSchedulePatch(id, version, data, publish);
    if (result.status !== "saved") {
      return fail(result.status === "conflict" ? conflict : "Проверьте список сотрудников и назначенные смены.");
    }
    return { version: version + 1, savedEdit: edited, published: publish, publishedAt: result.publishedAt ?? previous.publishedAt };
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      console.warn("Schedule database unavailable", getDatabaseErrorCode(error));
      return fail("База данных недоступна. Изменения остались в редакторе. Попробуйте сохранить ещё раз.");
    }
    console.error("Failed to persist schedule", error);
    return fail("Не удалось сохранить график. Попробуйте ещё раз.");
  }
}
