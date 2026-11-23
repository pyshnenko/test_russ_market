import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

const tones = {
  blue: "bg-[#3b82ff]",
  dark: "bg-[#222225]",
  muted: "bg-[#565760]",
};

export function Badge({ children, tone = "dark" }: { children: ReactNode; tone?: keyof typeof tones }) {
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 leading-none text-white", tones[tone])}>{children}</span>;
}
