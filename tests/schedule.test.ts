import assert from "node:assert/strict";
import { test } from "node:test";
import {
  changesInPeriod, dateKey, defaultEmployees, duration, parseShiftKey, patchCoverage, patchShifts, schedulePatchSchema, schedulePeriodSchema, shiftKey, shiftSchema, workspaceSchema,
  type Shift,
} from "../lib/schedule";
import { getCalendarWeeks, getDays, isSameMonth, monthFocusDate, shiftMonth } from "../lib/schedule-calendar";

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

test("accepts preset and six-digit palette colors", () => {
  for (const color of ["blue", "#d44356", "#5978EC"]) {
    assert.equal(shiftSchema.safeParse({ ...morning, color }).success, true);
  }
  for (const color of ["red", "#xyz", "#abc", "#d4435680"]) {
    assert.equal(shiftSchema.safeParse({ ...morning, color }).success, false);
  }
});

test("applies shift edits without mutating the original or unrelated dates", () => {
  const saved = { [first]: morning, [other]: night };
  assert.deepEqual(patchShifts(saved, { [first]: null, [second]: night }), { [second]: night, [other]: night });
  assert.deepEqual(saved, { [first]: morning, [other]: night });
});

test("opens the month at an assigned shift from the displayed week", () => {
  const week = ["2026-11-30", "2026-12-01", "2026-12-02", "2026-12-03", "2026-12-04", "2026-12-05", "2026-12-06"];
  const hasShift = (date: string) => date === "2026-11-30" || date === "2026-12-02";
  assert.equal(monthFocusDate("2026-11-30", week, hasShift), "2026-11-30");
  assert.equal(monthFocusDate("2026-12-06", week, hasShift), "2026-12-02");
  assert.equal(monthFocusDate("2026-11-30", week, (date) => date === "2026-12-02"), "2026-12-02");
  assert.equal(monthFocusDate("2026-12-06", week, () => false), "2026-12-06");
});

test("month comparison includes the year and ignores the day", () => {
  assert.equal(isSameMonth("2026-11-01", "2026-11-30"), true);
  assert.equal(isSameMonth("2026-11-30", "2026-12-01"), false);
  assert.equal(isSameMonth("2026-11-30", "2027-11-30"), false);
});

test("the week picker groups days from Monday to Sunday across month and year boundaries", () => {
  const weeks = getCalendarWeeks("2026-12-18");
  assert.equal(weeks.length, 5);
  assert.equal(dateKey(weeks[0][0]), "2026-11-30");
  assert.equal(dateKey(weeks.at(-1)![6]), "2027-01-03");
  assert.deepEqual(getDays("2027-01-01", "week"), weeks.at(-1));
  assert.equal(getCalendarWeeks("2026-02-01").length, 5);
  assert.equal(getCalendarWeeks("2026-08-31").length, 6);
});

test("month navigation starts on day one and keeps leap days", () => {
  const next = dateKey(shiftMonth("2028-01-31", 1));
  assert.equal(next, "2028-02-01");
  assert.equal(getDays(next, "month").length, 29);
  assert.equal(dateKey(shiftMonth("2026-12-31", 12)), "2027-12-01");
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

test("viewing a different period does not discard draft coverage changes", () => {
  const changes = {
    [first]: { before: morning, after: null },
    [other]: { before: null, after: night },
  };
  const firstDay = { from: "2026-11-23", to: "2026-11-23" };
  const nextDay = { from: "2026-11-24", to: "2026-11-24" };
  assert.deepEqual(patchCoverage({}, changesInPeriod(changes, nextDay)), { "2026-11-24": 1 });
  assert.deepEqual(patchCoverage({ "2026-11-23": 1 }, changesInPeriod(changes, firstDay)), { "2026-11-23": 0 });
  assert.equal(Object.keys(changes).length, 2);
});

test("validates inclusive periods of up to 31 calendar days", () => {
  assert.equal(schedulePeriodSchema.safeParse({ from: "2026-12-01", to: "2026-12-31" }).success, true);
  assert.equal(schedulePeriodSchema.safeParse({ from: "2026-12-01", to: "2027-01-01" }).success, false);
  assert.equal(schedulePeriodSchema.safeParse({ from: "2026-12-31", to: "2026-12-01" }).success, false);
  assert.equal(schedulePeriodSchema.safeParse({ from: "2026-12-01" }).success, false);
});

test("rejects invalid shift dates and shifts referencing a removed employee", () => {
  assert.equal(schedulePatchSchema.safeParse({ changes: { "1/2026-02-30": morning }, templates: [] }).success, false);
  assert.equal(schedulePatchSchema.safeParse({ changes: { [first]: null }, templates: [] }).success, true);
  assert.equal(workspaceSchema.safeParse({ shifts: { [first]: morning }, templates: [], employees: [] }).success, false);
});

test("round-trips shift keys and rejects missing or extra segments", () => {
  const date = "2026-11-23";
  for (const employeeId of ["1", "eb1680cc-ae5d-475c-bd3d-a208986516d0"]) {
    const key = shiftKey(employeeId, date);
    assert.deepEqual(parseShiftKey(key), { employeeId, date });
    assert.equal(schedulePatchSchema.safeParse({ changes: { [key]: morning }, templates: [] }).success, true);
  }
  for (const key of ["1", "1/", "/2026-11-23", "1/2026-11-23/"]) {
    assert.equal(parseShiftKey(key), null);
    assert.equal(schedulePatchSchema.safeParse({ changes: { [key]: morning }, templates: [] }).success, false);
  }
});

test("loads the default roster on legacy snapshots and preserves an explicitly empty roster", () => {
  const snapshot = { shifts: {}, templates: [] };
  assert.deepEqual(workspaceSchema.parse(snapshot).employees, defaultEmployees);
  assert.deepEqual(workspaceSchema.parse({ ...snapshot, employees: [] }).employees, []);
});
