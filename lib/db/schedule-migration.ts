import type { Dialect } from "./schedule-database";

// Version 1. Existing installations keep schedule_workspaces for rollback compatibility.
export function scheduleMigration(dialect: Dialect) {
  const document = dialect === "mysql" ? "MEDIUMTEXT" : "TEXT";
  const searchColumn = dialect === "mysql" ? "VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin" : "VARCHAR(100)";
  return [
    `CREATE TABLE IF NOT EXISTS schedule_workspaces (
      id VARCHAR(36) PRIMARY KEY,
      version INT NOT NULL,
      draft ${document} NOT NULL,
      published ${document},
      published_at VARCHAR(32)
    )`,
    `CREATE TABLE IF NOT EXISTS schedule_normalized_versions (
      workspace_id VARCHAR(36) PRIMARY KEY,
      source_version INT NOT NULL,
      FOREIGN KEY (workspace_id) REFERENCES schedule_workspaces(id)
    )`,
    `CREATE TABLE IF NOT EXISTS schedule_employees (
      workspace_id VARCHAR(36) NOT NULL,
      id VARCHAR(36) NOT NULL,
      name VARCHAR(100) NOT NULL,
      name_search ${searchColumn} NOT NULL,
      job_title VARCHAR(80) NOT NULL,
      avatar ${document},
      sort_order INT NOT NULL,
      PRIMARY KEY (workspace_id, id),
      UNIQUE (workspace_id, sort_order),
      FOREIGN KEY (workspace_id) REFERENCES schedule_workspaces(id)
    )`,
    `CREATE TABLE IF NOT EXISTS schedule_templates (
      workspace_id VARCHAR(36) NOT NULL,
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
    )`,
    `CREATE TABLE IF NOT EXISTS schedule_shifts (
      workspace_id VARCHAR(36) NOT NULL,
      employee_id VARCHAR(36) NOT NULL,
      shift_date DATE NOT NULL,
      name VARCHAR(40) NOT NULL,
      start_time VARCHAR(5) NOT NULL,
      end_time VARCHAR(5) NOT NULL,
      color VARCHAR(8) NOT NULL,
      PRIMARY KEY (workspace_id, employee_id, shift_date),
      FOREIGN KEY (workspace_id, employee_id) REFERENCES schedule_employees(workspace_id, id) ON DELETE CASCADE,
      CHECK (start_time <> end_time)
      ${dialect === "mysql" ? ", INDEX schedule_shifts_coverage (workspace_id, shift_date)" : ""}
    )`,
    ...(dialect !== "mysql" ? ["CREATE INDEX IF NOT EXISTS schedule_shifts_coverage ON schedule_shifts (workspace_id, shift_date)"] : []),
  ];
}
