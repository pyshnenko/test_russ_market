import "server-only";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createPool, type ResultSetHeader, type RowDataPacket } from "mysql2/promise";
import { Pool } from "pg";
import { initializeScheduleSchema } from "./schedule-migration";

export type Dialect = "sqlite" | "mysql" | "postgres";
export type Value = string | number | null;
export type Sql = {
  dialect: Dialect;
  rows<T>(query: string, values?: Value[]): Promise<T[]>;
  run(query: string, values?: Value[]): Promise<number>;
};
type TransactionMode = "read" | "write";

let sqlite: DatabaseSync | undefined;
let sqliteQueue = Promise.resolve();
let mysql: ReturnType<typeof createPool> | undefined;
let postgres: Pool | undefined;
let ready: Promise<void> | undefined;

function databaseKind(url: string) {
  if (!URL.canParse(url)) throw new Error("DATABASE_URL must be a valid connection URI");
  const protocol = new URL(url).protocol;
  if (protocol === "mysql:") return "mysql";
  if (protocol === "postgres:" || protocol === "postgresql:") return "postgres";
  throw new Error("DATABASE_URL must use mysql://, postgres:// or postgresql://");
}

function postgresParameters(query: string) {
  let index = 0;
  return query.replace(/\?/g, () => `$${++index}`);
}

async function initialize(sql: Sql) {
  ready ??= initializeScheduleSchema(sql).catch((error: unknown) => {
    ready = undefined;
    throw error;
  });
  await ready;
}

async function transaction<T>(sql: Sql, mode: TransactionMode, work: (query: Sql) => Promise<T>) {
  await initialize(sql);
  if (sql.dialect === "mysql" && mode === "read") {
    await sql.run("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
    await sql.run("START TRANSACTION READ ONLY, WITH CONSISTENT SNAPSHOT");
  } else if (sql.dialect === "postgres" && mode === "read") {
    await sql.run("BEGIN ISOLATION LEVEL REPEATABLE READ, READ ONLY");
  } else {
    await sql.run(mode === "write" && sql.dialect === "sqlite" ? "BEGIN IMMEDIATE" :
      sql.dialect === "mysql" ? "START TRANSACTION" : "BEGIN");
  }
  try {
    const result = await work(sql);
    await sql.run("COMMIT");
    return result;
  } catch (error) {
    await sql.run("ROLLBACK").catch(() => {});
    throw error;
  }
}

export async function withScheduleDatabase<T>(work: (sql: Sql) => Promise<T>, mode: TransactionMode = "write"): Promise<T> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    if (!sqlite) {
      const path = process.env.SCHEDULE_SQLITE_PATH ?? ".data/schedule.sqlite";
      if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
      sqlite = new DatabaseSync(path);
      sqlite.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 3000; PRAGMA foreign_keys = ON");
    }
    const db = sqlite;
    const sql: Sql = {
      dialect: "sqlite",
      async rows<T>(query: string, values: Value[] = []) {
        return db.prepare(query).all(...values) as T[];
      },
      async run(query, values = []) {
        return Number(db.prepare(query).run(...values).changes);
      },
    };
    const task = sqliteQueue.then(() => transaction(sql, mode, work));
    sqliteQueue = task.then(() => {}, () => {});
    return task;
  }

  if (databaseKind(url) === "mysql") {
    mysql ??= createPool({ uri: url, connectTimeout: 5000 });
    const connection = await mysql.getConnection();
    const sql: Sql = {
      dialect: "mysql",
      async rows<T>(query: string, values: Value[] = []) {
        const [rows] = await connection.execute<RowDataPacket[]>(query, values);
        return rows as T[];
      },
      async run(query, values = []) {
        const [result] = values.length
          ? await connection.execute<ResultSetHeader>(query, values)
          : await connection.query<ResultSetHeader>(query);
        return result.affectedRows;
      },
    };
    try {
      return await transaction(sql, mode, work);
    } finally {
      connection.release();
    }
  }

  if (!postgres) {
    postgres = new Pool({ connectionString: url, connectionTimeoutMillis: 5000, allowExitOnIdle: true });
    postgres.on("error", (error) => console.error("Idle PostgreSQL connection failed", error.name));
  }
  const connection = await postgres.connect();
  const sql: Sql = {
    dialect: "postgres",
    async rows<T>(query: string, values: Value[] = []) {
      const result = await connection.query(postgresParameters(query), values);
      return result.rows as T[];
    },
    async run(query, values = []) {
      const result = await connection.query(postgresParameters(query), values);
      return result.rowCount ?? 0;
    },
  };
  try {
    return await transaction(sql, mode, work);
  } finally {
    connection.release();
  }
}

export async function closeScheduleDatabase() {
  await sqliteQueue;
  sqlite?.close();
  sqlite = undefined;
  await Promise.all([mysql?.end(), postgres?.end()]);
  mysql = undefined;
  postgres = undefined;
  ready = undefined;
}
