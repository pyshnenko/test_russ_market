"use client";

import { useActionState, useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { useFormStatus } from "react-dom";
import { saveSchedule, type SaveResult } from "@/app/actions";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { dateKey, duration, patchCoverage, patchShifts, shiftKey, shiftSchema, type SchedulePageData, type Shift, type ShiftChanges, type ShiftPatch, type Template } from "@/lib/schedule";
import { Icon } from "./icon";
import { TemplateMenu } from "./template-menu";
import dynamic from "next/dynamic";
import { EmployeeAvatar } from "./employee-avatar";

const ShiftDialog = dynamic(() => import("./shift-dialog").then((module) => module.ShiftDialog));
const DateAssignment = dynamic(() => import("./date-assignment").then((module) => module.DateAssignment));

const weekday = new Intl.DateTimeFormat("ru", { weekday: "short", timeZone: "UTC" });
const monthColumnWidth = 64;
const month = new Intl.DateTimeFormat("ru", { month: "long", year: "numeric", timeZone: "UTC" });
const fullDate = new Intl.DateTimeFormat("ru", { dateStyle: "long", timeZone: "UTC" });
const compactDate = new Intl.DateTimeFormat("ru", { day: "numeric", month: "short", timeZone: "UTC" });
const hours = new Intl.NumberFormat("ru", { maximumFractionDigits: 2 });
const inputClass = "min-w-0 rounded-[9px] bg-[#eff0f4] px-4 py-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-[#5978ec]";
const timeInputClass = cn(inputClass, "text-[#191a1e] [&::-webkit-calendar-picker-indicator]:opacity-0 hover:[&::-webkit-calendar-picker-indicator]:opacity-100 focus:[&::-webkit-calendar-picker-indicator]:opacity-100");
const colorTransition = "motion-safe:transition-colors motion-safe:duration-150";
const lightButton = cn(colorTransition, "inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-[9px] bg-[#e7ecff] px-4 text-base text-[#2047d9] enabled:hover:bg-[#cfd8fa] enabled:active:bg-[#bac8f5] disabled:cursor-default disabled:bg-[#eff0f4] disabled:text-[#8a8d96]");
const iconButton = cn(colorTransition, "grid size-8 cursor-pointer place-items-center rounded-md enabled:hover:bg-[#eff0f4] enabled:active:bg-[#e2e4eb] disabled:cursor-default disabled:opacity-50");
const quickButton = cn(colorTransition, "inline-flex min-h-8 cursor-pointer items-center justify-center gap-1 rounded-md px-1.5 enabled:hover:bg-white/15 enabled:active:bg-white/25 disabled:cursor-default disabled:opacity-50 sm:min-h-9 sm:gap-1.5 sm:px-2 [&>svg]:size-3.5 sm:[&>svg]:size-4");
const shiftColors = {
  blue: "bg-[#e6edff] text-[#245dcc]",
  violet: "bg-[#e9ddfe] text-[#6935cd]",
  green: "bg-[#dcf6f5] text-[#007b76]",
  amber: "bg-[#fff0d6] text-[#875406]",
} satisfies Record<Shift["color"], string>;
const dayCount = new Intl.PluralRules("ru");

type View = "week" | "month";
type DragSource = { kind: "cell"; key: string } | { kind: "template"; id: string };
const shiftDragType = "application/x-schedule-shift";
type DialogState =
  | { kind: "shift"; keys: string[]; title: string; value?: Shift }
  | { kind: "template"; value?: Template };

function addDays(date: Date, offset: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + offset);
  return next;
}

function getDays(anchor: string, view: View) {
  const date = new Date(anchor);
  if (view === "week") {
    const monday = addDays(date, -((date.getUTCDay() + 6) % 7));
    return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  }
  date.setUTCDate(1);
  const end = new Date(date);
  end.setUTCMonth(end.getUTCMonth() + 1, 0);
  return Array.from({ length: end.getUTCDate() }, (_, i) => addDays(date, i));
}

