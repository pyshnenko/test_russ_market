import { isDemo, workspaceId } from "@/lib/access";
import { getDatabaseErrorCode, isDatabaseUnavailable } from "@/lib/database-errors";
import { loadSchedulePage, schedulePageSchema } from "@/lib/schedule-page";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const from = params.get("from");
  const to = params.get("to");
  const input = schedulePageSchema.safeParse({
    query: params.get("query") ?? undefined,
    page: params.get("page") ?? undefined,
    period: from !== null || to !== null ? { from, to } : undefined,
  });
  if (!input.success) return Response.json({ error: "Проверьте параметры поиска и период графика." }, { status: 400 });

  const id = await workspaceId();
  if (!id && !isDemo()) return Response.json({ error: "Сеанс завершён. Войдите снова." }, { status: 401 });
  try {
    const page = await loadSchedulePage(id, input.data);
    return Response.json(page, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const unavailable = isDatabaseUnavailable(error);
    console.warn("Schedule roster read failed", getDatabaseErrorCode(error));
    return Response.json({ error: unavailable ? "База данных недоступна. Попробуйте ещё раз." : "Не удалось загрузить сотрудников." }, { status: unavailable ? 503 : 500 });
  }
}
