import assert from "node:assert/strict";
import { test } from "node:test";
import {
  defaultEmployees, duration, patchCoverage, patchShifts, schedulePatchSchema, shiftSchema, workspaceSchema,
  type Shift,
} from "../lib/schedule";

const morning: Shift = { name: "Утро", start: "07:00", end: "15:00", color: "blue" };
const night: Shift = { name: "Ночь", start: "22:30", end: "06:00", color: "violet" };
const first = "1/2026-11-23";
const second = "2/2026-11-23";
const other = "1/2026-11-24";

test("calculates regular shifts and shifts through midnight", () => {
  assert.equal(duration(morning), 480);
  assert.equal(duration(night), 450);
  assert.equal(shiftSchema.safeParse(night).success, true);
  assert.equal(shiftSchema.safeParse({ ...morning, end: "07:00" }).success, false);
  assert.equal(shiftSchema.safeParse({ ...morning, end: "24:00" }).success, false);
});

test("applies shift edits without mutating the original or unrelated dates", () => {
  const saved = { [first]: morning, [other]: night };
  assert.deepEqual(patchShifts(saved, { [first]: null, [second]: night }), { [second]: night, [other]: night });
  assert.deepEqual(saved, { [first]: morning, [other]: night });
});

test("coverage changes for assignments and removals and stays stable for replacements", () => {
  const saved = { "2026-11-23": 1, "2026-11-24": 1 };
  const next = patchCoverage(saved, {
    [first]: { before: morning, after: night },
    [second]: { before: null, after: morning },
    [other]: { before: night, after: null },
  });
  assert.deepEqual(next, { "2026-11-23": 2, "2026-11-24": 0 });
  assert.deepEqual(saved, { "2026-11-23": 1, "2026-11-24": 1 });
});

test("rejects invalid shift dates and shifts referencing a removed employee", () => {
  assert.equal(schedulePatchSchema.safeParse({ changes: { "1/2026-02-30": morning }, templates: [] }).success, false);
  assert.equal(schedulePatchSchema.safeParse({ changes: { [first]: null }, templates: [] }).success, true);
  assert.equal(workspaceSchema.safeParse({ shifts: { [first]: morning }, templates: [], employees: [] }).success, false);
});

test("loads the default roster on legacy snapshots and preserves an explicitly empty roster", () => {
  const snapshot = { shifts: {}, templates: [] };
  assert.deepEqual(workspaceSchema.parse(snapshot).employees, defaultEmployees);
  assert.deepEqual(workspaceSchema.parse({ ...snapshot, employees: [] }).employees, []);
});
