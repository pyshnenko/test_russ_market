import assert from "node:assert/strict";
import { once } from "node:events";
import type { Server as TcpServer } from "node:net";
import { test } from "node:test";
import { createServer } from "mysql2";
import { getDatabaseErrorCode, isDatabaseUnavailable } from "../lib/database-errors";
import { closeScheduleDatabase, withScheduleDatabase } from "../lib/db/schedule-database";

test("bounds a stalled MySQL prepare and removes its connection from the pool", { timeout: 15_000 }, async () => {
  let connections = 0;
  let firstPrepareReceived = false;
  let firstConnectionEnded = false;
  const server = createServer((connection) => {
    const connectionId = ++connections;
    connection.on("error", () => {});
    if (connectionId === 1) connection.once("end", () => { firstConnectionEnded = true; });
    connection.serverHandshake({
      protocolVersion: 10, serverVersion: "8.4.0", connectionId, statusFlags: 2,
      characterSet: 45, capabilityFlags: 0xffff,
    });
    connection.on("query", () => connection.writeOk());
    connection.on("stmt_prepare", () => {
      if (connectionId === 1) firstPrepareReceived = true;
      else connection.writeError({ code: 1064, message: "Fresh connection accepted the next statement" });
    });
  });
  const listener = (server as typeof server & { _server: TcpServer })._server;

  listener.listen(0, "127.0.0.1");
  await once(listener, "listening");
  const address = listener.address();
  assert(address && typeof address === "object");
  process.env.DATABASE_URL = `mysql://test:test@127.0.0.1:${address.port}/schedule`;

  try {
    await assert.rejects(withScheduleDatabase(async () => {}), (error: unknown) => {
      assert(firstPrepareReceived);
      assert.equal(getDatabaseErrorCode(error), "MYSQL_OPERATION_TIMEOUT");
      return isDatabaseUnavailable(error);
    });

    await assert.rejects(withScheduleDatabase(async () => {}), {
      code: "ER_PARSE_ERROR", message: "Fresh connection accepted the next statement",
    });
    assert.equal(connections, 2);
    assert(firstConnectionEnded);
  } finally {
    await closeScheduleDatabase();
    await new Promise<void>((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
  }
});
