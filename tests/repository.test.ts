import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { createConnection, type RowDataPacket } from "mysql2/promise";
import { closeScheduleDatabase, withScheduleDatabase } from "../lib/db/schedule-database";
import { loadSchedule, persistSchedule, persistSchedulePatch, readEmployeePage } from "../lib/repository";
import { schedulePageResponseSchema, shiftKey, type Shift } from "../lib/schedule";
import { loadSchedulePage, schedulePageSchema } from "../lib/schedule-page";

const testUrl = process.env.SCHEDULE_TEST_DATABASE_URL;
const mysqlTest = testUrl?.startsWith("mysql:");
if (testUrl) process.env.DATABASE_URL = testUrl;
else delete process.env.DATABASE_URL;
process.env.SCHEDULE_SQLITE_PATH = ":memory:";
after(closeScheduleDatabase);

before(async () => {
  if (!mysqlTest || !testUrl) return;
  const connection = await createConnection(testUrl);
  try {
    const [rows] = await connection.query<RowDataPacket[]>(
      "SELECT DEFAULT_COLLATION_NAME AS db_collation FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = DATABASE()",
    );
    const legacyCollation = rows[0].db_collation === "utf8mb4_bin" ? "utf8mb4_unicode_ci" : "utf8mb4_bin";
    await connection.query(`CREATE TABLE IF NOT EXISTS schedule_workspaces (
      id VARCHAR(36) CHARACTER SET utf8mb4 COLLATE ${legacyCollation} PRIMARY KEY,
      version INT NOT NULL,
      draft MEDIUMTEXT NOT NULL,
      published MEDIUMTEXT,
      published_at VARCHAR(32)
    )`);
  } finally {
    await connection.end();
  }
});

const morning: Shift = { name: "Утро", start: "07:00", end: "15:00", color: "blue" };
const date = "2026-11-23";
const period = { from: date, to: "2026-11-29" };

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
  const before = shiftKey(employees[0].id, "2026-11-22");
  const lastDay = shiftKey(employees[0].id, period.to);
  const after = shiftKey(employees[0].id, "2026-11-30");
  const data = {
    ...initial.data, employees,
    shifts: { [firstShift]: morning, [lastShift]: morning, [lastDay]: morning, [before]: morning, [after]: morning },
  };
  assert.equal((await persistSchedule(workspace, 0, data, false)).updated, true);

  const first = await loadSchedulePage(workspace, { query: "", page: 1, period });
  assert.equal(first.data.employees.length, 25);
  assert.deepEqual(first.pagination, { page: 1, pageCount: 48, total: 1200, query: "" });
  assert.deepEqual(first.period, period);
  assert.deepEqual(first.data.shifts, { [firstShift]: morning, [lastDay]: morning });
  assert.deepEqual(first.coverage, { [date]: 2, [period.to]: 1 });

  const last = await loadSchedulePage(workspace, { query: "", page: 49, period });
  assert.equal(last.pagination.page, 48);
  assert.deepEqual(last.data.shifts, { [lastShift]: morning });

  const filtered = await loadSchedulePage(workspace, { query: "1200 СОТРУДНИК", page: 1, period });
  assert.equal(schedulePageResponseSchema.safeParse(filtered).success, true);
  assert.deepEqual(filtered.data.employees, [employees[1199]]);
  assert.deepEqual(filtered.data.shifts, { [lastShift]: morning });
  assert.equal(filtered.coverage[date], 2);
  assert.equal(schedulePageSchema.safeParse({ page: "0" }).success, false);
  assert.equal((await loadSchedulePage(workspace, { query: "%_", page: 1, period })).pagination.total, 0);
  assert.deepEqual(await readEmployeePage(workspace, 49), {
    version: 1, employees: employees.slice(-25), pagination: last.pagination,
  });
  assert.deepEqual((await loadSchedule(workspace)).data.shifts, data.shifts);
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

  const migrated = await loadSchedulePage(id, { query: "", page: 1, period });
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
  const replayed = await loadSchedulePage(id, { query: "", page: 1, period });
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

