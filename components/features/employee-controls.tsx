"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import dynamic from "next/dynamic";
import { mutateEmployee } from "@/app/(crm)/employees/actions";
import clsx from "clsx";
import Button from "@mui/material/Button";
import styles from "./employee-controls.module.css";
import type { Employee } from "@/lib/schedule";
import { EmployeeAvatar } from "./employee-avatar";
import { Icon } from "./icon";

const Dialog = dynamic(() => import("@mui/material/Dialog"));

type Intent = "create" | "edit" | "delete";

function hasAvatarUpload(data: FormData | null) {
  const avatar = data?.get("avatar");
  return avatar instanceof File && avatar.size > 0;
}

function AvatarUploadStatus() {
  const { pending, data } = useFormStatus();
  return (
    <div role="status" className={styles.uploadStatus}>
      {pending && hasAvatarUpload(data) && (
        <>
          <span aria-hidden="true" className={styles.spinner} />
          Загружаем и обрабатываем аватар…
        </>
      )}
    </div>
  );
}

function EmployeeSubmit({ intent }: { intent: Intent }) {
  const { pending, data } = useFormStatus();
  const idleLabel = intent === "delete" ? "Удалить сотрудника" : "Сохранить";
  return <Button type="submit" variant="contained" disabled={pending} className={clsx(styles.primary, intent === "delete" && styles.danger)}>
    {pending ? hasAvatarUpload(data) ? "Загрузка…" : "Сохранение…" : idleLabel}
  </Button>;
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
  const avatarInput = useRef<HTMLInputElement>(null);
  const [avatarFile, setAvatarFile] = useState<{ preview: string | null } | null>(null);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const preview = avatarFile?.preview;
  const avatar = preview ?? (removeAvatar ? null : employee?.avatar ?? null);

  useEffect(() => {
    if (result.success) onClose();
  }, [result.success, onClose]);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const title = intent === "create" ? "Новый сотрудник" : intent === "edit" ? "Редактировать сотрудника" : "Удалить сотрудника";
  return (
    <Dialog open onClose={pending ? undefined : onClose} aria-labelledby="employee-dialog-title" fullWidth maxWidth="xs">
      <form action={action} onReset={() => setAvatarFile(null)} className={styles.form}>
        <h2 id="employee-dialog-title" className={styles.title}>{title}</h2>
        <input type="hidden" name="intent" value={intent} />
        <input type="hidden" name="version" value={version} />
        {employee && <input type="hidden" name="id" value={employee.id} />}
        {intent === "delete" ? (
          <p>Удалить <strong>{employee?.name}</strong> и все назначенные этому сотруднику смены из черновика графика?</p>
        ) : (
          <fieldset disabled={pending} className={styles.fields}>
            <label>ФИО<input name="name" autoFocus required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} className={styles.field} /></label>
            <label>Должность<input name="role" required maxLength={80} value={role} onChange={(event) => setRole(event.target.value)} className={styles.field} /></label>
            <div className={styles.avatarField}>
              <div className={styles.preview}>
                <EmployeeAvatar avatar={avatar} name={name} size={72} />
                {(avatar || avatarFile) && (
                  <button
                    type="button"
                    aria-label="Удалить аватар"
                    title="Удалить аватар"
                    className={styles.removeAvatar}
                    onClick={() => {
                      const input = avatarInput.current;
                      if (input) {
                        input.value = "";
                        input.focus();
                      }
                      setAvatarFile(null);
                      setRemoveAvatar(Boolean(employee?.avatar));
                    }}
                  ><Icon name="close" /></button>
                )}
              </div>
              <label className={styles.upload}>
                <span>Аватар</span>
                <input ref={avatarInput} name="avatar" type="file" accept="image/jpeg,image/png,image/webp" className={styles.file} onChange={(event) => {
                  const file = event.target.files?.[0];
                  setAvatarFile(file?.size ? { preview: file.size <= 5 * 1024 * 1024 ? URL.createObjectURL(file) : null } : null);
                }} aria-describedby="avatar-format" />
                <span id="avatar-format" className={styles.fileHint}>JPEG, PNG или WebP, до 5 МБ</span>
              </label>
            </div>
            <AvatarUploadStatus />
            {removeAvatar && <input type="hidden" name="removeAvatar" value="on" />}
          </fieldset>
        )}
        {result.error && <p role="alert" className={styles.error}>{result.error}</p>}
        <div className={styles.formActions}>
          <Button type="button" disabled={pending} className={styles.secondary} onClick={onClose}>Отмена</Button>
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
        <div className={styles.buttons}>
          <Button type="button" aria-label={`Редактировать: ${employee.name}`} className={styles.secondary} onClick={() => setIntent("edit")}><Icon name="edit" /> Изменить</Button>
          <Button type="button" aria-label={`Удалить: ${employee.name}`} className={clsx(styles.secondary, styles.danger)} onClick={() => setIntent("delete")}><Icon name="trash" /> Удалить</Button>
        </div>
      ) : (
        <Button type="button" variant="contained" disabled={disabled} className={styles.primary} onClick={() => setIntent("create")}><Icon name="plus" /> Добавить сотрудника</Button>
      )}
      {intent && <EmployeeDialog intent={intent} employee={employee} version={version} onClose={() => setIntent(null)} />}
    </>
  );
}
