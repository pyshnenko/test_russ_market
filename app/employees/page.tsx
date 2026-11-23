import { redirect } from "next/navigation";
import { EmployeeAvatar } from "@/components/features/employee-avatar";
import { EmployeeControls } from "@/components/features/employee-controls";
import { ScheduleShell } from "@/components/features/schedule-shell";
import { ScheduleUnavailable } from "@/components/features/schedule-unavailable";
import { isDemo, workspaceId } from "@/lib/access";
import { getDatabaseErrorCode, isDatabaseUnavailable } from "@/lib/database-errors";
import { loadSchedule } from "@/lib/repository";
import { maxEmployees } from "@/lib/schedule";

export const dynamic = "force-dynamic";

export default async function EmployeesPage() {
  const id = await workspaceId();
  if (!id && !isDemo()) redirect("/login");
  const snapshot = await loadSchedule(id).catch((error: unknown) => {
    if (!isDatabaseUnavailable(error)) throw error;
    console.warn("Employee database unavailable", getDatabaseErrorCode(error));
    return null;
  });
  if (!snapshot) return <ScheduleShell section="employees"><ScheduleUnavailable title="Список сотрудников временно недоступен" /></ScheduleShell>;

  const { employees } = snapshot.data;
  return (
    <ScheduleShell section="employees">
      <header className="mb-4 flex shrink-0 flex-wrap items-center justify-between gap-3 xl:mb-6">
        <h1 className="text-[28px] tracking-[-0.04em] sm:text-[32px]">Сотрудники</h1>
        <EmployeeControls version={snapshot.version} disabled={employees.length >= maxEmployees} />
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-3">
        {employees.length ? (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {employees.map((employee) => (
              <li key={employee.id} className="grid min-w-0 content-between gap-5 rounded-2xl bg-white p-4 sm:p-5">
                <div className="flex items-center gap-3">
                  <EmployeeAvatar avatar={employee.avatar} name={employee.name} size={72} />
                  <div className="min-w-0">
                    <h2 className="font-medium wrap-break-word">{employee.name}</h2>
                    <p className="mt-1 text-sm wrap-break-word text-[#636770]">{employee.role}</p>
                  </div>
                </div>
                <EmployeeControls employee={employee} version={snapshot.version} />
              </li>
            ))}
          </ul>
        ) : <p className="rounded-2xl bg-white p-6 text-[#636770]">Добавьте первого сотрудника, чтобы назначать ему смены.</p>}
      </div>
    </ScheduleShell>
  );
}
