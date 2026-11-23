import { z } from "zod";
import { schedulePageResponseSchema } from "@/lib/schedule";

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
          description: "До 25 сотрудников на странице. Смены относятся к сотрудникам этой страницы, покрытие относится ко всему графику.",
          operationId: "listScheduleEmployees",
          security: [{ httpsSession: [] }, { localSession: [] }, {}],
          parameters: [
            { name: "query", in: "query", description: "Части ФИО в любом порядке", schema: { type: "string", maxLength: 100, default: "" } },
            { name: "page", in: "query", description: "Номер страницы, начиная с 1. Значения за пределами списка возвращают последнюю страницу.", schema: { type: "integer", minimum: 1, maximum: 5000, default: 1 } },
          ],
          responses: {
            200: { description: "Страница графика", content: json(schedulePageResponseSchema) },
            400: { description: "Некорректный поиск или номер страницы", content: errorContent },
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
