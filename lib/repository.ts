import "server-only";
import { withScheduleDatabase, type Sql } from "./db/schedule-database";
import { defaultEmployees, parseShiftKey, schedulePageSize, shiftKey, workspaceSchema, type Employee, type SchedulePageData, type SchedulePeriod, type Shift, type ShiftPatch, type Snapshot, type Template, type Workspace } from "./schedule";
import { initialWorkspace } from "./seed";
import { applyShiftPatch, syncNormalizedRows, syncTemplates } from "./db/schedule-write";

type Metadata = { version: number; published_at: string | null };
type EmployeeRow = { id: string; name: string; job_title: string; avatar: string | null };
type ShiftFields = { name: string; start_time: string; end_time: string; color: Shift["color"] };
type ShiftRow = ShiftFields & { employee_id: string; date_key: string };
type TemplateRow = ShiftFields & { id: string };

const employeeColumns = "id, name, job_title, avatar";
const shiftColumns = "name, start_time, end_time, color";
const emptySchedule = (): Snapshot => ({ version: 0, data: initialWorkspace(), publishedAt: null });
const sqlDate = (sql: Sql) => sql.dialect === "postgres" ? "to_char(shift_date, 'YYYY-MM-DD')" : "CAST(shift_date AS CHAR(10))";
const periodFilter = " AND shift_date BETWEEN ? AND ?";

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

  // A legacy writer can advance the workspace version without updating the normalized tables.
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

async function loadShifts(sql: Sql, id: string, ids?: string[], period?: SchedulePeriod): Promise<Workspace["shifts"]> {
  if (ids?.length === 0) return {};
  const employees = ids ? ` AND employee_id IN (${ids.map(() => "?").join(", ")})` : "";
  const rows = await sql.rows<ShiftRow>(
    `SELECT employee_id, ${sqlDate(sql)} AS date_key, ${shiftColumns}
     FROM schedule_shifts WHERE workspace_id = ?${employees}${period ? periodFilter : ""}`,
    [id, ...(ids ?? []), ...(period ? [period.from, period.to] : [])],
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

type EmployeePageRequest = { query: string; page: number; pageSize: SchedulePageData["pagination"]["pageSize"] };
type PageRequest = EmployeePageRequest & { period: SchedulePeriod };

function seedEmployeePage({ query, page: requestedPage, pageSize }: EmployeePageRequest) {
  const words = searchWords(query);
  const employees = defaultEmployees.filter(({ name }) => words.every((word) => name.toLocaleLowerCase("ru").includes(word)));
  const total = employees.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, pageCount);
  return { employees: employees.slice((page - 1) * pageSize, page * pageSize), pagination: { page, pageCount, pageSize, total, query } };
}

async function readEmployees(sql: Sql, id: string, { query, page: requestedPage, pageSize }: EmployeePageRequest) {
  const words = searchWords(query);
  const filter = "workspace_id = ?" + " AND name_search LIKE ? ESCAPE '!'".repeat(words.length);
  const parameters = [id, ...words.map(likePattern)];
  const [count] = await sql.rows<{ total: number | string }>(
    `SELECT COUNT(*) AS total FROM schedule_employees WHERE ${filter}`, parameters,
  );
  const total = Number(count.total);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, pageCount);
  const employees = (await sql.rows<EmployeeRow>(
    `SELECT ${employeeColumns} FROM schedule_employees WHERE ${filter} ORDER BY sort_order LIMIT ? OFFSET ?`,
    [...parameters, pageSize, (page - 1) * pageSize],
  )).map(asEmployee);
  return { employees, pagination: { page, pageCount, pageSize, total, query } };
}

export async function readEmployeePage(id: string | null, page: number) {
  const request: EmployeePageRequest = { query: "", page, pageSize: schedulePageSize };
  const empty = () => ({ version: 0, ...seedEmployeePage(request) });
  if (!id) return empty();
  return readNormalized(id, empty, async (sql, row) => ({
    version: row.version,
    ...await readEmployees(sql, id, request),
  }));
}

function seedPage(request: PageRequest): SchedulePageData {
  const snapshot = emptySchedule();
  const { employees, pagination } = seedEmployeePage(request);
  return { ...snapshot, period: request.period, data: { ...snapshot.data, employees }, coverage: {}, pagination };
}

