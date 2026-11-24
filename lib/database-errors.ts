import "server-only";

const connectionErrors = new Set([
  "ETIMEDOUT", "MYSQL_OPERATION_TIMEOUT", "ECONNREFUSED", "ECONNRESET", "EPIPE", "ENOTFOUND", "EAI_AGAIN",
  "EHOSTUNREACH", "ENETUNREACH", "PROTOCOL_CONNECTION_LOST", "PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR",
  "ER_CON_COUNT_ERROR", "ER_SERVER_SHUTDOWN", "57P01", "57P02", "57P03", "53300",
]);

export function getDatabaseErrorCode(error: unknown) {
  // pg-pool raises these connection timeouts without a driver code.
  if (error instanceof Error && (
    error.message === "Connection terminated due to connection timeout" ||
    error.message === "timeout exceeded when trying to connect"
  )) return "ETIMEDOUT";

  return error && typeof error === "object" && "code" in error && typeof error.code === "string"
    ? error.code
    : undefined;
}

export function isDatabaseUnavailable(error: unknown) {
  const code = getDatabaseErrorCode(error);
  return code !== undefined && (connectionErrors.has(code) || /^08[0-9A-Z]{3}$/.test(code));
}
