"use client";

import { startTransition, useEffect, useRef } from "react";
import { notifyVisitor } from "@/app/visitor-actions";

export function VisitorNotification() {
  const reported = useRef(false);

  useEffect(() => {
    if (reported.current) return;
    reported.current = true;

    startTransition(async () => {
      await notifyVisitor("page-opened").catch(() => undefined);
    });
  }, []);

  return null;
}
