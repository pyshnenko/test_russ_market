import type { ReactNode } from "react";
import { ScheduleShell } from "@/components/features/schedule-shell";

export default function CrmLayout({ children }: { children: ReactNode }) {
  return <ScheduleShell>{children}</ScheduleShell>;
}
