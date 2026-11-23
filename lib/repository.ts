import "server-only";
import { withScheduleDatabase, type Sql } from "./db/schedule-database";
import { schedulePageSize, shiftKey, workspaceSchema, type Employee, type SchedulePageData, type Shift, type Snapshot, type Template, type Workspace } from "./schedule";
import { initialWorkspace } from "./seed";
import { syncNormalizedRows } from "./db/schedule-write";

type Metadata = { version: number; published_at: string | null };
type EmployeeRow = { id: string; name: string; job_title: string; avatar: string | null };
type ShiftFields = { name: string; start_time: string; end_time: string; color: Shift["color"] };
type ShiftRow = ShiftFields & { employee_id: string; date_key: string };
type TemplateRow = ShiftFields & { id: string };

const employeeColumns = "id, name, job_title, avatar";
const shiftColumns = "name, start_time, end_time, color";
const emptySchedule = (): Snapshot => ({ version: 0, data: initialWorkspace(), publishedAt: null });
const sqlDate = (sql: Sql) => sql.dialect === "postgres" ? "to_char(shift_date, 'YYYY-MM-DD')" : "CAST(shift_date AS CHAR(10))";

function asEmployee(row: EmployeeRow): Employee {
  return { id: row.id, name: row.name, role: row.job_title, avatar: row.avatar };
}

function asShift(row: ShiftFields): Shift {
  return { name: row.name, start: row.start_time, end: row.end_time, color: row.color };
}

function searchWords(query: string) {
  return query.toLocaleLowerCase("ru").split(/\s+/).filter(Boolean);
}

function likePattern(word: string) {
  return `%${word.replace(/[!%_]/g, (character) => `!${character}`)}%`;
}

async function writeNormalized(sql: Sql, id: string, version: number, data: Workspace, previousVersion?: number, previous?: Workspace) {
  if (previousVersion !== undefined && !previous) {
    await sql.run("DELETE FROM schedule_employees WHERE workspace_id = ?", [id]);
    await sql.run("DELETE FROM schedule_templates WHERE workspace_id = ?", [id]);
  }

  await syncNormalizedRows(sql, id, data, previous);
  if (previousVersion !== undefined) {
    await sql.run("UPDATE schedule_normalized_versions SET source_version = ? WHERE workspace_id = ?", [version, id]);
  } else {
    await sql.run("INSERT INTO schedule_normalized_versions (workspace_id, source_version) VALUES (?, ?)", [id, version]);
  }
}

async function readWorkspace(sql: Sql, id: string, forUpdate = false) {
  const lock = forUpdate && sql.dialect !== "sqlite" ? " FOR UPDATE" : "";
  const [metadata] = await sql.rows<Metadata>(`SELECT version, published_at FROM schedule_workspaces WHERE id = ?${lock}`, [id]);
  return metadata;
}

async function readNormalized<T>(id: string, empty: () => T, read: (sql: Sql, row: Metadata) => Promise<T>) {
  const result = await withScheduleDatabase(async (sql) => {
    const row = await readWorkspace(sql, id);
    if (!row) return { data: empty() };
    const marker = await readMarker(sql, id);
    return marker?.source_version === row.version ? { data: await read(sql, row) } : null;
  }, "read");
  if (result) return result.data;

  // The read transaction must end before attempting to import a legacy draft.
  return withScheduleDatabase(async (sql) => {
    const row = await readWorkspace(sql, id, true);
    if (!row) return empty();
    await ensureNormalized(sql, id, row.version);
    return read(sql, row);
  });
}

async function ensureNormalized(sql: Sql, id: string, version: number) {
  const marker = await readMarker(sql, id);
  if (marker?.source_version === version) return;

  await writeNormalized(sql, id, version, await readLegacyDraft(sql, id), marker?.source_version);
}

async function readLegacyDraft(sql: Sql, id: string) {
  const [legacy] = await sql.rows<{ draft: string }>("SELECT draft FROM schedule_workspaces WHERE id = ?", [id]);
  return workspaceSchema.parse(JSON.parse(legacy.draft));
}

async function readMarker(sql: Sql, id: string) {
  const [marker] = await sql.rows<{ source_version: number }>(
    "SELECT source_version FROM schedule_normalized_versions WHERE workspace_id = ?", [id],
  );
  return marker;
}

async function loadTemplates(sql: Sql, id: string): Promise<Template[]> {
  const rows = await sql.rows<TemplateRow>(
    `SELECT id, ${shiftColumns} FROM schedule_templates WHERE workspace_id = ? ORDER BY sort_order`, [id],
  );
  return rows.map((row) => ({ ...asShift(row), id: row.id }));
}

