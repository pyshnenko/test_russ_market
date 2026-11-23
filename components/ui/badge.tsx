import type { ReactNode } from "react";
import clsx from "clsx";
import styles from "./badge.module.css";

export function Badge({ children, tone = "dark" }: { children: ReactNode; tone?: "blue" | "dark" | "muted" }) {
  return <span className={clsx(styles.badge, styles[tone])}>{children}</span>;
}
