import { redirect } from "next/navigation";
import { ScheduleEditor } from "@/components/features/schedule-editor";
import { ScheduleUnavailable } from "@/components/features/schedule-unavailable";
import { isDemo, workspaceId } from "@/lib/access";
import { getDatabaseErrorCode, isDatabaseUnavailable } from "@/lib/database-errors";
import { loadSchedulePage } from "@/lib/schedule-page";

export const dynamic = "force-dynamic";

export default async function SchedulePage() {
  const id = await workspaceId();
  if (!id && !isDemo()) redirect("/login");
  const snapshot = await loadSchedulePage(id, { query: "", page: 1 }).catch((error: unknown) => {
    if (!isDatabaseUnavailable(error)) throw error;
    console.warn("Schedule database unavailable", getDatabaseErrorCode(error));
    return null;
  });
  if (!snapshot) return <ScheduleUnavailable />;
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Moscow" }).format(new Date());

  return <ScheduleEditor initial={snapshot} today={today} />;
}