async function loadShifts(sql: Sql, id: string, ids?: string[]): Promise<Workspace["shifts"]> {
  if (ids?.length === 0) return {};
  const employees = ids ? ` AND employee_id IN (${ids.map(() => "?").join(", ")})` : "";
  const rows = await sql.rows<ShiftRow>(
    `SELECT employee_id, ${sqlDate(sql)} AS date_key, ${shiftColumns}
     FROM schedule_shifts WHERE workspace_id = ?${employees}`, [id, ...(ids ?? [])],
  );
  return Object.fromEntries(rows.map((row) => [shiftKey(row.employee_id, row.date_key), asShift(row)]));
}

export async function loadSchedule(id: string | null): Promise<Snapshot> {
  if (!id) return emptySchedule();
  return readNormalized(id, emptySchedule, async (sql, row) => {
    const employees = await sql.rows<EmployeeRow>(
      `SELECT ${employeeColumns} FROM schedule_employees WHERE workspace_id = ? ORDER BY sort_order`, [id],
    );
    const templates = await loadTemplates(sql, id);
    const shifts = await loadShifts(sql, id);
    return { version: row.version, publishedAt: row.published_at, data: { employees: employees.map(asEmployee), shifts, templates } };
  });
}

type PageRequest = { query: string; page: number };

function seedPage({ query }: PageRequest): SchedulePageData {
  const snapshot = emptySchedule();
  const words = searchWords(query);
  const employees = snapshot.data.employees.filter(({ name }) => words.every((word) => name.toLocaleLowerCase("ru").includes(word)));
  return { ...snapshot, data: { ...snapshot.data, employees }, coverage: {}, pagination: { page: 1, pageCount: 1, total: employees.length, query } };
}

export async function readSchedulePage(id: string | null, request: PageRequest): Promise<SchedulePageData> {
  if (!id) return seedPage(request);
  return readNormalized(id, () => seedPage(request), async (sql, row) => {
    const words = searchWords(request.query);
    const filter = "workspace_id = ?" + " AND name_search LIKE ? ESCAPE '!'".repeat(words.length);
    const parameters = [id, ...words.map(likePattern)];
    const [count] = await sql.rows<{ total: number | string }>(
      `SELECT COUNT(*) AS total FROM schedule_employees WHERE ${filter}`, parameters,
    );
    const total = Number(count.total);
    const pageCount = Math.max(1, Math.ceil(total / schedulePageSize));
    const page = Math.min(request.page, pageCount);
    const employees = (await sql.rows<EmployeeRow>(
      `SELECT ${employeeColumns} FROM schedule_employees WHERE ${filter} ORDER BY sort_order LIMIT ? OFFSET ?`,
      [...parameters, schedulePageSize, (page - 1) * schedulePageSize],
    )).map(asEmployee);
    const shifts = await loadShifts(sql, id, employees.map(({ id }) => id));
    const templates = await loadTemplates(sql, id);
    const coverageRows = await sql.rows<{ date_key: string; total: string | number }>(
      `SELECT ${sqlDate(sql)} AS date_key, COUNT(*) AS total FROM schedule_shifts WHERE workspace_id = ? GROUP BY shift_date`,
      [id],
    );
    return {
      version: row.version,
      publishedAt: row.published_at,
      data: { employees, shifts, templates },
      coverage: Object.fromEntries(coverageRows.map(({ date_key, total }) => [date_key, Number(total)])),
      pagination: { page, pageCount, total, query: request.query },
    };
  });
}

export async function persistSchedule(id: string, version: number, data: Workspace, publish: boolean) {
  return withScheduleDatabase(async (sql) => {
    const conflict = sql.dialect === "mysql" ? "ON DUPLICATE KEY UPDATE id = id" : "ON CONFLICT (id) DO NOTHING";
    await sql.run(`INSERT INTO schedule_workspaces (id, version, draft) VALUES (?, 0, ?) ${conflict}`, [id, JSON.stringify(initialWorkspace())]);
    const row = await readWorkspace(sql, id, true);
    if (!row || row.version !== version) return { updated: false, publishedAt: null };

    const marker = await readMarker(sql, id);
    const previous = marker?.source_version === version ? await readLegacyDraft(sql, id) : undefined;
    await writeNormalized(sql, id, version + 1, data, marker?.source_version, previous);
    const document = JSON.stringify(data);
    const publishedAt = publish ? new Date().toISOString() : null;
    // Keep the legacy draft current so an older release can still read it after rollback.
    await sql.run(
      `UPDATE schedule_workspaces SET version = ?, draft = ?, published = COALESCE(?, published),
       published_at = COALESCE(?, published_at) WHERE id = ?`,
      [version + 1, document, publish ? document : null, publishedAt, id],
    );
    return { updated: true, publishedAt };
  });
}
