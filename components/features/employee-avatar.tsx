"use client";

import { useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/cn";

export function EmployeeAvatar({ avatar, name, size = 40, priority = false }: {
  avatar: string | null;
  name: string;
  size?: 40 | 72;
  priority?: boolean;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const shape = size === 40 ? "size-10 rounded-[5px]" : "size-18 rounded-2xl";
  if (avatar && failed !== avatar) {
    return <Image src={avatar} alt="" width={size} height={size} priority={priority} unoptimized onError={() => setFailed(avatar)} className={cn("shrink-0 object-cover", shape)} />;
  }
  const initials = name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  return <span aria-hidden="true" className={cn("grid shrink-0 place-items-center bg-[#e7ecff] font-semibold text-[#2047d9]", shape, size === 72 && "text-2xl")}>{initials}</span>;
}
