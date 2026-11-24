import type { CSSProperties } from "react";
import { hexShiftColor } from "@/lib/schedule";

export function shiftColorStyle(color?: string): CSSProperties | undefined {
  if (!color || !hexShiftColor.test(color)) return;
  return { "--shift-color": color } as CSSProperties;
}
