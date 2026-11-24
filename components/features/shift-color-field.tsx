import { useId, useState } from "react";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import { colors, type PresetShiftColor } from "@/lib/schedule";
import { Icon } from "./icon";
import { shiftColorStyle } from "./shift-color-style";
import styles from "./shift-color-field.module.css";

const palette = [
  "#d44356", "#e1649a", "#aa63d8", "#785ee6", "#5079dc", "#288da9",
  "#168c74", "#51965c", "#829b35", "#bd8a24", "#d77336", "#67788f",
];
const presets = Object.keys(colors) as PresetShiftColor[];

function isPreset(color: string): color is PresetShiftColor {
  return Object.hasOwn(colors, color);
}

function Swatch({ color }: { color: string }) {
  return <span aria-hidden="true" className={styles.swatch} style={shiftColorStyle(color)} />;
}

export function ShiftColorField({ initial = "blue" }: { initial?: string }) {
  const labelId = useId();
  const [choice, setChoice] = useState<PresetShiftColor | "custom">(isPreset(initial) ? initial : "custom");
  const [customColor, setCustomColor] = useState(isPreset(initial) ? colors[initial].hex : initial);
  // The menu uses "custom" only as a choice. The form contract accepts a preset or a HEX value.
  const color = choice === "custom" ? customColor : choice;

  return (
    <div className={styles.field}>
      <span id={labelId}>Цвет</span>
      <input type="hidden" name="color" value={color} />
      <Select
        labelId={labelId}
        variant="standard"
        disableUnderline
        value={choice}
        className={styles.select}
        classes={{ select: styles.selectedValue }}
        onChange={(event) => {
          const value = event.target.value;
          if (value === "custom" || isPreset(value)) setChoice(value);
        }}
        renderValue={(value) => value === "custom"
          ? <><Swatch color={customColor} /><span>Свой цвет</span><span className={styles.code}>{customColor.toUpperCase()}</span></>
          : <><Swatch color={colors[value].hex} /><span>{colors[value].name}</span></>}
        MenuProps={{ slotProps: { paper: { className: styles.menu }, list: { className: styles.options } } }}
      >
        {presets.map((preset) => (
          <MenuItem key={preset} value={preset} className={styles.option}>
            <Swatch color={colors[preset].hex} />
            {colors[preset].name}
          </MenuItem>
        ))}
        <MenuItem value="custom" className={styles.option}>
          <span aria-hidden="true" className={styles.paletteIcon}><Icon name="plus" /></span>
          Свой цвет
        </MenuItem>
      </Select>

      {choice === "custom" && (
        <fieldset className={styles.palette}>
          <legend>Палитра</legend>
          <div className={styles.swatches}>
            {palette.map((shade) => (
              <button
                key={shade}
                type="button"
                aria-label={`Цвет ${shade.toUpperCase()}`}
                aria-pressed={customColor.toLowerCase() === shade}
                className={styles.paletteButton}
                style={shiftColorStyle(shade)}
                onClick={() => setCustomColor(shade)}
              />
            ))}
          </div>
          <label className={styles.custom}>
            <input type="color" value={customColor} onChange={(event) => setCustomColor(event.target.value)} />
            <span>Выбрать оттенок</span>
          </label>
        </fieldset>
      )}
    </div>
  );
}
