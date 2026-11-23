"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

export function ScheduleUnavailable({ title = "График временно недоступен" }: { title?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className="grid min-h-0 flex-1 place-items-center overflow-auto p-2">
      <section aria-labelledby="schedule-unavailable-title" className="grid w-full max-w-sm justify-items-center gap-4 rounded-2xl bg-white p-6 text-center">
        <h1 id="schedule-unavailable-title" className="text-xl font-medium">{title}</h1>
        <p role="status" className="text-sm text-[#636770]">{pending ? "Проверяем подключение…" : "Не удалось подключиться к базе данных."}</p>
        <button type="button" disabled={pending} onClick={() => startTransition(() => router.refresh())} className="cursor-pointer rounded-lg bg-[#5978ec] px-4 py-3 text-white enabled:hover:bg-[#2047df] disabled:cursor-default disabled:opacity-60">
          Попробовать снова
        </button>
      </section>
    </div>
  );
}
