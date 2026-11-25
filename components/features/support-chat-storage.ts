import { z } from "zod";
import { supportChatMessages, supportChatToken, type SupportChatMessage } from "@/lib/support-chat-types";

const storageKey = "schedule.support-chat.v1";
const maxHistory = 100;
const savedMessage = supportChatMessages.element.extend({ conversation: supportChatToken });
const historySchema = z.object({ token: supportChatToken.optional(), messages: z.array(savedMessage).max(maxHistory) });
type ChatHistory = z.infer<typeof historySchema>;

const emptyHistory: ChatHistory = { messages: [] };
let cached = emptyHistory;
let storedValue: string | null = null;
const listeners = new Set<() => void>();

export function getServerChatHistory() {
  return emptyHistory;
}

export function getChatHistory() {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (raw !== storedValue) {
      storedValue = raw;
      cached = emptyHistory;
      if (raw) {
        const result = historySchema.safeParse(JSON.parse(raw));
        if (result.success) cached = result.data;
      }
    }
  } catch {
    // The current tab can keep using chat when browser storage is unavailable.
  }
  return cached;
}

export function subscribeChatHistory(listener: () => void) {
  listeners.add(listener);
  function onStorage(event: StorageEvent) {
    if (event.key === storageKey || event.key === null) listener();
  }
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function writeChatHistory(update: (history: ChatHistory) => ChatHistory) {
  const current = getChatHistory();
  const next = update(current);
  if (next === current) return;
  const raw = JSON.stringify(next);
  cached = next;
  try {
    window.localStorage.setItem(storageKey, raw);
    storedValue = raw;
  } catch {
    // Retain the in-memory snapshot if storage is blocked or full.
  }
  for (const listener of listeners) listener();
}

export async function updateChatHistory(update: (history: ChatHistory) => ChatHistory) {
  // Serialize read-modify-write when polling or sending in multiple tabs.
  if (navigator.locks) await navigator.locks.request(storageKey, () => writeChatHistory(update));
  else writeChatHistory(update);
}

export function mergeChatHistory(history: ChatHistory, token: string, incoming: SupportChatMessage[]): ChatHistory {
  const current = new Map<number, ChatHistory["messages"][number]>();
  const previous: ChatHistory["messages"] = [];
  for (const message of history.messages) {
    if (message.conversation === token) current.set(message.id, message);
    else previous.push(message);
  }
  if (history.token === token && incoming.every(({ id }) => current.has(id))) return history;
  for (const message of incoming) current.set(message.id, { ...message, conversation: token });
  const messages = [...previous, ...[...current.values()].sort((a, b) => a.id - b.id)].slice(-maxHistory);
  return { token, messages };
}
