import "server-only";

import { randomBytes, randomUUID } from "node:crypto";
import { isRelayBusy, isRelayConfigured, keepRelayConnection, sendToRelay, setRelayMessageHandler } from "./ws/visitor-relay";
import type { SupportChatMessage } from "./support-chat-types";

const chatLifetime = 30 * 60_000;
const maxChats = 100;
const maxMessages = 100;

type Chat = {
  code: string;
  expiresAt: number;
  lastSentAt: number;
  messages: SupportChatMessage[];
};

// The action and polling route may load separate copies of this module.
const shared = globalThis as typeof globalThis & { scheduleSupportChats?: Map<string, Chat> };
const chats = shared.scheduleSupportChats ??= new Map();

function activeChat(token: string | undefined) {
  const now = Date.now();
  for (const [key, chat] of chats) {
    if (chat.expiresAt <= now) chats.delete(key);
  }
  return token ? chats.get(token) : undefined;
}

function appendMessage(chat: Chat, author: SupportChatMessage["author"], text: string) {
  const message = { id: (chat.messages.at(-1)?.id ?? 0) + 1, author, text };
  chat.messages.push(message);
  if (chat.messages.length > maxMessages) chat.messages.shift();
  chat.expiresAt = Date.now() + chatLifetime;
  return message;
}

function receiveReply(data: unknown) {
  if (typeof data !== "string") return;
  // The Telegram relay forwards the administrator's text verbatim.
  const reply = /^([\dA-F]{6})\s+([\s\S]+)$/i.exec(data.trim());
  if (!reply) return;
  const code = reply[1].toUpperCase();
  activeChat(undefined);
  for (const chat of chats.values()) {
    if (chat.code !== code) continue;
    appendMessage(chat, "developer", reply[2]);
    keepRelayConnection(chatLifetime);
    break;
  }
}

setRelayMessageHandler(receiveReply);

export function readSupportChat(token: string) {
  const chat = activeChat(token);
  return chat && { messages: chat.messages, remaining: chat.expiresAt - Date.now() };
}

export async function sendSupportMessage(token: string | undefined, text: string) {
  if (!isRelayConfigured()) return { error: "Чат отключён в этой среде." };
  let chat = activeChat(token);
  if (!chat && chats.size >= maxChats) return { error: "Чат сейчас занят. Попробуйте позже." };

  const chatToken = chat && token ? token : randomUUID();
  if (!chat) {
    const codes = new Set(Array.from(chats.values(), (entry) => entry.code));
    let code: string;
    do { code = randomBytes(3).toString("hex").toUpperCase(); } while (codes.has(code));
    chat = { code, expiresAt: Date.now() + chatLifetime, lastSentAt: 0, messages: [] };
  }

  if (Date.now() - chat.lastSentAt < 1_000) return { error: "Подождите секунду перед отправкой." };
  chat.lastSentAt = Date.now();
  chats.set(chatToken, chat);

  try {
    await sendToRelay(`Чат ${chat.code}\n${text}\n\nОтвет: ${chat.code} ваш ответ`, chatLifetime);
    return { token: chatToken, message: appendMessage(chat, "visitor", text) };
  } catch (error) {
    if (chat.messages.length === 0) chats.delete(chatToken);
    console.warn("Support chat send failed", error instanceof Error ? error.message : error);
    return { error: isRelayBusy(error) ? "Чат временно занят. Попробуйте позже."
      : "Не удалось отправить сообщение. Попробуйте ещё раз." };
  }
}
