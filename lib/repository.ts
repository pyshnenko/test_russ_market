import "server-only";
import { mkdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { createPool, type ResultSetHeader, type RowDataPacket } from "mysql2/promise";
import { Pool } from "pg";
import { workspaceSchema, type Snapshot, type Workspace } from "./schedule";
import { initialWorkspace } from "./seed";

type Row = {
  version: number;
  draft: string;
  published_at: string | null;
};

const createTable = (documentType: "TEXT" | "MEDIUMTEXT") => `
  CREATE TABLE IF NOT EXISTS schedule_workspaces (
    id VARCHAR(36) PRIMARY KEY,
    version INT NOT NULL,
    draft ${documentType} NOT NULL,
    published ${documentType},
    published_at VARCHAR(32)
  )
`;

const select = "SELECT version, draft, published_at FROM schedule_workspaces WHERE id = ?";
const update = `
  UPDATE schedule_workspaces
  SET version = version + 1, draft = ?,
      published = COALESCE(?, published), published_at = COALESCE(?, published_at)
  WHERE id = ? AND version = ?
`;
const postgresSelect = "SELECT version, draft, published_at FROM schedule_workspaces WHERE id = $1";
const postgresUpdate = `
  UPDATE schedule_workspaces
  SET version = version + 1, draft = $1,
      published = COALESCE($2, published), published_at = COALESCE($3, published_at)
  WHERE id = $4 AND version = $5
`;

let sqlite: DatabaseSync | undefined;
let mysql: ReturnType<typeof createPool> | undefined;
let mysqlReady: Promise<unknown> | undefined;
let postgres: Pool | undefined;
let postgresReady: Promise<unknown> | undefined;

function databaseKind(url: string) {
  if (!URL.canParse(url)) throw new Error("DATABASE_URL must be a valid connection URI");
  const protocol = new URL(url).protocol;
  if (protocol === "mysql:") return "mysql";
  if (protocol === "postgres:" || protocol === "postgresql:") return "postgres";
  throw new Error("DATABASE_URL must use mysql://, postgres:// or postgresql://");
}

function demoDatabase() {
  if (!sqlite) {
    mkdirSync(".data", { recursive: true });
    sqlite = new DatabaseSync(".data/schedule.sqlite");
    sqlite.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 3000");
    sqlite.exec(createTable("TEXT"));
  }
  return sqlite;
}

async function mysqlDatabase(url: string) {
  mysql ??= createPool({ uri: url, connectTimeout: 5000 });
  mysqlReady ??= mysql.query(createTable("MEDIUMTEXT")).catch((error: unknown) => {
    mysqlReady = undefined;
    throw error;
  });
  await mysqlReady;
  return mysql;
}

async function postgresDatabase(url: string) {
  if (!postgres) {
    postgres = new Pool({ connectionString: url, connectionTimeoutMillis: 5000 });
    postgres.on("error", (error) => console.error("Idle PostgreSQL connection failed", error.name));
  }
  postgresReady ??= postgres.query(createTable("TEXT")).catch((error: unknown) => {
    postgresReady = undefined;
    throw error;
  });
  await postgresReady;
  return postgres;
}

export async function loadSchedule(id: string | null): Promise<Snapshot> {
  const empty = { version: 0, data: initialWorkspace(), publishedAt: null };
  if (!id) return empty;
  let row: Row | undefined;
  const url = process.env.DATABASE_URL;
  if (!url) {
    row = demoDatabase().prepare(select).get(id) as Row | undefined;
  } else if (databaseKind(url) === "mysql") {
    const db = await mysqlDatabase(url);
    const [rows] = await db.execute<(Row & RowDataPacket)[]>(select, [id]);
    row = rows[0];
  } else {
    const db = await postgresDatabase(url);
    const result = await db.query<Row>(postgresSelect, [id]);
    row = result.rows[0];
  }
  return row
    ? { version: row.version, data: workspaceSchema.parse(JSON.parse(row.draft)), publishedAt: row.published_at }
    : empty;
}

export async function persistSchedule(id: string, version: number, data: Workspace, publish: boolean) {
  const draft = JSON.stringify(data);
  const publishedAt = publish ? new Date().toISOString() : null;
  const values = [draft, publish ? draft : null, publishedAt, id, version] as const;
  const url = process.env.DATABASE_URL;
  const initialDraft = JSON.stringify(initialWorkspace());
  let updated: boolean;

  if (!url) {
    const db = demoDatabase();
    db.prepare("INSERT OR IGNORE INTO schedule_workspaces (id, version, draft) VALUES (?, 0, ?)")
      .run(id, initialDraft);
    updated = db.prepare(update).run(...values).changes === 1;
  } else if (databaseKind(url) === "mysql") {
    const db = await mysqlDatabase(url);
    await db.execute(
      "INSERT INTO schedule_workspaces (id, version, draft) VALUES (?, 0, ?) ON DUPLICATE KEY UPDATE id = id",
      [id, initialDraft],
    );
    const [result] = await db.execute<ResultSetHeader>(update, [...values]);
    updated = result.affectedRows === 1;
  } else {
    const db = await postgresDatabase(url);
    await db.query(
      "INSERT INTO schedule_workspaces (id, version, draft) VALUES ($1, 0, $2) ON CONFLICT (id) DO NOTHING",
      [id, initialDraft],
    );
    const result = await db.query(postgresUpdate, [...values]);
    updated = result.rowCount === 1;
  }

  return { updated, publishedAt };
}
