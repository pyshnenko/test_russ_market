"use client";

export default function ScheduleError({ reset }: { reset: () => void }) {
  return (
    <main className="grid min-h-screen place-items-center p-4">
      <div className="grid max-w-md gap-4 rounded-2xl bg-white p-8">
        <h1 className="text-xl">Не удалось открыть график</h1>
        <button onClick={reset} className="cursor-pointer rounded-lg bg-[#5978ec] px-4 py-3 text-white">Попробовать снова</button>
      </div>
    </main>
  );
}
