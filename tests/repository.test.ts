import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { closeScheduleDatabase, withScheduleDatabase } from "../lib/db/schedule-database";
import { loadSchedule, persistSchedule } from "../lib/repository";
import { schedulePageResponseSchema, shiftKey, type Shift } from "../lib/schedule";
import { loadSchedulePage, schedulePageSchema } from "../lib/schedule-page";

if (process.env.SCHEDULE_TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.SCHEDULE_TEST_DATABASE_URL;
else delete process.env.DATABASE_URL;
process.env.SCHEDULE_SQLITE_PATH = ":memory:";
after(closeScheduleDatabase);

const morning: Shift = { name: "Утро", start: "07:00", end: "15:00", color: "blue" };
const date = "2026-11-23";

test("saves a draft, publishes it, and rejects a stale workspace version", async () => {
  const workspace = randomUUID();
  const initial = await loadSchedule(workspace);
  const data = { ...initial.data, shifts: { [shiftKey("1", date)]: morning } };

  assert.deepEqual(await persistSchedule(workspace, 0, data, false), { updated: true, publishedAt: null });
  assert.deepEqual(await loadSchedule(workspace), { version: 1, data, publishedAt: null });

  const publication = await persistSchedule(workspace, 1, data, true);
  assert.equal(publication.updated, true);
  assert.ok(publication.publishedAt);
  assert.equal((await persistSchedule(workspace, 1, initial.data, false)).updated, false);
  assert.equal((await persistSchedule(workspace, 2, initial.data, false)).updated, true);
  assert.deepEqual(await loadSchedule(workspace), { version: 3, data: initial.data, publishedAt: publication.publishedAt });
  assert.equal((await loadSchedule(randomUUID())).version, 0);
});

test("filters and paginates a large roster and counts coverage across pages", async () => {
  const workspace = randomUUID();
  const initial = await loadSchedule(workspace);
  const employees = Array.from({ length: 1200 }, (_, index) => ({
    id: randomUUID(),
    name: `Сотрудник ${String(index + 1).padStart(4, "0")}`,
    role: "агент",
    avatar: null,
  }));
  const firstShift = shiftKey(employees[0].id, date);
  const lastShift = shiftKey(employees[1199].id, date);
  const data = { ...initial.data, employees, shifts: { [firstShift]: morning, [lastShift]: morning } };
  assert.equal((await persistSchedule(workspace, 0, data, false)).updated, true);

  const first = await loadSchedulePage(workspace, { query: "", page: 1 });
  assert.equal(first.data.employees.length, 25);
  assert.deepEqual(first.pagination, { page: 1, pageCount: 48, total: 1200, query: "" });
  assert.deepEqual(first.data.shifts, { [firstShift]: morning });
  assert.equal(first.coverage[date], 2);

  const last = await loadSchedulePage(workspace, { query: "", page: 49 });
  assert.equal(last.pagination.page, 48);
  assert.deepEqual(last.data.shifts, { [lastShift]: morning });

  const filtered = await loadSchedulePage(workspace, { query: "1200 СОТРУДНИК", page: 1 });
  assert.equal(schedulePageResponseSchema.safeParse(filtered).success, true);
  assert.deepEqual(filtered.data.employees, [employees[1199]]);
  assert.deepEqual(filtered.data.shifts, { [lastShift]: morning });
  assert.equal(filtered.coverage[date], 2);
  assert.equal(schedulePageSchema.safeParse({ page: "0" }).success, false);
  assert.equal((await loadSchedulePage(workspace, { query: "%_", page: 1 })).pagination.total, 0);
});

test("migrates legacy data on read and keeps older releases compatible", async () => {
  const id = randomUUID();
  const initial = await loadSchedule(null);
  const key = shiftKey("1", date);
  const oldDraft = { templates: initial.data.templates, shifts: { [key]: morning } };
  const publishedAt = "2026-11-23T12:00:00.000Z";
  await withScheduleDatabase(async (sql) => {
    await sql.run(
      "INSERT INTO schedule_workspaces (id, version, draft, published, published_at) VALUES (?, ?, ?, ?, ?)",
      [id, 4, JSON.stringify(oldDraft), JSON.stringify(oldDraft), publishedAt],
    );
  });

  const migrated = await loadSchedulePage(id, { query: "", page: 1 });
  assert.equal(migrated.version, 4);
  assert.equal(migrated.publishedAt, publishedAt);
  assert.equal(migrated.data.employees.length, 8);
  assert.deepEqual(migrated.data.shifts, oldDraft.shifts);
  assert.equal(migrated.coverage[date], 1);

  const edited = { ...migrated.data, shifts: {} };
  assert.equal((await persistSchedule(id, 4, edited, false)).updated, true);
  await withScheduleDatabase(async (sql) => {
    const [row] = await sql.rows<{ draft: string; published: string }>(
      "SELECT draft, published FROM schedule_workspaces WHERE id = ?", [id],
    );
    assert.deepEqual(JSON.parse(row.draft), edited);
    assert.deepEqual(JSON.parse(row.published), oldDraft);
    await sql.run("UPDATE schedule_workspaces SET version = ?, draft = ? WHERE id = ?", [6, JSON.stringify(oldDraft), id]);
  });
  const replayed = await loadSchedulePage(id, { query: "", page: 1 });
  assert.equal(replayed.version, 6);
  assert.deepEqual(replayed.data.shifts, oldDraft.shifts);
});

test("rolls back changes when an employee reference is invalid", async () => {
  const id = randomUUID();
  const initial = await loadSchedule(id);
  const saved = { ...initial.data, shifts: { [shiftKey("1", date)]: morning } };
  await persistSchedule(id, 0, saved, false);

  const invalid = { ...saved, shifts: { [shiftKey(randomUUID(), date)]: morning } };
  await assert.rejects(() => persistSchedule(id, 1, invalid, false));
  assert.deepEqual(await loadSchedule(id), { version: 1, data: saved, publishedAt: null });
});