export async function readSchedulePage(id: string | null, request: PageRequest): Promise<SchedulePageData> {
  if (!id) return seedPage(request);
  return readNormalized(id, () => seedPage(request), async (sql, row) => {
    const { period } = request;
    const { employees, pagination } = await readEmployees(sql, id, request);
    const shifts = await loadShifts(sql, id, employees.map(({ id }) => id), period);
    const templates = await loadTemplates(sql, id);
    const coverageRows = await sql.rows<{ date_key: string; total: string | number }>(
      `SELECT ${sqlDate(sql)} AS date_key, COUNT(*) AS total
       FROM schedule_shifts WHERE workspace_id = ?${periodFilter} GROUP BY shift_date`,
      [id, period.from, period.to],
    );
    return {
      version: row.version,
      publishedAt: row.published_at,
      period,
      data: { employees, shifts, templates },
      coverage: Object.fromEntries(coverageRows.map(({ date_key, total }) => [date_key, Number(total)])),
      pagination,
    };
  });
}

async function lockWorkspace(sql: Sql, id: string) {
  const conflict = sql.dialect === "mysql" ? "ON DUPLICATE KEY UPDATE id = id" : "ON CONFLICT (id) DO NOTHING";
  await sql.run(`INSERT INTO schedule_workspaces (id, version, draft) VALUES (?, 0, ?) ${conflict}`, [id, JSON.stringify(initialWorkspace())]);
  return readWorkspace(sql, id, true);
}

export async function persistSchedule(id: string, version: number, data: Workspace, publish: boolean) {
  return withScheduleDatabase(async (sql) => {
    const row = await lockWorkspace(sql, id);
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

type SchedulePatchResult = { status: "conflict" | "invalid-employee" } | { status: "saved"; publishedAt: string | null };

async function patchEmployeesExist(sql: Sql, id: string, changes: ShiftPatch) {
  const employeeIds = new Set<string>();
  for (const key of Object.keys(changes)) {
    const cell = parseShiftKey(key);
    if (!cell) return false;
    employeeIds.add(cell.employeeId);
  }
  if (!employeeIds.size) return true;

  const placeholders = Array.from(employeeIds, () => "?").join(", ");
  const matches = await sql.rows<{ id: string }>(
    `SELECT id FROM schedule_employees WHERE workspace_id = ? AND id IN (${placeholders})`, [id, ...employeeIds],
  );
  return matches.length === employeeIds.size && matches.every(({ id: employeeId }) => employeeIds.has(employeeId));
}

async function updateCompatibleDraft(sql: Sql, id: string, version: number, changes: ShiftPatch, templates: Template[]) {
  // Older releases still read the text snapshot. Merge in SQL so saving does not load it into Node.
  if (sql.dialect === "postgres") {
    const entries = Object.entries(changes);
    const removals = entries.filter(([, shift]) => shift === null).map(([key]) => key);
    const upserts = Object.fromEntries(entries.filter(([, shift]) => shift !== null));
    await sql.run(
      `UPDATE schedule_workspaces SET version = ?, draft = jsonb_set(jsonb_set(draft::jsonb, '{shifts}',
         ((draft::jsonb -> 'shifts') - ARRAY(SELECT jsonb_array_elements_text(?::jsonb))) || ?::jsonb
       ), '{templates}', ?::jsonb)::text WHERE id = ?`,
      [version, JSON.stringify(removals), JSON.stringify(upserts), JSON.stringify(templates), id],
    );
    return;
  }

  const merge = sql.dialect === "mysql" ? "JSON_MERGE_PATCH" : "json_patch";
  await sql.run(`UPDATE schedule_workspaces SET version = ?, draft = ${merge}(draft, ?) WHERE id = ?`,
    [version, JSON.stringify({ shifts: changes, templates }), id]);
}

export async function persistSchedulePatch(
  id: string, version: number, { changes, templates }: { changes: ShiftPatch; templates: Template[] }, publish: boolean,
): Promise<SchedulePatchResult> {
  return withScheduleDatabase(async (sql) => {
    const row = await lockWorkspace(sql, id);
    if (!row || row.version !== version) return { status: "conflict" };

    await ensureNormalized(sql, id, version);
    if (!await patchEmployeesExist(sql, id, changes)) return { status: "invalid-employee" };
    await syncTemplates(sql, id, await loadTemplates(sql, id), templates);
    await applyShiftPatch(sql, id, changes);
    await updateCompatibleDraft(sql, id, version + 1, changes, templates);
    await sql.run("UPDATE schedule_normalized_versions SET source_version = ? WHERE workspace_id = ?", [version + 1, id]);

    const publishedAt = publish ? new Date().toISOString() : null;
    if (publishedAt) {
      await sql.run("UPDATE schedule_workspaces SET published = draft, published_at = ? WHERE id = ?", [publishedAt, id]);
    }
    return { status: "saved", publishedAt };
  });
}
