import { redirect } from "next/navigation";
import { ScheduleEditor } from "@/components/features/schedule-editor";
import { ScheduleUnavailable } from "@/components/features/schedule-unavailable";
import { isDemo, workspaceId } from "@/lib/access";
import { getDatabaseErrorCode, isDatabaseUnavailable } from "@/lib/database-errors";
import { loadSchedulePage, todayInMoscow } from "@/lib/schedule-page";
import { getDays, periodOf } from "@/lib/schedule-calendar";

export const dynamic = "force-dynamic";

export default async function SchedulePage() {
  const id = await workspaceId();
  if (!id && !isDemo()) redirect("/login");
  const today = todayInMoscow();
  const period = periodOf(getDays(today, "week"));
  const snapshot = await loadSchedulePage(id, { query: "", page: 1, period }).catch((error: unknown) => {
    if (!isDatabaseUnavailable(error)) throw error;
    console.warn("Schedule database unavailable", getDatabaseErrorCode(error));
    return null;
  });
  if (!snapshot) return <ScheduleUnavailable />;

  return <ScheduleEditor initial={snapshot} today={today} />;
}
