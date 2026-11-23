"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import dynamic from "next/dynamic";
import { mutateEmployee } from "@/app/employees/actions";
import { cn } from "@/lib/cn";
import type { Employee } from "@/lib/schedule";
import { EmployeeAvatar } from "./employee-avatar";
import { Icon } from "./icon";

const Dialog = dynamic(() => import("@mui/material/Dialog"));
const primary = "inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-lg bg-[#5978ec] px-4 py-2 text-sm font-medium text-white hover:bg-[#2047d9] disabled:cursor-default disabled:opacity-60 motion-safe:transition-colors";
const secondary = "inline-flex min-h-9 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-[#eff0f4] px-3 py-2 text-sm hover:bg-[#e2e4eb] disabled:cursor-default disabled:opacity-60 motion-safe:transition-colors";
const field = "mt-1 w-full rounded-lg bg-[#eff0f4] px-3 py-2.5 outline-none focus-visible:ring-2 focus-visible:ring-[#5978ec]";

type Intent = "create" | "edit" | "delete";

function EmployeeSubmit({ intent }: { intent: Intent }) {
  const { pending } = useFormStatus();
  return <button disabled={pending} className={cn(primary, intent === "delete" && "bg-red-700 hover:bg-red-800")}>
    {pending ? "Сохранение…" : intent === "delete" ? "Удалить сотрудника" : "Сохранить"}
  </button>;
}

function EmployeeDialog({ intent, employee, version, onClose }: {
  intent: Intent;
  employee?: Employee;
  version: number;
  onClose: () => void;
}) {
  const [result, action, pending] = useActionState(mutateEmployee, {});
  const [name, setName] = useState(employee?.name ?? "");
  const [role, setRole] = useState(employee?.role ?? "");
  const [preview, setPreview] = useState<string | null>(null);
  const [removeAvatar, setRemoveAvatar] = useState(false);

  useEffect(() => {
    if (result.success) onClose();
  }, [result.success, onClose]);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const title = intent === "create" ? "Новый сотрудник" : intent === "edit" ? "Редактировать сотрудника" : "Удалить сотрудника";
  return (
    <Dialog open onClose={pending ? undefined : onClose} aria-labelledby="employee-dialog-title" fullWidth maxWidth="xs">
      <form action={action} onReset={() => setPreview(null)} className="grid gap-4 overflow-y-auto p-5 text-sm sm:p-6">
        <h2 id="employee-dialog-title" className="text-xl font-medium">{title}</h2>
        <input type="hidden" name="intent" value={intent} />
        <input type="hidden" name="version" value={version} />
        {employee && <input type="hidden" name="id" value={employee.id} />}
        {intent === "delete" ? (
          <p>Удалить <strong>{employee?.name}</strong> и все назначенные этому сотруднику смены из черновика графика?</p>
        ) : (
          <fieldset disabled={pending} className="grid gap-4">
            <label>ФИО<input name="name" autoFocus required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} className={field} /></label>
            <label>Должность<input name="role" required maxLength={80} value={role} onChange={(event) => setRole(event.target.value)} className={field} /></label>
            <div className="flex flex-wrap items-center gap-3">
              <EmployeeAvatar avatar={preview ?? (removeAvatar ? null : employee?.avatar ?? null)} name={name} size={72} />
              <label className="min-w-0 flex-1">
                <span>Аватар</span>
                <input name="avatar" type="file" accept="image/jpeg,image/png,image/webp" className="mt-1 block w-full text-xs file:mr-2 file:cursor-pointer file:rounded-lg file:border-0 file:bg-[#e7ecff] file:px-3 file:py-2 file:text-[#2047d9]" onChange={(event) => {
                  const file = event.target.files?.[0];
                  setPreview(file && file.size <= 5 * 1024 * 1024 ? URL.createObjectURL(file) : null);
                }} aria-describedby="avatar-format" />
                <span id="avatar-format" className="mt-1 block text-xs text-[#636770]">JPEG, PNG или WebP, до 5 МБ</span>
              </label>
            </div>
            {employee?.avatar && !preview && (
              <label className="flex items-center gap-2">
                <input type="checkbox" name="removeAvatar" checked={removeAvatar} onChange={(event) => setRemoveAvatar(event.target.checked)} className="accent-[#5978ec]" />
                Удалить текущий аватар
              </label>
            )}
          </fieldset>
        )}
        {result.error && <p role="alert" className="text-red-700">{result.error}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" disabled={pending} className={secondary} onClick={onClose}>Отмена</button>
          <EmployeeSubmit intent={intent} />
        </div>
      </form>
    </Dialog>
  );
}

export function EmployeeControls({ employee, version, disabled }: { employee?: Employee; version: number; disabled?: boolean }) {
  const [intent, setIntent] = useState<Intent | null>(null);
  return (
    <>
      {employee ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" aria-label={`Редактировать: ${employee.name}`} className={secondary} onClick={() => setIntent("edit")}><Icon name="edit" /> Изменить</button>
          <button type="button" aria-label={`Удалить: ${employee.name}`} className={secondary + " text-red-700"} onClick={() => setIntent("delete")}><Icon name="trash" /> Удалить</button>
        </div>
      ) : (
        <button type="button" disabled={disabled} className={primary} onClick={() => setIntent("create")}><Icon name="plus" /> Добавить сотрудника</button>
      )}
      {intent && <EmployeeDialog intent={intent} employee={employee} version={version} onClose={() => setIntent(null)} />}
    </>
  );
}
