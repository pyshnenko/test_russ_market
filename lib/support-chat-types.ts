import { z } from "zod";

export const supportChatToken = z.uuid();
export const supportChatMaxLength = 3_500;

export const supportChatMessages = z.array(z.object({
  id: z.number().int(),
  author: z.enum(["visitor", "developer"]),
  text: z.string(),
}));

export type SupportChatMessage = z.infer<typeof supportChatMessages>[number];
export type SupportChatActionState = { error?: string };
