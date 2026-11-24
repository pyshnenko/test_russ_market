import "server-only";
import type { Sql, Value } from "./schedule-database";
import { parseShiftKey, type Shift, type ShiftPatch, type Template, type Workspace } from "../schedule";

type OrderedTable = "schedule_employees" | "schedule_templates";

const employeeFields = ["name", "name_search", "job_title", "avatar", "sort_order"];
const templateFields = ["name", "start_time", "end_time", "color", "sort_order"];
const shiftFields = ["name", "start_time", "end_time", "color"];
const insertShifts = "INSERT INTO schedule_shifts (workspace_id, employee_id, shift_date, name, start_time, end_time, color)";
const writeBatchSize = 100;

async function insertRows(sql: Sql, statement: string, rows: Value[][], suffix = "") {
  const width = rows[0]?.length;
  if (!width) return;
  const tuple = `(${Array.from({ length: width }, () => "?").join(", ")})`;
  for (let offset = 0; offset < rows.length; offset += writeBatchSize) {
    const batch = rows.slice(offset, offset + writeBatchSize);
    await sql.run(`${statement} VALUES ${batch.map(() => tuple).join(", ")}${suffix}`, batch.flat());
  }
}

function employeeRows(employees: Workspace["employees"]) {
  return new Map(employees.map((item, order) => [
    item.id, [item.name, item.name.toLocaleLowerCase("ru"), item.role, item.avatar, order],
  ]));
}

function shiftValues(shift: Shift): Value[] {
  return [shift.name, shift.start, shift.end, shift.color];
}

function templateRows(templates: Workspace["templates"]) {
  return new Map(templates.map((item, order) => [item.id, [...shiftValues(item), order]]));
}

async function syncOrderedRows(sql: Sql, workspace: string, table: OrderedTable, columns: string[], previous: Map<string, Value[]>, next: Map<string, Value[]>) {
  const keyFilter = "WHERE workspace_id = ? AND id = ?";
  for (const [id, values] of previous) {
    const current = next.get(id);
    if (!current) {
      await sql.run(`DELETE FROM ${table} ${keyFilter}`, [workspace, id]);
    } else if (current.at(-1) !== values.at(-1)) {
      // Free unique positions before applying any reordering.
      await sql.run(`UPDATE ${table} SET sort_order = -sort_order - 1 ${keyFilter}`, [workspace, id]);
    }
  }

  const additions: Value[][] = [];
  for (const [id, values] of next) {
    const old = previous.get(id);
    if (!old) {
      additions.push([workspace, id, ...values]);
      continue;
    }
    const updated = columns.flatMap((column, index) => values[index] !== old[index] ? [{ column, value: values[index] }] : []);
    if (updated.length) {
      await sql.run(
        `UPDATE ${table} SET ${updated.map(({ column }) => `${column} = ?`).join(", ")} ${keyFilter}`,
        [...updated.map(({ value }) => value), workspace, id],
      );
    }
  }
  await insertRows(sql, `INSERT INTO ${table} (workspace_id, id, ${columns.join(", ")})`, additions);
}

function shiftCoordinates(workspace: string, key: string) {
  const cell = parseShiftKey(key);
  if (!cell) throw new Error("Malformed shift key");
  return [workspace, cell.employeeId, cell.date];
}

async function syncShifts(sql: Sql, workspace: string, previous: Workspace["shifts"], next: Workspace["shifts"]) {
  const keyFilter = "WHERE workspace_id = ? AND employee_id = ? AND shift_date = ?";
  for (const key of Object.keys(previous)) {
    if (!next[key]) {
      await sql.run(`DELETE FROM schedule_shifts ${keyFilter}`, shiftCoordinates(workspace, key));
    }
  }

  const additions: Value[][] = [];
  for (const [key, shift] of Object.entries(next)) {
    const old = previous[key] && shiftValues(previous[key]);
    const values = shiftValues(shift);
    if (!old) {
      additions.push([...shiftCoordinates(workspace, key), ...values]);
    } else if (values.some((value, index) => value !== old[index])) {
      await sql.run(
        `UPDATE schedule_shifts SET name = ?, start_time = ?, end_time = ?, color = ? ${keyFilter}`,
        [...values, ...shiftCoordinates(workspace, key)],
      );
    }
  }

  await insertRows(sql, insertShifts, additions);
}

export async function applyShiftPatch(sql: Sql, id: string, changes: ShiftPatch) {
  const upserts: Value[][] = [];
  const removals: Value[][] = [];
  for (const [key, shift] of Object.entries(changes)) {
    const cell = parseShiftKey(key);
    if (!cell) throw new Error("Malformed shift key");
    const coordinates = [cell.employeeId, cell.date];
    if (shift) upserts.push([id, ...coordinates, ...shiftValues(shift)]);
    else removals.push(coordinates);
  }

  for (let offset = 0; offset < removals.length; offset += writeBatchSize) {
    const batch = removals.slice(offset, offset + writeBatchSize);
    const matches = batch.map(() => "(employee_id = ? AND shift_date = ?)").join(" OR ");
    await sql.run(`DELETE FROM schedule_shifts WHERE workspace_id = ? AND (${matches})`, [id, ...batch.flat()]);
  }

  const mysql = sql.dialect === "mysql";
  const incoming = mysql ? "incoming" : "excluded";
  const fields = shiftFields.map((field) => `${field} = ${incoming}.${field}`).join(", ");
  const conflict = mysql ? "AS incoming ON DUPLICATE KEY UPDATE" : "ON CONFLICT (workspace_id, employee_id, shift_date) DO UPDATE SET";
  await insertRows(sql, insertShifts, upserts, ` ${conflict} ${fields}`);
}

export async function syncTemplates(sql: Sql, id: string, previous: Template[], next: Template[]) {
  await syncOrderedRows(sql, id, "schedule_templates", templateFields, templateRows(previous), templateRows(next));
}

export async function syncNormalizedRows(sql: Sql, id: string, next: Workspace, previous?: Workspace) {
  await syncOrderedRows(sql, id, "schedule_employees", employeeFields, employeeRows(previous?.employees ?? []), employeeRows(next.employees));
  await syncTemplates(sql, id, previous?.templates ?? [], next.templates);
  await syncShifts(sql, id, previous?.shifts ?? {}, next.shifts);
}
