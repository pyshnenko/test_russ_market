"use client";

import { useState } from "react";
import Image from "next/image";
import clsx from "clsx";
import styles from "./employee-avatar.module.css";

export function EmployeeAvatar({ avatar, name, size = 40, priority = false }: {
  avatar: string | null;
  name: string;
  size?: 40 | 72;
  priority?: boolean;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const shape = size === 40 ? styles.small : styles.large;
  if (avatar && failed !== avatar) {
    return <Image src={avatar} alt="" width={size} height={size} priority={priority} unoptimized onError={() => setFailed(avatar)} className={clsx(styles.avatar, shape)} />;
  }
  const initials = name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  return <span aria-hidden="true" className={clsx(styles.avatar, styles.initials, shape)}>{initials}</span>;
}
