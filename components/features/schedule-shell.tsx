"use client";

import { useEffect, useLayoutEffect, useRef, useState, ViewTransition, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import ButtonBase from "@mui/material/ButtonBase";
import styles from "./schedule-shell.module.css";
import { Icon } from "./icon";

const toEmployees = ["crm-to-employees"];
const toSchedule = ["crm-to-schedule"];
const pageTransition = {
  "crm-to-employees": "crm-backward",
  "crm-to-schedule": "crm-forward",
  default: "none",
};

export function ScheduleShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const isSchedule = pathname === "/";
  const content = useRef<HTMLDivElement>(null);
  const historyDestination = useRef<string | null>(null);

  useEffect(() => {
    const noteHistoryDestination = () => { historyDestination.current = window.location.pathname; };
    window.addEventListener("popstate", noteHistoryDestination, true);
    return () => window.removeEventListener("popstate", noteHistoryDestination, true);
  }, []);

  useLayoutEffect(() => {
    const destination = historyDestination.current;
    historyDestination.current = null;
    if (destination !== pathname) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const animation = content.current?.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: 200, easing: "ease-out",
    });
    return () => animation?.cancel();
  }, [pathname]);

  return (
    <div className={styles.shell}>
      <aside data-collapsed={collapsed || undefined} className={styles.sidebar}>
        <div className={styles.brand}>
          <span className={styles.name}>CRM</span>
          {!collapsed && <Icon name="bell" />}
        </div>
        <nav aria-label="Разделы CRM" className={styles.nav}>
          <Link href="/employees" transitionTypes={toEmployees} aria-current={!isSchedule ? "page" : undefined} className={styles.navItem} aria-label="Главная">
            <Icon name="home" />{!collapsed && "Главная"}
          </Link>
          <Link href="/" transitionTypes={toSchedule} aria-current={isSchedule ? "page" : undefined} className={styles.navItem} aria-label="Смены">
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
        <ViewTransition key={pathname} name="crm-content" share={pageTransition} default="none">
          <div ref={content} className={styles.content}>
            <div className={styles.breadcrumb}>
              <Link href={isSchedule ? "/employees" : "/"} transitionTypes={isSchedule ? toEmployees : toSchedule}
                aria-label={isSchedule ? "На главную" : "К графику смен"} className={styles.backLink}>
                <Icon name="left" />
              </Link>
              <span>{isSchedule ? "Графики смен" : "Главная"}</span>
              {!isSchedule && <Link href="/" transitionTypes={toSchedule} className={styles.mobileLink}>Смены</Link>}
            </div>
            {children}
          </div>
        </ViewTransition>
      </main>
    </div>
  );
}
