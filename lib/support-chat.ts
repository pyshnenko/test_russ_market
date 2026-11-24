import "server-only";

import { randomBytes, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import type { SupportChatMessage } from "./support-chat-types";

const chatLifetime = 30 * 60_000;
const maxChats = 100;
const maxMessages = 100;

class RelayBusyError extends Error {}

type Chat = {
  code: string;
  expiresAt: number;
  lastSentAt: number;
  messages: SupportChatMessage[];
};

type SupportState = {
  chats: Map<string, Chat>;
  socket?: WebSocket;
  connecting?: Promise<WebSocket>;
  idleTimer?: ReturnType<typeof setTimeout>;
  keepUntil: number;
};

const shared = globalThis as typeof globalThis & { scheduleSupport?: SupportState };
const state: SupportState = shared.scheduleSupport ??= { chats: new Map(), keepUntil: 0 };

function activeChat(token: string | undefined) {
  const now = Date.now();
  for (const [key, chat] of state.chats) {
    if (chat.expiresAt <= now) state.chats.delete(key);
  }
  return token ? state.chats.get(token) : undefined;
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
  for (const chat of state.chats.values()) {
    if (chat.code !== code) continue;
    appendMessage(chat, "developer", reply[2]);
    keepConnection(chatLifetime);
    break;
  }
}

function keepConnection(duration: number) {
  const until = Date.now() + duration;
  if (state.keepUntil >= until && state.idleTimer) return;
  state.keepUntil = until;
  clearTimeout(state.idleTimer);
  state.idleTimer = setTimeout(() => {
    state.idleTimer = undefined;
    state.socket?.close(1000);
  }, duration);
  state.idleTimer.unref();
}

function connection(): Promise<WebSocket> {
  if (state.connecting) return state.connecting;
  if (state.socket?.readyState === WebSocket.OPEN) return Promise.resolve(state.socket);

  const opening = new Promise<WebSocket>((resolve, reject) => {
    const url = new URL(process.env.VISITOR_WEBSOCKET_URL ?? "ws://aeza.pyshnet.ru:53548");
    const socket = new WebSocket(url);
    state.socket = socket;
    let readyTimer: ReturnType<typeof setTimeout> | undefined;
    const timeout = setTimeout(() => {
      reject(new Error(`WebSocket handshake timed out for ${url.host}`));
      socket.close();
    }, 3_000);

    const clearTimers = () => {
      clearTimeout(timeout);
      clearTimeout(readyTimer);
    };

    socket.addEventListener("open", () => {
      // The relay can close an upgraded connection immediately if its client slot is occupied.
      readyTimer = setTimeout(() => {
        clearTimers();
        resolve(socket);
      }, 100);
    }, { once: true });
    socket.addEventListener("message", ({ data }) => receiveReply(data));
    socket.addEventListener("error", (event) => {
      clearTimers();
      const detail = "message" in event && typeof event.message === "string" ? `: ${event.message}` : "";
      reject(new Error(`WebSocket error for ${url.host}${detail}`));
      if (state.socket === socket) state.socket = undefined;
    }, { once: true });
    socket.addEventListener("close", ({ code, reason }) => {
      clearTimers();
      if (state.socket === socket) state.socket = undefined;
      const error = code === 1008 && reason === "Client already connected"
        ? new RelayBusyError(`WebSocket relay already has a client (1008) for ${url.host}`)
        : new Error(`WebSocket closed with code ${code} for ${url.host}`);
      reject(error);
    }, { once: true });
  });

  state.connecting = opening.finally(() => { state.connecting = undefined; });
  return state.connecting;
}

async function sendToRelay(text: string, duration: number) {
  const socket = await connection();
  if (socket.readyState !== WebSocket.OPEN) throw new Error("WebSocket connection closed before sending");
  socket.send(text);
  keepConnection(duration);
}

export async function sendVisitorNotification() {
  const message = "на странице посетитель!!!";
  try {
    await sendToRelay(message, 1_000).catch(async (error: unknown) => {
      if (!(error instanceof RelayBusyError)) throw error;
      await delay(750);
      await sendToRelay(message, 1_000);
    });
  } catch (error) {
    console.warn("Visitor notification failed", error instanceof Error ? error.message : error);
  }
}

export function readSupportChat(token: string) {
  const chat = activeChat(token);
  return chat && { messages: chat.messages, remaining: chat.expiresAt - Date.now() };
}

export async function reconnectSupportChat(remaining: number) {
  if (state.socket?.readyState === WebSocket.OPEN) return;
  try {
    await connection();
    keepConnection(remaining);
  } catch {
    // Polling retries while the visitor's chat is active.
  }
}

export async function sendSupportMessage(token: string | undefined, text: string) {
  let chat = activeChat(token);
  if (!chat && state.chats.size >= maxChats) return { error: "Чат сейчас занят. Попробуйте позже." };

  const chatToken = chat && token ? token : randomUUID();
  if (!chat) {
    const codes = new Set(Array.from(state.chats.values(), (entry) => entry.code));
    let code: string;
    do { code = randomBytes(3).toString("hex").toUpperCase(); } while (codes.has(code));
    chat = { code, expiresAt: Date.now() + chatLifetime, lastSentAt: 0, messages: [] };
  }

  if (Date.now() - chat.lastSentAt < 1_000) return { error: "Подождите секунду перед отправкой." };
  chat.lastSentAt = Date.now();
  state.chats.set(chatToken, chat);

  try {
    await sendToRelay(`Чат ${chat.code}\n${text}\n\nОтвет: ${chat.code} ваш ответ`, chatLifetime);
    return { token: chatToken, message: appendMessage(chat, "visitor", text) };
  } catch (error) {
    if (chat.messages.length === 0) state.chats.delete(chatToken);
    console.warn("Support chat send failed", error instanceof Error ? error.message : error);
    return { error: error instanceof RelayBusyError ? "Чат временно занят. Попробуйте позже."
      : "Не удалось отправить сообщение. Попробуйте ещё раз." };
  }
}
