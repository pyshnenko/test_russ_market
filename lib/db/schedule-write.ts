import "server-only";
import type { Sql, Value } from "./schedule-database";
import { parseShiftKey, type Shift, type Workspace } from "../schedule";

type OrderedTable = "schedule_employees" | "schedule_templates";

const employeeFields = ["name", "name_search", "job_title", "avatar", "sort_order"];
const templateFields = ["name", "start_time", "end_time", "color", "sort_order"];

async function insertRows(sql: Sql, statement: string, rows: Value[][]) {
  const width = rows[0]?.length;
  if (!width) return;
  const tuple = `(${Array.from({ length: width }, () => "?").join(", ")})`;
  for (let offset = 0; offset < rows.length; offset += 100) {
    const batch = rows.slice(offset, offset + 100);
    await sql.run(`${statement} VALUES ${batch.map(() => tuple).join(", ")}`, batch.flat());
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

  await insertRows(sql, "INSERT INTO schedule_shifts (workspace_id, employee_id, shift_date, name, start_time, end_time, color)", additions);
}

export async function syncNormalizedRows(sql: Sql, id: string, next: Workspace, previous?: Workspace) {
  await syncOrderedRows(sql, id, "schedule_employees", employeeFields, employeeRows(previous?.employees ?? []), employeeRows(next.employees));
  await syncOrderedRows(sql, id, "schedule_templates", templateFields, templateRows(previous?.templates ?? []), templateRows(next.templates));
  await syncShifts(sql, id, previous?.shifts ?? {}, next.shifts);
}
