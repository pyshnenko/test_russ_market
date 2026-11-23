import "server-only";
import { withScheduleDatabase, type Sql, type Value } from "./db/schedule-database";
import { schedulePageSize, shiftKey, workspaceSchema, type Employee, type SchedulePageData, type Shift, type Snapshot, type Template, type Workspace } from "./schedule";
import { initialWorkspace } from "./seed";

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

async function insertRows(sql: Sql, statement: string, rows: Value[][]) {
  const width = rows[0]?.length;
  if (!width) return;
  const tuple = `(${Array.from({ length: width }, () => "?").join(", ")})`;
  for (let offset = 0; offset < rows.length; offset += 100) {
    const batch = rows.slice(offset, offset + 100);
    await sql.run(`${statement} VALUES ${batch.map(() => tuple).join(", ")}`, batch.flat());
  }
}

async function writeNormalized(sql: Sql, id: string, version: number, data: Workspace, replace: boolean) {
  if (replace) {
    await sql.run("DELETE FROM schedule_employees WHERE workspace_id = ?", [id]);
    await sql.run("DELETE FROM schedule_templates WHERE workspace_id = ?", [id]);
  }

  await insertRows(sql, "INSERT INTO schedule_employees (workspace_id, id, name, name_search, job_title, avatar, sort_order)",
    data.employees.map((item, order) => [id, item.id, item.name, item.name.toLocaleLowerCase("ru"), item.role, item.avatar, order]));
  await insertRows(sql, "INSERT INTO schedule_templates (workspace_id, id, name, start_time, end_time, color, sort_order)",
    data.templates.map((item, order) => [id, item.id, item.name, item.start, item.end, item.color, order]));
  await insertRows(sql, "INSERT INTO schedule_shifts (workspace_id, employee_id, shift_date, name, start_time, end_time, color)",
    Object.entries(data.shifts).map(([key, item]) => {
      const [employee, date] = key.split("/");
      return [id, employee, date, item.name, item.start, item.end, item.color];
    }));

  if (replace) {
    await sql.run("UPDATE schedule_normalized_versions SET source_version = ? WHERE workspace_id = ?", [version, id]);
  } else {
    await sql.run("INSERT INTO schedule_normalized_versions (workspace_id, source_version) VALUES (?, ?)", [id, version]);
  }
}

async function lockWorkspace(sql: Sql, id: string) {
  const lock = sql.dialect === "sqlite" ? "" : " FOR UPDATE";
  const [metadata] = await sql.rows<Metadata>(`SELECT version, published_at FROM schedule_workspaces WHERE id = ?${lock}`, [id]);
  return metadata;
}

async function ensureNormalized(sql: Sql, id: string, version: number) {
  const marker = await readMarker(sql, id);
  if (marker?.source_version === version) return;

  const [legacy] = await sql.rows<{ draft: string }>("SELECT draft FROM schedule_workspaces WHERE id = ?", [id]);
  await writeNormalized(sql, id, version, workspaceSchema.parse(JSON.parse(legacy.draft)), !!marker);
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
  return withScheduleDatabase(async (sql) => {
    const row = await lockWorkspace(sql, id);
    if (!row) return emptySchedule();
    await ensureNormalized(sql, id, row.version);

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
  return withScheduleDatabase(async (sql) => {
    const row = await lockWorkspace(sql, id);
    if (!row) return seedPage(request);
    await ensureNormalized(sql, id, row.version);

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
    const row = await lockWorkspace(sql, id);
    if (!row || row.version !== version) return { updated: false, publishedAt: null };

    await writeNormalized(sql, id, version + 1, data, !!(await readMarker(sql, id)));
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
