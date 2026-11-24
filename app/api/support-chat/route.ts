import { after } from "next/server";
import { readSupportChat, reconnectSupportChat } from "@/lib/support-chat";
import { supportChatToken } from "@/lib/support-chat-types";

const headers = { "Cache-Control": "no-store" };

export function GET(request: Request) {
  const input = supportChatToken.safeParse(request.headers.get("Authorization")?.match(/^Bearer (.+)$/i)?.[1]);
  if (!input.success) return new Response(null, { status: 401, headers });

  const chat = readSupportChat(input.data);
  if (!chat) return new Response(null, { status: 404, headers });

  after(() => reconnectSupportChat(chat.remaining));
  return Response.json(chat.messages, { headers });
}
