"use client";

import { useActionState, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { useFormStatus } from "react-dom";
import dynamic from "next/dynamic";
import Alert from "@mui/material/Alert";
import Snackbar from "@mui/material/Snackbar";
import { saveSchedule, type SaveResult } from "@/app/actions";
import { dateKey, parseShiftKey, patchCoverage, patchShifts, shiftKey, type SchedulePageData, type Shift, type ShiftChanges, type ShiftPatch, type Template } from "@/lib/schedule";
import { addDays, formatFullDate, formatMonthYear, formatShortDate, getDays, monthFocusDate, shiftMonth, type ScheduleView } from "@/lib/schedule-calendar";
import { ScheduleButton } from "./schedule-buttons";
import { ScheduleTable } from "./schedule-table";
import { ScheduleTemplates } from "./schedule-templates";
import { SchedulePagination, ScheduleSelectionActions, ScheduleToolbar } from "./schedule-toolbar";
import styles from "./schedule.module.css";

const ShiftDialog = dynamic(() => import("./shift-dialog").then((module) => module.ShiftDialog));
const DateAssignment = dynamic(() => import("./date-assignment").then((module) => module.DateAssignment));

type DragSource = { kind: "cell"; key: string } | { kind: "template"; id: string };
const shiftDragType = "application/x-schedule-shift";
const shiftDragEffects = { cell: "move", template: "copy" } as const;
type DialogState =
  | { kind: "shift"; keys: string[]; title: string; value?: Shift }
  | { kind: "template"; value?: Template };
type SaveNotice = { id: number; message: string; severity: "success" | "error"; open: boolean };

function scrollToPeriod(viewport: HTMLDivElement | null, view: ScheduleView, date: string) {
  if (!viewport) return;
  if (view === "week") {
    viewport.scrollLeft = 0;
    return;
  }
  const heading = viewport.querySelector<HTMLTableCellElement>(`th[data-date="${date}"]`);
  const employeeColumn = heading?.parentElement?.firstElementChild;
  if (!heading || !employeeColumn) return;
  const offset = heading.getBoundingClientRect().left - viewport.getBoundingClientRect().left;
  viewport.scrollLeft += offset - employeeColumn.getBoundingClientRect().width;
}

function SaveButtons({ rosterPending }: { rosterPending: boolean }) {
  const { pending } = useFormStatus();
  return (
    <div className={styles.saveActions}>
      <ScheduleButton type="submit" variant="secondary" name="intent" value="publish" disabled={pending || rosterPending} className={styles.saveButton}>Опубликовать</ScheduleButton>
      <ScheduleButton type="submit" variant="primary" name="intent" value="save" disabled={pending || rosterPending} className={styles.saveButton}>
        {pending ? "Сохранение…" : "Сохранить"}
      </ScheduleButton>
    </div>
  );
}

export function ScheduleEditor({ initial, today }: { initial: SchedulePageData; today: string }) {
  const [roster, setRoster] = useState(initial);
  const [templates, setTemplates] = useState(initial.data.templates);
  const [changes, setChanges] = useState<ShiftChanges>({});
  const [view, setView] = useState<ScheduleView>("week");
  const [panel, setPanel] = useState<"calendar" | "templates">("calendar");
  const [anchor, setAnchor] = useState(today);
  const [query, setQuery] = useState("");
  const [rosterRequest, setRosterRequest] = useState<{ query: string; page: number; delay: number } | null>(null);
  const [rosterError, setRosterError] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [assignmentDate, setAssignmentDate] = useState<string | null>(null);
  const [dragSource, setDragSource] = useState<DragSource | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [edited, setEdited] = useState(0);
  const [notice, setNotice] = useState<SaveNotice | null>(null);
  const grid = useRef<HTMLDivElement>(null);
  const days = getDays(anchor, view);
  const { employees, shifts: savedShifts } = roster.data;
  const patch = useMemo<ShiftPatch>(() => Object.fromEntries(Object.entries(changes).map(([key, { after }]) => [key, after])), [changes]);
  const shifts = useMemo(() => {
    const ids = new Set(employees.map(({ id }) => id));
    const visibleChanges = Object.entries(patch).filter(([key]) => {
      const cell = parseShiftKey(key);
      return cell !== null && ids.has(cell.employeeId);
    });
    return patchShifts(savedShifts, Object.fromEntries(visibleChanges));
  }, [employees, patch, savedShifts]);
  const coverageCounts = useMemo(() => patchCoverage(roster.coverage, changes), [roster.coverage, changes]);
  const [formState, save, pending] = useActionState(async (previous: SaveResult, form: FormData) => {
    const result = await saveSchedule(previous, form);
    const version = result.version;
    if (!result.error && version !== undefined) {
      setRoster((current) => ({
        ...current,
        version,
        data: { ...current.data, shifts },
        coverage: coverageCounts,
      }));
      setChanges({});
    }
    setNotice((current) => ({
      id: (current?.id ?? 0) + 1,
      message: result.error ?? (result.published ? "График опубликован" : "График сохранён"),
      severity: result.error ? "error" : "success",
      open: true,
    }));
    return result;
  }, {
    version: initial.version, publishedAt: initial.publishedAt,
  } satisfies SaveResult);
  const dirty = edited !== (formState.savedEdit ?? 0);

  function closeNotice(id: number) {
    setNotice((current) => current?.id === id ? { ...current, open: false } : current);
  }

  useLayoutEffect(() => {
    scrollToPeriod(grid.current, view, anchor);
  }, [anchor, view]);

  useEffect(() => {
    if (!rosterRequest) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ query: rosterRequest.query, page: String(rosterRequest.page) });
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/schedule/employees?${params}`, { signal: controller.signal });
        if (!response.ok) {
          const result: { error?: string } = await response.json();
          throw new Error(result.error ?? "Не удалось загрузить сотрудников.");
        }
        const result: SchedulePageData = await response.json();
        if (controller.signal.aborted) return;
        if (result.version !== roster.version) {
          if (dirty) throw new Error("График изменён в другой вкладке. Текущий черновик остался в редакторе.");
          setTemplates(result.data.templates);
        }
        setRoster(result);
        setSelected([]);
        grid.current?.scrollTo({ top: 0 });
      } catch (error) {
        if (!controller.signal.aborted) setRosterError(error instanceof TypeError ? "Не удалось загрузить сотрудников. Проверьте подключение." : error instanceof Error ? error.message : "Не удалось загрузить сотрудников.");
      } finally {
        if (!controller.signal.aborted) setRosterRequest((current) => current === rosterRequest ? null : current);
      }
    }, rosterRequest.delay);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [dirty, rosterRequest, roster.version]);

  function requestRoster(query: string, page: number, delay = 0) {
    setRosterError("");
    setSelected([]);
    setRosterRequest({ query, page, delay });
  }

  function updateSearch(value: string) {
    setQuery(value);
    const term = value.trim();
    if (!term && roster.version === initial.version) setRoster(initial);
    requestRoster(term, 1, term ? 250 : 0);
  }

  const updateShifts = useCallback((updates: ShiftPatch) => {
    setChanges((current) => {
      const next = { ...current };
      for (const [key, after] of Object.entries(updates)) {
        next[key] = { before: current[key] ? current[key].before : savedShifts[key] ?? null, after };
      }
      return next;
    });
    setEdited((current) => current + 1);
    setSelected((current) => current.filter((key) => !Object.hasOwn(updates, key)));
    setFeedback("");
  }, [savedShifts]);

  const applyShift = useCallback((keys: string[], { name, start, end, color }: Shift) => {
    if (pending || !keys.length) return;
    updateShifts(Object.fromEntries(keys.map((key) => [key, { name, start, end, color }])));
  }, [pending, updateShifts]);

  function finishDrag() {
    setDragSource(null);
    setDropTarget(null);
  }

  function startDrag(event: DragEvent<HTMLButtonElement>, source: DragSource) {
    if (pending) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = shiftDragEffects[source.kind];
    event.dataTransfer.setData(shiftDragType, source.kind);
    setDragSource(source);
  }

  function canDrop(event: DragEvent<HTMLTableCellElement>, key: string) {
    return !pending && dragSource && event.dataTransfer.types.includes(shiftDragType) &&
      (dragSource.kind === "template" || dragSource.key !== key);
  }

  function hoverDropTarget(event: DragEvent<HTMLTableCellElement>, key: string) {
    if (!dragSource || !canDrop(event, key)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = shiftDragEffects[dragSource.kind];
    setDropTarget(key);
  }

  function leaveDropTarget(event: DragEvent<HTMLTableCellElement>, key: string) {
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
    setDropTarget((current) => current === key ? null : current);
  }

  function toggleCell(key: string) {
    setSelected((current) => current.includes(key) ? current.filter((value) => value !== key) : [...current, key]);
    setFeedback("");
  }

  function dropShift(event: DragEvent<HTMLTableCellElement>, key: string) {
    if (!dragSource || !canDrop(event, key)) return;
    event.preventDefault();
    finishDrag();
    if (dragSource.kind === "template") {
      const template = templates.find(({ id }) => id === dragSource.id);
      if (template) applyShift([key], template);
      return;
    }

    const source = dragSource.key;
    if (!shifts[source]) return;
    updateShifts({ [key]: shifts[source], [source]: shifts[key] ?? null });
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (pending || dialog || assignmentDate || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.target instanceof HTMLElement && event.target.closest("input, textarea, select, [role=menu], [contenteditable=true]")) return;
      if (event.key === "Escape") setSelected([]);
      const template = /^[1-9]$/.test(event.key) ? templates[Number(event.key) - 1] : undefined;
      if (template && selected.length) {
        event.preventDefault();
        applyShift(selected, template);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [applyShift, assignmentDate, dialog, pending, templates, selected]);

  function clearShifts(keys: string[]) {
    updateShifts(Object.fromEntries(keys.map((key) => [key, null])));
  }

  function move(offset: -1 | 1) {
    const date = view === "month" ? shiftMonth(anchor, offset) : addDays(new Date(anchor), offset * 7);
    selectPeriod(dateKey(date));
  }

  function changeView(next: ScheduleView) {
    if (view === next) return;
    if (next === "month") {
      setAnchor(monthFocusDate(anchor, days.map(dateKey), (date) =>
        employees.some(({ id }) => Boolean(shifts[shiftKey(id, date)])),
      ));
    }
    setView(next);
    setSelected([]);
  }

  function selectPeriod(date: string) {
    if (anchor === date) scrollToPeriod(grid.current, view, date);
    setAnchor(date);
    setSelected([]);
  }

  function saveDialog(shift: Shift) {
    if (!dialog) return;
    if (dialog.kind === "shift") {
      applyShift(dialog.keys, shift);
      setDialog(null);
      return;
    }
    if (dialog.value) {
      const id = dialog.value.id;
      setTemplates((current) => current.map((item) => item.id === id ? { ...shift, id } : item));
    } else {
      const id = crypto.randomUUID();
      setTemplates((current) => [...current, { ...shift, id }]);
    }
    setEdited((current) => current + 1);
    setDialog(null);
  }

  function removeDialogItem() {
    if (!dialog) return;
    if (dialog.kind === "shift") {
      clearShifts(dialog.keys);
    } else {
      const id = dialog.value?.id;
      setTemplates((current) => current.filter((item) => item.id !== id));
      setEdited((current) => current + 1);
    }
    setDialog(null);
  }

  const dateLabel = view === "month" ? formatMonthYear(days[0]) : `${formatShortDate(days[0])} – ${formatShortDate(days[6])}`;

  return (
    <>
      <header className={styles.header}>
        <h1 className={styles.heading}>График</h1>
        <form action={save}>
          <input type="hidden" name="payload" value={JSON.stringify({ data: { changes: patch, templates }, version: roster.version, edited })} />
          <SaveButtons rosterPending={!!rosterRequest} />
        </form>
      </header>
      {notice && (
        <Snackbar
          key={notice.id}
          open={notice.open}
          anchorOrigin={{ vertical: "top", horizontal: "right" }}
          autoHideDuration={notice.severity === "success" ? 3500 : null}
          onClose={(_, reason) => { if (reason !== "clickaway") closeNotice(notice.id); }}
        >
          <Alert
            severity={notice.severity}
            variant="filled"
            role={notice.severity === "error" ? "alert" : "status"}
            closeText="Закрыть уведомление"
            onClose={() => closeNotice(notice.id)}
          >
            {notice.message}
          </Alert>
        </Snackbar>
      )}

      <div role="group" aria-label="Разделы графика" className={styles.mobileTabs}>
        {([["calendar", "Календарь"], ["templates", "Шаблоны и смены"]] as const).map(([value, label]) => (
          <button key={value} type="button" aria-pressed={panel === value} onClick={() => setPanel(value)} className={styles.mobileTab}>{label}</button>
        ))}
      </div>

      <div className={styles.workspace}>
        <section aria-label="Календарь смен" data-inactive={panel !== "calendar" || undefined} className={styles.calendar}>
          {selected.length > 0 ? (
            <ScheduleSelectionActions
              selected={selected} templates={templates} pending={pending}
              canClear={selected.some((key) => shifts[key])}
              onApply={(template) => applyShift(selected, template)}
              onEdit={(title) => setDialog({
                kind: "shift", keys: selected, title,
                value: selected.length === 1 ? shifts[selected[0]] : undefined,
              })}
              onClear={() => clearShifts(selected)}
              onDeselect={() => { setSelected([]); setFeedback(""); }}
            />
          ) : (
            <ScheduleToolbar
              query={query} pending={pending} view={view} anchor={anchor} today={today} dateLabel={dateLabel}
              onSearch={updateSearch} onChangeView={changeView} onMove={move} onSelectPeriod={selectPeriod}
            />
          )}
          <ScheduleTable
            gridRef={grid} view={view} days={days} today={today}
            employees={employees} shifts={shifts} coverage={coverageCounts}
            filtered={!!roster.pagination.query} loading={!!rosterRequest} pending={pending}
            selected={selected} draggedCell={dragSource?.kind === "cell" ? dragSource.key : undefined} dropTarget={dropTarget}
            onDate={setAssignmentDate} onSelect={toggleCell}
            onEdit={(key, title, shift) => setDialog({ kind: "shift", keys: [key], title, value: shift })}
            onDragStart={(event, key) => startDrag(event, { kind: "cell", key })}
            onDragEnd={finishDrag} onDragOver={hoverDropTarget} onDragLeave={leaveDropTarget} onDrop={dropShift}
          />
          <SchedulePagination
            pagination={roster.pagination} error={rosterError} loading={!!rosterRequest} pending={pending}
            onPage={(page) => requestRoster(roster.pagination.query, page)}
            onRetry={() => requestRoster(query.trim(), 1)}
          />
        </section>

        <ScheduleTemplates
          visible={panel === "templates"} templates={templates} pending={pending}
          hasSelection={selected.length > 0} feedback={feedback}
          onEdit={(template) => setDialog({ kind: "template", value: template })}
          onApply={(shift) => applyShift(selected, shift)} onFeedback={setFeedback}
          onDragStart={(event, id) => startDrag(event, { kind: "template", id })} onDragEnd={finishDrag}
        />
      </div>

      {dialog && <ShiftDialog
        title={dialog.kind === "shift" ? dialog.title : dialog.value ? "Редактирование шаблона" : "Новый шаблон"}
        value={dialog.value}
        onClose={() => setDialog(null)}
        onSave={saveDialog}
        onRemove={removeDialogItem}
      />}
      {assignmentDate && <DateAssignment
        date={assignmentDate}
        label={formatFullDate(new Date(assignmentDate))}
        shifts={shifts}
        templates={templates}
        employees={employees}
        scoped={roster.pagination.pageCount > 1 || !!roster.pagination.query}
        selected={selected}
        onClose={() => setAssignmentDate(null)}
        onApply={(keys, template) => {
          applyShift(keys, template);
          setAssignmentDate(null);
        }}
      />}
    </>
  );
}