function SaveButtons({ rosterPending }: { rosterPending: boolean }) {
  const { pending } = useFormStatus();
  return (
    <div className="flex items-center gap-1 sm:gap-2">
      <button name="intent" value="publish" disabled={pending || rosterPending} className={cn(lightButton, "min-h-9 px-2.5 text-xs sm:min-h-12 sm:px-4 sm:text-base")}>Опубликовать</button>
      <button name="intent" value="save" disabled={pending || rosterPending} className="min-h-9 cursor-pointer rounded-[9px] bg-[#5978ec] px-2.5 text-xs text-white enabled:hover:bg-[#2047df] enabled:active:bg-[#1638b7] disabled:cursor-default disabled:bg-[#eff0f4] disabled:text-[#8a8d96] sm:min-h-12 sm:px-4 sm:text-base motion-safe:transition-colors motion-safe:duration-150">
        {pending ? "Сохранение…" : "Сохранить"}
      </button>
    </div>
  );
}

function shortTime(time: string) {
  return time.endsWith(":00") ? time.slice(0, 2) : time;
}

export function ScheduleEditor({ initial, today }: { initial: SchedulePageData; today: string }) {
  const [roster, setRoster] = useState(initial);
  const [templates, setTemplates] = useState(initial.data.templates);
  const [changes, setChanges] = useState<ShiftChanges>({});
  const [view, setView] = useState<View>("week");
  const [panel, setPanel] = useState<"calendar" | "templates">("calendar");
  const [anchor, setAnchor] = useState(today);
  const [query, setQuery] = useState("");
  const [rosterRequest, setRosterRequest] = useState<{ query: string; page: number; delay: number } | null>(null);
  const [rosterError, setRosterError] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("17:00");
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [assignmentDate, setAssignmentDate] = useState<string | null>(null);
  const [dragSource, setDragSource] = useState<DragSource | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [edited, setEdited] = useState(0);
  const searchInput = useRef<HTMLInputElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const days = getDays(anchor, view);
  const { employees, shifts: savedShifts } = roster.data;
  const patch = useMemo<ShiftPatch>(() => Object.fromEntries(Object.entries(changes).map(([key, { after }]) => [key, after])), [changes]);
  const shifts = useMemo(() => {
    const ids = new Set(employees.map(({ id }) => id));
    return patchShifts(savedShifts, Object.fromEntries(Object.entries(patch).filter(([key]) => ids.has(key.split("/")[0]))));
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
    return result;
  }, {
    version: initial.version, publishedAt: initial.publishedAt,
  } satisfies SaveResult);
  const dirty = edited !== (formState.savedEdit ?? 0);

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
    event.dataTransfer.effectAllowed = source.kind === "cell" ? "move" : "copy";
    event.dataTransfer.setData(shiftDragType, source.kind);
    setDragSource(source);
  }

  function canDrop(event: DragEvent<HTMLTableCellElement>, key: string) {
    return !pending && dragSource && event.dataTransfer.types.includes(shiftDragType) &&
      (dragSource.kind === "template" || dragSource.key !== key);
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
    const date = new Date(anchor);
    if (view === "month") {
      date.setUTCDate(1);
      date.setUTCMonth(date.getUTCMonth() + offset);
      setAnchor(dateKey(date));
      grid.current?.scrollTo({ left: 0 });
    } else {
      setAnchor(dateKey(addDays(date, offset * 7)));
    }
    setSelected([]);
  }

  function applyCustomShift() {
    const result = shiftSchema.safeParse({ name: "Своя смена", start, end, color: "amber" });
    if (!result.success) {
      setFeedback(result.error.issues[0].message);
      return;
    }
    applyShift(selected, result.data);
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

  const selectedEmployees = new Set(selected.map((key) => key.split("/")[0])).size;
  const selectedDays = new Set(selected.map((key) => key.split("/")[1])).size;
  const cellLabels: Partial<Record<Intl.LDMLPluralRule, string>> = { one: "ячейка", few: "ячейки" };
  const employeeLabels: Partial<Record<Intl.LDMLPluralRule, string>> = { one: "сотрудник", few: "сотрудника" };
  const cellLabel = cellLabels[dayCount.select(selected.length)] ?? "ячеек";
  const employeeLabel = employeeLabels[dayCount.select(selectedEmployees)] ?? "сотрудников";
  const coverage = days.map((day) => {
    const date = dateKey(day);
    const count = coverageCounts[date] ?? 0;
    return { date, count };
  });
  const dateLabel = view === "month" ? month.format(days[0]) : `${compactDate.format(days[0])} – ${compactDate.format(days[6])}`;

  return (
    <>
      <header className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-2 xl:mb-6 [@media(max-height:760px)]:mb-2">
        <h1 className="text-[22px] font-normal tracking-[-0.045em] sm:text-[32px]">График</h1>
        <form action={save}>
          <input type="hidden" name="payload" value={JSON.stringify({ data: { changes: patch, templates }, version: roster.version, edited })} />
          <SaveButtons rosterPending={!!rosterRequest} />
        </form>
      </header>
      <div aria-live="polite" className={cn("mb-2 shrink-0 text-sm text-[#636770] empty:hidden", dirty && !formState.error && "invisible")}>
        {formState.error
          ? <span className="text-red-700">{formState.error}</span>
          : formState.published ? "График опубликован"
          : formState.publishedAt ? `Опубликовано ${new Date(formState.publishedAt).toLocaleDateString("ru", { timeZone: "Europe/Moscow" })}`
          : null}
      </div>

      <div role="group" aria-label="Разделы графика" className="mb-2 grid shrink-0 grid-cols-2 gap-1 rounded-xl bg-white p-1 text-sm md:hidden">
        {([["calendar", "Календарь"], ["templates", "Шаблоны и смены"]] as const).map(([value, label]) => (
          <button key={value} type="button" aria-pressed={panel === value} onClick={() => setPanel(value)} className={cn(colorTransition, "min-h-9 rounded-lg px-2", panel === value && "bg-[#383943] text-white")}>{label}</button>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)] gap-2 md:grid-cols-[minmax(0,1fr)_minmax(230px,25%)]">
        <section aria-label="Календарь смен" className={cn("min-h-0 min-w-0 flex-col rounded-[20px] bg-white p-2 sm:p-3", panel === "calendar" ? "flex" : "hidden md:flex")}>
          {selected.length > 0 ? (
            <div role="group" aria-label="Быстрые действия" className="mb-2 flex min-h-10 shrink-0 flex-wrap sm:min-h-12 xl:mb-5 [@media(max-height:760px)]:mb-2 [@media(max-height:760px)]:min-h-10 items-center justify-between gap-1 rounded-lg bg-[#383943] px-2 py-1.5 text-xs text-white motion-safe:animate-schedule-actions xl:px-3 xl:text-sm">
              <div aria-live="polite" className="flex flex-wrap items-center gap-2">
                <span>Выделено</span>
                <Badge tone="muted">{selected.length} {cellLabel}</Badge>
                <span>{selectedEmployees} {employeeLabel} · {selectedDays} дн.</span>
              </div>
              <div className="flex flex-wrap items-center gap-0.5">
                <TemplateMenu templates={templates} disabled={pending} className={quickButton} onApply={(template) => applyShift(selected, template)} />
                <button type="button" disabled={pending} className={quickButton} onClick={() => setDialog({
                  kind: "shift", keys: selected,
                  title: selected.length === 1 ? "Изменить смену" : `Изменить смены · ${selected.length} ${cellLabel}`,
                  value: selected.length === 1 ? shifts[selected[0]] : undefined,
                })}><Icon name="edit" /> Изменить</button>
                <button type="button" disabled={pending || !selected.some((key) => shifts[key])} className={quickButton} onClick={() => clearShifts(selected)}><Icon name="trash" /> Очистить</button>
                <button type="button" className={quickButton} onClick={() => { setSelected([]); setFeedback(""); }}><Icon name="close" /> Снять</button>
              </div>
            </div>
          ) : (
            <div className="mb-2 flex shrink-0 flex-wrap items-center gap-1.5 xl:mb-5 [@media(max-height:760px)]:mb-2">
              <div className="flex h-10 min-w-36 flex-1 items-center gap-2 rounded-xl border border-transparent bg-[#eff0f4] px-3 text-[#7b7f89] focus-within:border-[#b7bac5] sm:h-12 xl:max-w-[398px] [@media(max-height:760px)]:h-10">
                <Icon name="search" />
                <input ref={searchInput} aria-label="Поиск по ФИО" type="search" maxLength={100} disabled={pending} placeholder="Поиск по ФИО" value={query} onChange={(event) => updateSearch(event.target.value)} className="min-w-0 flex-1 bg-transparent text-[#191a1e] outline-none placeholder:text-[#727680] [&::-webkit-search-cancel-button]:hidden" />
                {query && <button type="button" aria-label="Очистить поиск" disabled={pending} className={cn(iconButton, "-mr-2 size-7 [&>svg]:size-4")} onClick={() => { updateSearch(""); searchInput.current?.focus(); }}><Icon name="close" /></button>}
              </div>
              <div className="relative grid h-10 w-32 grid-cols-2 rounded-xl bg-[#eff0f4] p-0.5 text-sm sm:h-12 sm:w-48 2xl:w-[300px] 2xl:text-base [@media(max-height:760px)]:h-10" role="group" aria-label="Вид календаря">
                <span aria-hidden="true" className={cn(
                  "pointer-events-none absolute inset-y-0.5 left-0.5 w-[calc(50%-2px)] rounded-[10px] bg-[#383943] motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-out",
                  view === "week" && "translate-x-full",
                )} />
                {([["month", "Месяц"], ["week", "Неделя"]] as const).map(([value, label]) => (
                  <button type="button" key={value} aria-pressed={view === value} onClick={() => { if (view !== value) { setView(value); setSelected([]); grid.current?.scrollTo({ left: 0 }); } }} className={cn(colorTransition, "relative cursor-pointer rounded-[10px] focus-visible:outline-2 focus-visible:outline-[#5978ec]", view === value ? "text-white" : "hover:bg-[#383943]/8 active:bg-[#383943]/12")}>{label}</button>
                ))}
              </div>
              <div className="ml-auto flex items-center gap-1 text-sm whitespace-nowrap">
                <button type="button" aria-label="Предыдущий период" onClick={() => move(-1)} className={iconButton}><Icon name="left" /></button>
                <button type="button" title="Перейти к сегодняшней дате" onClick={() => { setAnchor(today); setSelected([]); grid.current?.scrollTo({ left: 0 }); }} className="min-h-8 cursor-pointer rounded-md px-1 hover:bg-[#eff0f4] active:bg-[#e2e4eb] first-letter:uppercase">{dateLabel}</button>
                <button type="button" aria-label="Следующий период" onClick={() => move(1)} className={iconButton}><Icon name="right" /></button>
              </div>
            </div>
          )}

          <div ref={grid} tabIndex={0} role="region" aria-label="Таблица смен" aria-busy={!!rosterRequest} className="min-h-0 flex-1 overflow-auto overscroll-contain [--employee-width:9rem] focus-visible:outline-2 focus-visible:outline-[#5978ec] sm:[--employee-width:12rem] xl:[--employee-width:13.75rem]">
            <table style={view === "month" ? { minWidth: `calc(var(--employee-width) + ${days.length * monthColumnWidth}px)` } : undefined} className={cn("h-full w-full table-fixed border-separate border-spacing-0 text-left text-sm sm:text-base", view === "week" && "min-w-[calc(var(--employee-width)+500px)]")}>
              <colgroup>
                <col className="w-[var(--employee-width)]" />
                {days.map((day) => <col style={view === "month" ? { width: monthColumnWidth } : undefined} key={dateKey(day)} />)}
              </colgroup>
              <thead className="sticky top-0 z-20 bg-white">
                <tr className="h-[60px] text-[#777b84]">
                  <th scope="col" className="sticky left-0 z-10 border-b border-[#e0e2e8] bg-white px-3 font-normal">Сотрудник</th>
                  {days.map((day) => (
                    <th scope="col" key={dateKey(day)} className={cn("border-b border-[#e0e2e8] px-1 text-center font-normal whitespace-nowrap", dateKey(day) === today && "font-semibold text-[#3157db]")}>
                      <button type="button" aria-haspopup="dialog" aria-label={`Быстро назначить смену: ${fullDate.format(day)}`} disabled={pending || !!rosterRequest} onClick={() => setAssignmentDate(dateKey(day))} className="cursor-pointer rounded-md px-1.5 py-0.5 enabled:hover:bg-[#eff0f4] focus-visible:outline-2 focus-visible:outline-[#5978ec] disabled:cursor-default">
                        {view === "month" ? (
                          <span className="grid justify-items-center text-xs leading-[18px]">
                            <span>{weekday.format(day)}</span>
                            <span className={dateKey(day) === today ? "text-[#3157db]" : "text-[#191a1e]"}>{day.getUTCDate()}</span>
                          </span>
                        ) : `${weekday.format(day)} ${day.getUTCDate()}`}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody key={`${view}:${dateKey(days[0])}`} className="motion-safe:animate-schedule-period">
                {employees.map(({ id, name, role, avatar }, index) => {
                  const total = days.reduce((sum, day) => {
                    const shift = shifts[shiftKey(id, dateKey(day))];
                    return sum + (shift ? duration(shift) : 0);
                  }, 0);

                  return (
                    <tr key={id} className={index % 2 ? "bg-[#f6f6f8]" : "bg-white"}>
                      <th scope="row" className="sticky left-0 z-10 bg-inherit px-2 py-2.5 font-normal">
                        <div className="flex items-center gap-2">
                          <EmployeeAvatar avatar={avatar} name={name} priority />
                          <div className="min-w-0">
                            <div title={name} className="truncate text-sm leading-5 tracking-[-0.02em] xl:text-[15px]">{name}</div>
                            <div className="mt-0.5 text-xs text-[#777b84]">{role} · {hours.format(total / 60)} ч</div>
                          </div>
                        </div>
                      </th>
                      {days.map((day) => {
                        const key = shiftKey(id, dateKey(day));
                        const shift = shifts[key];
                        const active = selected.includes(key);
                        const title = `${name}, ${fullDate.format(day)}`;
                        const editCell = () => setDialog({ kind: "shift", keys: [key], title, value: shift });
                        return (
                          <td key={key} className="group relative p-1" onDragOver={(event) => {
                            if (!dragSource || !canDrop(event, key)) return;
                            event.preventDefault();
                            event.dataTransfer.dropEffect = dragSource.kind === "cell" ? "move" : "copy";
                            setDropTarget(key);
                          }} onDragLeave={(event) => {
                            if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
                            setDropTarget((current) => current === key ? null : current);
                          }} onDrop={(event) => dropShift(event, key)}>
                            <button type="button" disabled={pending || !!rosterRequest} draggable={!!shift && !pending && !rosterRequest} onDragStart={(event) => startDrag(event, { kind: "cell", key })} onDragEnd={finishDrag} aria-pressed={active} aria-label={`${title}${shift ? `, ${shift.name}, ${shift.start}–${shift.end}` : ", без смены"}`} title={view === "month" && shift ? `${shift.name} · ${shift.start}–${shift.end}` : undefined} onClick={(event) => {
                              if (event.detail > 1) return;
                              setSelected((current) => current.includes(key) ? current.filter((value) => value !== key) : [...current, key]);
                              setFeedback("");
                            }} onDoubleClick={editCell} className={cn(
                              "flex h-12 w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-[9px] border px-1 text-sm leading-tight enabled:hover:border-[#5978ec] enabled:active:ring-1 enabled:active:ring-[#5978ec] disabled:cursor-default motion-safe:transition-[background-color,border-color,color,box-shadow] motion-safe:duration-150 xl:h-16 [@media(max-height:760px)]:h-12",
                              shift
                                ? active ? "border-transparent bg-[#5978ec] text-white" : cn("border-transparent enabled:hover:inset-ring-1 enabled:hover:inset-ring-[#5978ec]", shiftColors[shift.color])
                                : active ? "rounded-none border-solid border-[#5978ec] bg-[#e7ecff]" : "border-dashed border-[#dcdfe7] enabled:hover:bg-[#f0f4ff]",
                              shift && "enabled:cursor-grab enabled:active:cursor-grabbing",
                              dragSource?.kind === "cell" && dragSource.key === key && "opacity-50",
                              dropTarget === key && "border-solid border-[#5978ec] ring-2 ring-inset ring-[#5978ec]",
                            )}>
                              {shift ? <>
                                {view === "week" && <span className={cn("whitespace-nowrap", !active && "text-[#191a1e]")}>{shortTime(shift.start)} – {shortTime(shift.end)}</span>}
                                <span className={view === "week" ? "text-xs" : "font-medium sm:text-base"}>{hours.format(duration(shift) / 60)} ч</span>
                              </> : active && <span className="grid size-5 place-items-center rounded-full bg-[#5978ec] text-white motion-safe:animate-schedule-marker [&>svg]:size-3.5"><Icon name="plus" /></span>}
                            </button>
                            {shift && (
                              <button type="button" aria-label={`Изменить смену: ${title}`} disabled={pending || !!rosterRequest} onClick={editCell} className="absolute top-1.5 right-1.5 grid size-5 cursor-pointer place-items-center rounded bg-white/80 opacity-0 motion-safe:transition-opacity motion-safe:duration-150 group-hover:opacity-100 hover:bg-white focus-visible:opacity-100 [&>svg]:size-3">
                                <Icon name="edit" />
                              </button>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
                {!employees.length && <tr><td colSpan={days.length + 1} className="py-8 text-center text-[#777b84]">{roster.pagination.query ? "Сотрудники не найдены" : "Добавьте сотрудников на главной странице"}</td></tr>}
                <tr aria-hidden="true" className="h-full"><td colSpan={days.length + 1} /></tr>
              </tbody>
              <tfoot className="sticky bottom-0 z-20 bg-white">
                <tr>
                  <th scope="row" className="sticky left-0 z-10 border-t border-[#e0e2e8] bg-white px-3 py-2 font-normal text-[#777b84] sm:py-3">Покрытие</th>
                  {coverage.map(({ date, count }) => (
                    <td key={date} className={cn(
                      "border-t border-[#e0e2e8] py-2 text-center sm:py-3",
                      colorTransition,
                      count > 0 ? "bg-[#ebeffd] text-[#2047d9]" : "bg-[#fbe5e5] text-[#c93038]",
                    )}>{count}</td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
          {(roster.pagination.pageCount > 1 || rosterError || rosterRequest) && (
            <div className="mt-1 flex shrink-0 flex-wrap items-center justify-between gap-x-2 text-xs text-[#636770]">
              <span role="status">{rosterRequest ? "Загружаем сотрудников…" : rosterError || `Страница ${roster.pagination.page} из ${roster.pagination.pageCount} · всего ${roster.pagination.total}`}</span>
              {rosterError && <button type="button" onClick={() => requestRoster(query.trim(), 1)} className="min-h-8 rounded-md px-2 text-[#2047d9] hover:bg-[#eff0f4]">Повторить поиск</button>}
              {roster.pagination.pageCount > 1 && <nav aria-label="Страницы сотрудников" className="flex items-center">
                <button type="button" aria-label="Предыдущая страница сотрудников" disabled={pending || !!rosterRequest || roster.pagination.page === 1} onClick={() => requestRoster(roster.pagination.query, roster.pagination.page - 1)} className={iconButton}><Icon name="left" /></button>
                <button type="button" aria-label="Следующая страница сотрудников" disabled={pending || !!rosterRequest || roster.pagination.page === roster.pagination.pageCount} onClick={() => requestRoster(roster.pagination.query, roster.pagination.page + 1)} className={iconButton}><Icon name="right" /></button>
              </nav>}
            </div>
          )}
        </section>

        <aside aria-label="Назначение смен" className={cn("min-h-0 min-w-0 flex-col overflow-y-auto overscroll-contain rounded-xl bg-white p-3 xl:p-4", panel === "templates" ? "flex" : "hidden md:flex")}>
          <div className="mb-2 flex min-h-6 shrink-0 items-center justify-between">
            <h2 className="text-base font-normal">Шаблоны смен</h2>
            <button type="button" aria-label="Добавить шаблон" title="Добавить шаблон" disabled={pending || templates.length >= 50} onClick={() => setDialog({ kind: "template" })} className={cn(iconButton, "size-6 [&>svg]:size-4")}><Icon name="plus" /></button>
          </div>
          <div className="grid min-h-12 shrink content-start gap-1 overflow-y-auto overscroll-contain">
            {templates.map((template, index) => (
              <div key={template.id} className={cn("relative rounded-[9px] border-l-[3px] bg-[#eff0f4]", { blue: "border-[#b6c6ff]", violet: "border-[#d3acff]", green: "border-[#a4eadf]", amber: "border-[#f5d696]" }[template.color])}>
                <button
                  type="button" disabled={pending} draggable={!pending}
                  onDragStart={(event) => startDrag(event, { kind: "template", id: template.id })}
                  onDragEnd={finishDrag}
                  title={selected.length ? "Поставить в выделенные ячейки или перетащить в календарь" : "Перетащите в календарь или сначала выделите ячейки"}
                  onClick={() => {
                    if (!selected.length) { setFeedback("Выделите ячейки в календаре."); return; }
                    applyShift(selected, template);
                  }}
                  className="grid min-h-16 w-full content-center gap-0.5 rounded-[9px] py-2 pr-14 pl-3.5 text-left text-base leading-5 enabled:cursor-grab enabled:hover:bg-[#e5e8f0] enabled:active:cursor-grabbing enabled:active:bg-[#d5daeb] disabled:cursor-default disabled:opacity-50 motion-safe:transition-colors motion-safe:duration-150"
                >
                  <span className="truncate font-semibold">{template.name}</span>
                  <span>{template.start} – {template.end} · {hours.format(duration(template) / 60)} ч</span>
                </button>
                <button type="button" disabled={pending} aria-label={`Редактировать шаблон «${template.name}»`} title="Редактировать шаблон" className="absolute top-2 right-2 grid size-5 cursor-pointer place-items-center rounded-md bg-white text-xs hover:bg-[#dce4ff] [&>svg]:size-3.5" onClick={() => setDialog({ kind: "template", value: template })}>
                  {index < 9 ? index + 1 : <Icon name="edit" />}
                </button>
              </div>
            ))}
          </div>
          <form aria-labelledby="custom-shift-title" noValidate className="mt-4 shrink-0 xl:mt-6 [@media(max-height:760px)]:mt-3" onSubmit={(event) => {
            event.preventDefault();
            if (selected.length && !pending) applyCustomShift();
          }}>
            <h2 id="custom-shift-title" className="mb-2 text-base font-normal">Своя смена</h2>
            <div className="grid grid-cols-2 gap-2">
              <label className="grid gap-1 text-xs text-[#777b84]">Начало<input name="start" type="time" required value={start} onChange={(event) => { setStart(event.target.value); setFeedback(""); }} className={timeInputClass} /></label>
              <label className="grid gap-1 text-xs text-[#777b84]">Конец<input name="end" type="time" required value={end} onChange={(event) => { setEnd(event.target.value); setFeedback(""); }} className={timeInputClass} /></label>
            </div>
            <button type="submit" disabled={!selected.length || pending} className={cn(lightButton, "mt-2 w-full px-2 text-sm xl:text-base")}>
              <Icon name="plus" /> Поставить в выделенные
            </button>
          </form>
          <div aria-live="polite" className="mt-2 text-sm text-[#636770]">
            {feedback}
          </div>
        </aside>
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
        label={fullDate.format(new Date(assignmentDate))}
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
