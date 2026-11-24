"use client";

import { useId, useState } from "react";
import dynamic from "next/dynamic";
import ButtonBase from "@mui/material/ButtonBase";
import MenuItem from "@mui/material/MenuItem";
import clsx from "clsx";
import type { Template } from "@/lib/schedule";
import { Icon } from "./icon";
import { shiftColorStyle } from "./shift-color-style";
import styles from "./template-menu.module.css";

const Menu = dynamic(() => import("@mui/material/Menu"));

export function TemplateMenu({ templates, disabled, className, onApply }: {
  templates: Template[];
  disabled?: boolean;
  className: string;
  onApply: (template: Template) => void;
}) {
  const id = useId();
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const open = !!anchor;

  return (
    <>
      <ButtonBase id={`${id}-trigger`} type="button" aria-haspopup="menu" aria-expanded={open}
        aria-controls={open ? id : undefined} disabled={disabled || !templates.length}
        onClick={(event) => setAnchor(event.currentTarget)}
        onKeyDown={(event) => {
          if (event.key !== "ArrowDown") return;
          event.preventDefault();
          setAnchor(event.currentTarget);
        }}
        className={clsx(styles.trigger, className)}
      >
        <Icon name="grid" /> Применить шаблон
        <span className={styles.arrow}><Icon name="down" /></span>
      </ButtonBase>
      {open && <Menu
        anchorEl={anchor}
        open
        disableRestoreFocus
        onClose={(_, reason) => {
          setAnchor(null);
          if (reason === "escapeKeyDown") requestAnimationFrame(() => anchor.focus());
        }}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{
          paper: { className: styles.paper },
          list: { id, "aria-labelledby": `${id}-trigger`, className: styles.list },
        }}
      >
        {templates.map((template) => (
          <MenuItem key={template.id}
            className={styles.item}
            onClick={() => { setAnchor(null); onApply(template); }}>
            <span aria-hidden="true" data-color={template.color} style={shiftColorStyle(template.color)} className={styles.swatch}>
              <span className={styles.dot} />
            </span>
            <span className={styles.details}>
              <span className={styles.name}>{template.name}</span>
              <span className={styles.time}>{template.start} – {template.end}</span>
            </span>
          </MenuItem>
        ))}
      </Menu>}
    </>
  );
}
