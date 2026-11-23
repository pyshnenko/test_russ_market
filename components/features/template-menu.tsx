"use client";

import { useId, useState } from "react";
import dynamic from "next/dynamic";
import MenuItem from "@mui/material/MenuItem";
import { cn } from "@/lib/cn";
import { colors, type Template } from "@/lib/schedule";
import { Icon } from "./icon";

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
      <button id={`${id}-trigger`} type="button" aria-haspopup="menu" aria-expanded={open}
        aria-controls={open ? id : undefined} disabled={disabled || !templates.length}
        onClick={(event) => setAnchor(event.currentTarget)}
        onKeyDown={(event) => {
          if (event.key !== "ArrowDown") return;
          event.preventDefault();
          setAnchor(event.currentTarget);
        }}
        className={cn(className, "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white", open && "bg-white/15")}
      >
        <Icon name="grid" /> Применить шаблон
        <span className={cn("motion-safe:transition-transform [&>svg]:size-3.5", open && "rotate-180")}><Icon name="down" /></span>
      </button>
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
          paper: { className: "mt-2 max-h-[min(24rem,60dvh)]! min-w-56 rounded-xl! border border-[#e4e6ed] shadow-[0_12px_32px_rgba(31,36,55,0.15)]!" },
          list: { id, "aria-labelledby": `${id}-trigger`, className: "grid gap-0.5 p-1.5!" },
        }}
      >
        {templates.map((template) => (
          <MenuItem key={template.id}
            className="min-h-11! gap-2.5 rounded-lg! px-2.5! py-1.5! hover:bg-[#eff0f4]! focus:bg-[#e7ecff]! motion-safe:transition-colors"
            onClick={() => { setAnchor(null); onApply(template); }}>
            <span aria-hidden="true" className={cn("grid size-6 shrink-0 place-items-center rounded-md", colors[template.color].className)}>
              <span className="size-2 rounded-full bg-current" />
            </span>
            <span className="grid min-w-0">
              <span className="truncate text-sm font-medium text-[#191a1e]">{template.name}</span>
              <span className="text-xs text-[#636770]">{template.start} – {template.end}</span>
            </span>
          </MenuItem>
        ))}
      </Menu>}
    </>
  );
}
