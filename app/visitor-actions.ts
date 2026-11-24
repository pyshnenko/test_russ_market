"use server";

import { after } from "next/server";
import { z } from "zod";
import { sendVisitorNotification } from "@/lib/support-chat";

const visitEvent = z.literal("page-opened");

export async function notifyVisitor(event: unknown) {
  if (!visitEvent.safeParse(event).success) return;

  // Anonymous visits also count. The browser cannot choose the recipient or message.
  after(sendVisitorNotification);
}