test("applies a shift patch and keeps the draft and publication readable by older releases", async () => {
  const id = randomUUID();
  const { data: seed } = await loadSchedule(null);
  const changed = shiftKey("1", date);
  const removed = shiftKey("2", date);
  const added = shiftKey("3", date);
  const untouched = shiftKey("1", "2020-01-01");
  const revised = { ...morning, end: "16:00", color: "#d44356" };
  const startingShifts = { [changed]: morning, [removed]: morning, [untouched]: morning };
  assert.deepEqual(await persistSchedulePatch(id, 0, { changes: startingShifts, templates: seed.templates }, false), {
    status: "saved", publishedAt: null,
  });

  const templates = [...seed.templates].reverse().map((template) => ({ ...template, color: revised.color }));
  const patch = { changes: { [changed]: revised, [removed]: null, [added]: morning }, templates };
  const publication = await persistSchedulePatch(id, 1, patch, true);
  assert.equal(publication.status, "saved");
  if (publication.status !== "saved") throw new Error("Expected to publish the schedule");
  assert.ok(publication.publishedAt);

  const expected = { ...seed, shifts: { [changed]: revised, [added]: morning, [untouched]: morning }, templates };
  assert.deepEqual(await loadSchedule(id), { version: 2, data: expected, publishedAt: publication.publishedAt });
  assert.deepEqual(await persistSchedulePatch(id, 1, patch, false), { status: "conflict" });
  for (const shift of [morning, null]) {
    assert.deepEqual(await persistSchedulePatch(id, 2, {
      changes: { [shiftKey(randomUUID(), date)]: shift, [changed]: null }, templates: [],
    }, false), { status: "invalid-employee" });
  }
  assert.deepEqual(await loadSchedule(id), { version: 2, data: expected, publishedAt: publication.publishedAt });

  await persistSchedulePatch(id, 2, { changes: { [added]: null }, templates }, false);
  await withScheduleDatabase(async (sql) => {
    const [row] = await sql.rows<{ draft: string; published: string }>(
      "SELECT draft, published FROM schedule_workspaces WHERE id = ?", [id],
    );
    assert.deepEqual(JSON.parse(row.draft), { ...expected, shifts: { [changed]: revised, [untouched]: morning } });
    assert.deepEqual(JSON.parse(row.published), expected);
  });
});

test("MySQL uses the existing workspace key collation for foreign keys", { skip: !mysqlTest }, async () => {
  await withScheduleDatabase(async (sql) => {
    const columns = await sql.rows<{ table_name: string; collation_name: string }>(
      `SELECT TABLE_NAME AS table_name, COLLATION_NAME AS collation_name
       FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()
       AND ((TABLE_NAME = 'schedule_workspaces' AND COLUMN_NAME = 'id') OR
       (TABLE_NAME IN ('schedule_employees', 'schedule_templates', 'schedule_shifts', 'schedule_normalized_versions')
       AND COLUMN_NAME = 'workspace_id'))`,
    );
    assert.equal(columns.length, 5);
    assert.equal(new Set(columns.map(({ collation_name }) => collation_name)).size, 1);
  });
});

test("a page reads the previous committed version while another transaction is writing", { skip: !testUrl }, async () => {
  const id = randomUUID();
  const initial = await loadSchedule(id);
  await persistSchedule(id, 0, initial.data, false);

  let releaseWrite = () => {};
  let signalLocked = () => {};
  const mayCommit = new Promise<void>((resolve) => { releaseWrite = resolve; });
  const locked = new Promise<void>((resolve) => { signalLocked = resolve; });
  const writer = withScheduleDatabase(async (sql) => {
    await sql.run("UPDATE schedule_workspaces SET version = ? WHERE id = ?", [2, id]);
    signalLocked();
    await mayCommit;
  });

  try {
    await Promise.race([locked, writer]);
    const read = loadSchedulePage(id, { query: "", page: 1, period });
    const timedOut = Symbol("read was blocked");
    const page = await Promise.race([read, delay(2500, timedOut, { ref: false })]);
    assert.notEqual(page, timedOut);
    if (typeof page !== "symbol") assert.equal(page.version, 1);
  } finally {
    releaseWrite();
    await writer;
  }
});

test("saving an edited shift only updates that normalized row", { skip: !!testUrl }, async () => {
  const id = randomUUID();
  const initial = await loadSchedule(id);
  const key = shiftKey("1", date);
  const saved = { ...initial.data, shifts: { [key]: morning, [shiftKey("2", date)]: morning } };
  await persistSchedule(id, 0, saved, false);
  await withScheduleDatabase(async (sql) => {
    await sql.run("CREATE TEMP TABLE write_audit (operation TEXT NOT NULL)");
    for (const table of ["schedule_employees", "schedule_templates", "schedule_shifts"]) {
      for (const event of ["INSERT", "UPDATE", "DELETE"]) {
        const name = `${table}_${event}`;
        await sql.run(`CREATE TEMP TRIGGER ${name} AFTER ${event} ON ${table}
          BEGIN INSERT INTO write_audit VALUES ('${name}'); END`);
      }
    }
  });

  const edited = { ...saved, shifts: { ...saved.shifts, [key]: { ...morning, end: "16:00" } } };
  assert.equal((await persistSchedulePatch(id, 1, { changes: { [key]: edited.shifts[key] }, templates: saved.templates }, false)).status, "saved");
  await withScheduleDatabase(async (sql) => {
    assert.deepEqual((await sql.rows<{ operation: string }>("SELECT operation FROM write_audit")).map(({ operation }) => operation), [
      "schedule_shifts_UPDATE",
    ]);
  });
  assert.deepEqual((await loadSchedule(id)).data, edited);
});

test("can reorder employees and templates while retaining their assigned shifts", async () => {
  const id = randomUUID();
  const initial = await loadSchedule(id);
  const saved = { ...initial.data, shifts: { [shiftKey("1", date)]: morning } };
  await persistSchedule(id, 0, saved, false);
  const reordered = { ...saved, employees: [...saved.employees].reverse(), templates: [...saved.templates].reverse() };
  assert.equal((await persistSchedule(id, 1, reordered, false)).updated, true);
  assert.deepEqual((await loadSchedule(id)).data, reordered);
});
