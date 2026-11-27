import { z } from "zod";
import { schedulePageResponseSchema, schedulePageSize, schedulePageSizes } from "@/lib/schedule";

const json = (schema: z.ZodType) => ({
  "application/json": { schema: z.toJSONSchema(schema, { target: "draft-2020-12" }) },
});
const errorContent = json(z.object({ error: z.string() }));

export function GET() {
  return Response.json({
    openapi: "3.1.0",
    info: {
      title: "График смен",
      version: "1.0.0",
      description: "Чтобы выполнить запрос на сервере с MySQL или PostgreSQL, сначала войдите через /login в этой же вкладке браузера или на этом домене.",
    },
    paths: {
      "/api/schedule/employees": {
        get: {
          summary: "Страница сотрудников и смен",
          description: "Размер страницы можно менять. Смены и покрытие ограничены запрошенным периодом. Покрытие учитывает всех сотрудников.",
          operationId: "listScheduleEmployees",
          security: [{ httpsSession: [] }, { localSession: [] }, {}],
          parameters: [
            { name: "query", in: "query", description: "Части ФИО в любом порядке", schema: { type: "string", maxLength: 100, default: "" } },
            { name: "page", in: "query", description: "Номер страницы, начиная с 1. Значения за пределами списка возвращают последнюю страницу.", schema: { type: "integer", minimum: 1, maximum: 5000, default: 1 } },
            { name: "pageSize", in: "query", description: "Количество сотрудников на странице.", schema: { type: "integer", enum: schedulePageSizes, default: schedulePageSize } },
            { name: "from", in: "query", description: "Начало периода включительно. Вместе с to задаёт период до 31 дня. Без обеих дат используется текущая неделя.", schema: { type: "string", format: "date" } },
            { name: "to", in: "query", description: "Конец периода включительно. Указывается вместе с from.", schema: { type: "string", format: "date" } },
          ],
          responses: {
            200: { description: "Страница графика", content: json(schedulePageResponseSchema) },
            400: { description: "Некорректный поиск, параметры страницы или период", content: errorContent },
            401: { description: "Нужна сессия входа", content: errorContent },
            500: { description: "Ошибка загрузки", content: errorContent },
            503: { description: "База временно недоступна", content: errorContent },
          },
        },
      },
    },
    components: {
      securitySchemes: {
        httpsSession: { type: "apiKey", in: "cookie", name: "__Secure-authjs.session-token" },
        localSession: { type: "apiKey", in: "cookie", name: "authjs.session-token" },
      },
    },
  });
}
