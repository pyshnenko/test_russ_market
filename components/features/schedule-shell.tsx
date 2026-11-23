"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import clsx from "clsx";
import ButtonBase from "@mui/material/ButtonBase";
import styles from "./schedule-shell.module.css";
import { Icon } from "./icon";

export function ScheduleShell({ children, section = "schedule" }: { children: ReactNode; section?: "employees" | "schedule" }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className={styles.shell}>
      <aside data-collapsed={collapsed || undefined} className={styles.sidebar}>
        <div className={styles.brand}>
          <span className={styles.name}>CRM</span>
          {!collapsed && <Icon name="bell" />}
        </div>
        <nav aria-label="Разделы CRM" className={styles.nav}>
          <Link href="/employees" aria-current={section === "employees" ? "page" : undefined} className={styles.navItem} aria-label="Главная">
            <Icon name="home" />{!collapsed && "Главная"}
          </Link>
          <Link href="/" aria-current={section === "schedule" ? "page" : undefined} className={styles.navItem} aria-label="Смены">
            <Icon name="calendar" />{!collapsed && "Смены"}
          </Link>
        </nav>
        <ButtonBase
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? "Развернуть меню" : "Свернуть меню"}
          className={clsx(styles.navItem, styles.collapse)}
        >
          <Icon name="panel" />{!collapsed && "Свернуть меню"}
        </ButtonBase>
      </aside>
      <main className={styles.main}>
        <div className={styles.breadcrumb}>
          <Link href={section === "schedule" ? "/employees" : "/"} aria-label={section === "schedule" ? "На главную" : "К графику смен"} className={styles.backLink}>
            <Icon name="left" />
          </Link>
          <span>{section === "schedule" ? "Графики смен" : "Главная"}</span>
          {section === "employees" && <Link href="/" className={styles.mobileLink}>Смены</Link>}
        </div>
        {children}
      </main>
    </div>
  );
}
