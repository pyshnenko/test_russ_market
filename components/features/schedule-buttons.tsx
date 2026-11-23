import Button, { type ButtonProps } from "@mui/material/Button";
import IconButton, { type IconButtonProps } from "@mui/material/IconButton";
import clsx from "clsx";
import styles from "./schedule-buttons.module.css";

export function ScheduleButton({ variant, className, ...props }: Omit<ButtonProps, "variant"> & {
  variant: "primary" | "secondary";
}) {
  return <Button {...props} variant="contained" className={clsx(styles.button, styles[variant], className)} />;
}

export function ScheduleIconButton({ className, ...props }: IconButtonProps) {
  return <IconButton type="button" {...props} className={clsx(styles.iconButton, className)} />;
}
