"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { Icon } from "./icon";

export function ScheduleShell({ children, section = "schedule" }: { children: ReactNode; section?: "employees" | "schedule" }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="flex h-dvh overflow-hidden">
      <aside className={cn(
        "hidden min-h-0 shrink-0 flex-col border-r border-[#e4e6ed] px-3.5 py-6 motion-safe:transition-[width] motion-safe:duration-200 motion-safe:ease-out lg:flex",
        collapsed ? "w-19" : "w-44 xl:w-[clamp(12rem,16.5vw,17.5rem)]",
      )}>
        <div className="mb-6 flex items-center justify-between pr-4">
          <span className="text-xl tracking-tight">CRM</span>
          {!collapsed && <Icon name="bell" />}
        </div>
        <nav aria-label="Разделы CRM" className="grid gap-1">
          <Link href="/employees" aria-current={section === "employees" ? "page" : undefined} className={cn("flex h-10 items-center gap-3 rounded-lg px-2 hover:bg-white/60", section === "employees" && "bg-white")} aria-label="Главная">
            <Icon name="home" />{!collapsed && "Главная"}
          </Link>
          <Link href="/" aria-current={section === "schedule" ? "page" : undefined} className={cn("flex h-10 items-center gap-3 rounded-lg px-2 hover:bg-white/60", section === "schedule" && "bg-white")} aria-label="Смены">
            <Icon name="calendar" />{!collapsed && "Смены"}
          </Link>
        </nav>
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? "Развернуть меню" : "Свернуть меню"}
          className="mt-auto flex h-10 cursor-pointer items-center gap-3 rounded-lg px-2 hover:bg-white/60"
        >
          <Icon name="panel" />{!collapsed && "Свернуть меню"}
        </button>
      </aside>
      <main className="flex min-h-0 min-w-0 flex-1 flex-col px-3 py-3 sm:px-6 xl:px-[30px] xl:py-6 [@media(max-height:760px)]:py-2">
        <div className="mb-4 flex shrink-0 items-center gap-3.5 xl:mb-6 [@media(max-height:760px)]:mb-2">
          <Link href={section === "schedule" ? "/employees" : "/"} aria-label={section === "schedule" ? "На главную" : "К графику смен"} className="grid size-10 place-items-center rounded-full bg-white hover:bg-[#e6e8ee]">
            <Icon name="left" />
          </Link>
          <span>{section === "schedule" ? "Графики смен" : "Главная"}</span>
          {section === "employees" && <Link href="/" className="ml-auto rounded-lg bg-white px-3 py-2 text-sm lg:hidden">Смены</Link>}
        </div>
        {children}
      </main>
    </div>
  );
}
