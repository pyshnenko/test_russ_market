"use client";

import { useEffect, useRef } from "react";

export function VisitorNotification() {
  const reported = useRef(false);

  useEffect(() => {
    if (reported.current) return;
    reported.current = true;

    void fetch("/api/support-chat/visit", { method: "POST", keepalive: true }).catch(() => undefined);
  }, []);

  return null;
}
