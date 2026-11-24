import type { Sql } from "./schedule-database";

async function mysqlKeyCollation(sql: Sql, table: string, column: string) {
  if (sql.dialect !== "mysql") return "";
  const [definition] = await sql.rows<{ charset_name: string | null; collation_name: string | null }>(
    `SELECT CHARACTER_SET_NAME AS charset_name, COLLATION_NAME AS collation_name
     FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column],
  );
  const identifier = /^[a-zA-Z0-9_]+$/;
  if (!definition?.charset_name || !definition.collation_name ||
      !identifier.test(definition.charset_name) || !identifier.test(definition.collation_name)) {
    throw new Error(`Cannot determine MySQL collation for ${table}.${column}`);
  }
  return ` CHARACTER SET ${definition.charset_name} COLLATE ${definition.collation_name}`;
}

// Version 1. Existing installations keep schedule_workspaces for rollback compatibility.
export async function initializeScheduleSchema(sql: Sql) {
  const { dialect } = sql;
  const document = dialect === "mysql" ? "MEDIUMTEXT" : "TEXT";
  const searchColumn = dialect === "mysql" ? "VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin" : "VARCHAR(100)";
  await sql.run(`CREATE TABLE IF NOT EXISTS schedule_workspaces (
      id VARCHAR(36) PRIMARY KEY,
      version INT NOT NULL,
      draft ${document} NOT NULL,
      published ${document},
      published_at VARCHAR(32)
    )`);
  // MySQL foreign keys must match the existing parent column even if the database default has changed.
  const workspaceKey = await mysqlKeyCollation(sql, "schedule_workspaces", "id");
  await sql.run(`CREATE TABLE IF NOT EXISTS schedule_normalized_versions (
      workspace_id VARCHAR(36)${workspaceKey} PRIMARY KEY,
      source_version INT NOT NULL,
      FOREIGN KEY (workspace_id) REFERENCES schedule_workspaces(id)
    )`);
  await sql.run(`CREATE TABLE IF NOT EXISTS schedule_employees (
      workspace_id VARCHAR(36)${workspaceKey} NOT NULL,
      id VARCHAR(36) NOT NULL,
      name VARCHAR(100) NOT NULL,
      name_search ${searchColumn} NOT NULL,
      job_title VARCHAR(80) NOT NULL,
      avatar ${document},
      sort_order INT NOT NULL,
      PRIMARY KEY (workspace_id, id),
      UNIQUE (workspace_id, sort_order),
      FOREIGN KEY (workspace_id) REFERENCES schedule_workspaces(id)
    )`);
  await sql.run(`CREATE TABLE IF NOT EXISTS schedule_templates (
      workspace_id VARCHAR(36)${workspaceKey} NOT NULL,
      id VARCHAR(36) NOT NULL,
      name VARCHAR(40) NOT NULL,
      start_time VARCHAR(5) NOT NULL,
      end_time VARCHAR(5) NOT NULL,
      color VARCHAR(8) NOT NULL,
      sort_order INT NOT NULL,
      PRIMARY KEY (workspace_id, id),
      UNIQUE (workspace_id, sort_order),
      FOREIGN KEY (workspace_id) REFERENCES schedule_workspaces(id),
      CHECK (start_time <> end_time)
    )`);
  const shiftWorkspaceKey = await mysqlKeyCollation(sql, "schedule_employees", "workspace_id");
  const shiftEmployeeKey = await mysqlKeyCollation(sql, "schedule_employees", "id");
  await sql.run(`CREATE TABLE IF NOT EXISTS schedule_shifts (
      workspace_id VARCHAR(36)${shiftWorkspaceKey} NOT NULL,
      employee_id VARCHAR(36)${shiftEmployeeKey} NOT NULL,
      shift_date DATE NOT NULL,
      name VARCHAR(40) NOT NULL,
      start_time VARCHAR(5) NOT NULL,
      end_time VARCHAR(5) NOT NULL,
      color VARCHAR(8) NOT NULL,
      PRIMARY KEY (workspace_id, employee_id, shift_date),
      FOREIGN KEY (workspace_id, employee_id) REFERENCES schedule_employees(workspace_id, id) ON DELETE CASCADE,
      CHECK (start_time <> end_time)
      ${dialect === "mysql" ? ", INDEX schedule_shifts_coverage (workspace_id, shift_date)" : ""}
    )`);
  if (dialect !== "mysql") {
    await sql.run("CREATE INDEX IF NOT EXISTS schedule_shifts_coverage ON schedule_shifts (workspace_id, shift_date)");
  }
}
