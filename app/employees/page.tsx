import { redirect } from "next/navigation";
import styles from "./page.module.css";
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
      <header className={styles.header}>
        <h1 className={styles.title}>Сотрудники</h1>
        <EmployeeControls version={snapshot.version} disabled={employees.length >= maxEmployees} />
      </header>
      <div className={styles.listContainer}>
        {employees.length ? (
          <ul className={styles.list}>
            {employees.map((employee) => (
              <li key={employee.id} className={styles.card}>
                <div className={styles.profile}>
                  <EmployeeAvatar avatar={employee.avatar} name={employee.name} size={72} />
                  <div className={styles.details}>
                    <h2 className={styles.name}>{employee.name}</h2>
                    <p className={styles.role}>{employee.role}</p>
                  </div>
                </div>
                <EmployeeControls employee={employee} version={snapshot.version} />
              </li>
            ))}
          </ul>
        ) : <p className={styles.empty}>Добавьте первого сотрудника, чтобы назначать ему смены.</p>}
      </div>
    </ScheduleShell>
  );
}
