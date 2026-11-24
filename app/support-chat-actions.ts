"use server";

import { z } from "zod";
import { sendSupportMessage } from "@/lib/support-chat";
import { supportChatMaxLength, supportChatToken } from "@/lib/support-chat-types";

const inputSchema = z.object({
  token: supportChatToken.optional(),
  text: z.string().trim().min(1).max(supportChatMaxLength),
});

export async function sendSupportChatMessage(token: unknown, text: unknown) {
  const input = inputSchema.safeParse({ token, text });
  if (!input.success) return { error: "Проверьте текст сообщения." };

  return sendSupportMessage(input.data.token, input.data.text);
}
