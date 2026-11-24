import { duration, type Shift } from "@/lib/schedule";

import { Icon } from "./icon";
import styles from "./schedule-cell.module.css";

const hours = new Intl.NumberFormat("ru", { maximumFractionDigits: 2 });

function shortTime(time: string) {
  return time.endsWith(":00") ? time.slice(0, 2) : time;
}

export function ScheduleCell({
  cellKey, title, shift, compact, selected, disabled, dragging, dropTarget, onSelect, onEdit,
}: {
  cellKey: string;
  title: string;
  shift?: Shift;
  compact: boolean;
  selected: boolean;
  disabled: boolean;
  dragging: boolean;
  dropTarget: boolean;
  onSelect: () => void;
  onEdit: () => void;
}) {
  return (
    <td className={styles.cell} data-shift-drop-key={disabled ? undefined : cellKey}>
      <button
        type="button"
        disabled={disabled}
        data-shift-source={shift && !disabled ? cellKey : undefined}
        aria-pressed={selected}
        aria-label={shift ? `${title}, ${shift.name}, ${shift.start}–${shift.end}` : `${title}, без смены`}
        title={compact && shift ? `${shift.name} · ${shift.start}–${shift.end}` : undefined}
        onClick={(event) => { if (event.detail <= 1) onSelect(); }}
        onDoubleClick={onEdit}
        data-tone={shift?.color}
        data-dragging={dragging || undefined}
        data-drop-target={dropTarget || undefined}
        className={styles.shift}
      >
        {shift ? (
          <>
            {!compact && (
              <span className={styles.time}>
                {shortTime(shift.start)} – {shortTime(shift.end)}
              </span>
            )}
            <span className={compact ? styles.compactDuration : styles.duration}>{hours.format(duration(shift) / 60)} ч</span>
          </>
        ) : (
          <span aria-hidden="true" className={styles.marker}><Icon name="plus" /></span>
        )}
      </button>
      {shift && (
        <button
          type="button"
          aria-label={`Изменить смену: ${title}`}
          disabled={disabled}
          onClick={onEdit}
          className={styles.edit}
        ><Icon name="edit" /></button>
      )}
    </td>
  );
}
