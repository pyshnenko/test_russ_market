import { useRef } from "react";
import { Badge } from "@/components/ui/badge";
import ButtonBase from "@mui/material/ButtonBase";
import InputBase from "@mui/material/InputBase";
import styles from "./schedule-toolbar.module.css";
import { parseShiftKey, type SchedulePageData, type Template } from "@/lib/schedule";
import type { ScheduleView } from "@/lib/schedule-calendar";
import { Icon } from "./icon";
import { ScheduleIconButton } from "./schedule-buttons";
import { SchedulePeriodPicker } from "./schedule-period-picker";
import { TemplateMenu } from "./template-menu";

const dayCount = new Intl.PluralRules("ru");
const cellLabels: Partial<Record<Intl.LDMLPluralRule, string>> = { one: "ячейка", few: "ячейки" };
const employeeLabels: Partial<Record<Intl.LDMLPluralRule, string>> = { one: "сотрудник", few: "сотрудника" };

export function ScheduleSelectionActions({
  selected, templates, pending, canClear, onApply, onEdit, onClear, onDeselect,
}: {
  selected: string[];
  templates: Template[];
  pending: boolean;
  canClear: boolean;
  onApply: (template: Template) => void;
  onEdit: (title: string) => void;
  onClear: () => void;
  onDeselect: () => void;
}) {
  const employeeIds = new Set<string>();
  const dates = new Set<string>();
  for (const key of selected) {
    const cell = parseShiftKey(key);
    if (!cell) continue;
    employeeIds.add(cell.employeeId);
    dates.add(cell.date);
  }
  const people = employeeIds.size;
  const days = dates.size;
  const cellLabel = cellLabels[dayCount.select(selected.length)] ?? "ячеек";
  const employeeLabel = employeeLabels[dayCount.select(people)] ?? "сотрудников";
  const editTitle = selected.length === 1 ? "Изменить смену" : `Изменить смены · ${selected.length} ${cellLabel}`;

  return (
    <div role="group" aria-label="Быстрые действия" className={styles.selection}>
      <div aria-live="polite" className={styles.summary}>
        <span>Выделено</span>
        <Badge tone="muted">{selected.length} {cellLabel}</Badge>
        <span>{people} {employeeLabel} · {days} дн.</span>
      </div>
      <div className={styles.actions}>
        <TemplateMenu templates={templates} disabled={pending} className={styles.action} onApply={onApply} />
        <ButtonBase type="button" disabled={pending} className={styles.action} onClick={() => onEdit(editTitle)}><Icon name="edit" /> Изменить</ButtonBase>
        <ButtonBase type="button" disabled={pending || !canClear} className={styles.action} onClick={onClear}><Icon name="trash" /> Очистить</ButtonBase>
        <ButtonBase type="button" className={styles.action} onClick={onDeselect}><Icon name="close" /> Снять</ButtonBase>
      </div>
    </div>
  );
}

export function ScheduleToolbar({ query, pending, view, anchor, today, dateLabel, onSearch, onChangeView, onMove, onSelectPeriod }: {
  query: string;
  pending: boolean;
  view: ScheduleView;
  anchor: string;
  today: string;
  dateLabel: string;
  onSearch: (value: string) => void;
  onChangeView: (view: ScheduleView) => void;
  onMove: (offset: -1 | 1) => void;
  onSelectPeriod: (date: string) => void;
}) {
  const searchInput = useRef<HTMLInputElement>(null);

  return (
    <div className={styles.toolbar}>
      <div className={styles.search}>
        <Icon name="search" />
        <InputBase
          inputRef={searchInput} type="search" disabled={pending}
          placeholder="Поиск по ФИО" value={query}
          onChange={(event) => onSearch(event.target.value)}
          inputProps={{ "aria-label": "Поиск по ФИО", maxLength: 100 }}
          className={styles.searchField} classes={{ input: styles.searchInput }}
        />
        {query && <ScheduleIconButton
          aria-label="Очистить поиск" disabled={pending} className={styles.clearButton}
          onClick={() => { onSearch(""); searchInput.current?.focus(); }}
        ><Icon name="close" /></ScheduleIconButton>}
      </div>
      <div role="group" aria-label="Вид календаря" data-view={view} className={styles.views}>
        <span aria-hidden="true" className={styles.selectionIndicator} />
        {([["month", "Месяц"], ["week", "Неделя"]] as const).map(([value, label]) => (
          <button
            type="button" key={value} aria-pressed={view === value} onClick={() => onChangeView(value)}
            className={styles.viewButton}
          >{label}</button>
        ))}
      </div>
      <div className={styles.period}>
        <ScheduleIconButton aria-label="Предыдущий период" onClick={() => onMove(-1)}><Icon name="left" /></ScheduleIconButton>
        <SchedulePeriodPicker view={view} label={dateLabel} anchor={anchor} today={today} onSelect={onSelectPeriod} />
        <ScheduleIconButton aria-label="Следующий период" onClick={() => onMove(1)}><Icon name="right" /></ScheduleIconButton>
      </div>
    </div>
  );
}

export function SchedulePagination({ pagination, error, loading, pending, onPage, onRetry }: {
  pagination: SchedulePageData["pagination"];
  error: string;
  loading: boolean;
  pending: boolean;
  onPage: (page: number) => void;
  onRetry: () => void;
}) {
  const { page, pageCount, total } = pagination;
  if (pageCount <= 1 && !error && !loading) return null;

  return (
    <div className={styles.pagination}>
      <span role="status">{loading ? "Загружаем сотрудников…" : error || `Страница ${page} из ${pageCount} · всего ${total}`}</span>
      {error && <button type="button" onClick={onRetry} className={styles.retry}>Повторить поиск</button>}
      {pageCount > 1 && <nav aria-label="Страницы сотрудников" className={styles.pageButtons}>
        <ScheduleIconButton aria-label="Предыдущая страница сотрудников" disabled={pending || loading || page === 1} onClick={() => onPage(page - 1)}><Icon name="left" /></ScheduleIconButton>
        <ScheduleIconButton aria-label="Следующая страница сотрудников" disabled={pending || loading || page === pageCount} onClick={() => onPage(page + 1)}><Icon name="right" /></ScheduleIconButton>
      </nav>}
    </div>
  );
}
