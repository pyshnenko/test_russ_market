import { redirect } from "next/navigation";
import Link from "next/link";
import styles from "./page.module.css";
import { EmployeeAvatar } from "@/components/features/employee-avatar";
import { EmployeeControls } from "@/components/features/employee-controls";
import { ScheduleUnavailable } from "@/components/features/schedule-unavailable";
import { isDemo, workspaceId } from "@/lib/access";
import { getDatabaseErrorCode, isDatabaseUnavailable } from "@/lib/database-errors";
import { readEmployeePage } from "@/lib/repository";
import { maxEmployees } from "@/lib/schedule";
import { pageNumberSchema } from "@/lib/schedule-page";

export const dynamic = "force-dynamic";

export default async function EmployeesPage({ searchParams }: PageProps<"/employees">) {
  const [id, params] = await Promise.all([workspaceId(), searchParams]);
  if (!id && !isDemo()) redirect("/login");
  const requestedPage = pageNumberSchema.catch(1).parse(typeof params.page === "string" ? params.page : undefined);
  const snapshot = await readEmployeePage(id, requestedPage).catch((error: unknown) => {
    if (!isDatabaseUnavailable(error)) throw error;
    console.warn("Employee database unavailable", getDatabaseErrorCode(error));
    return null;
  });
  if (!snapshot) return <ScheduleUnavailable title="Список сотрудников временно недоступен" />;

  const { employees, pagination: { page, pageCount, total } } = snapshot;
  return (
    <>
      <header className={styles.header}>
        <h1 className={styles.title}>Сотрудники</h1>
        <EmployeeControls version={snapshot.version} disabled={total >= maxEmployees} />
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
      {pageCount > 1 && (
        <nav aria-label="Страницы сотрудников" className={styles.pagination}>
          {page > 1 && <Link href={page === 2 ? "/employees" : `/employees?page=${page - 1}`}>Назад</Link>}
          <span>Страница {page} из {pageCount} · всего {total}</span>
          {page < pageCount && <Link href={`/employees?page=${page + 1}`}>Далее</Link>}
        </nav>
      )}
    </>
  );
}
