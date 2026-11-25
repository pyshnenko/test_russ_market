import "server-only";

import { setTimeout as delay } from "node:timers/promises";

class RelayBusyError extends Error {
  readonly code = "RELAY_BUSY";
}

export function isRelayBusy(error: unknown) {
  return error instanceof Error && "code" in error && error.code === "RELAY_BUSY";
}

type RelayState = {
  socket?: WebSocket;
  connecting?: Promise<WebSocket>;
  idleTimer?: ReturnType<typeof setTimeout>;
  keepUntil: number;
  onMessage?: (data: unknown) => void;
};

// Next.js can load the visitor and chat entry points separately.
const shared = globalThis as typeof globalThis & { scheduleVisitorRelay?: RelayState };
const state = shared.scheduleVisitorRelay ??= { keepUntil: 0 };

function relayUrl() {
  // A development tab must not take the production relay's single client slot.
  if (process.env.NODE_ENV === "development") return process.env.VISITOR_DEV_WEBSOCKET_URL?.trim();
  return process.env.VISITOR_WEBSOCKET_URL?.trim() || "ws://aeza.pyshnet.ru:53548";
}

export function isRelayConfigured() {
  return Boolean(relayUrl());
}

export function setRelayMessageHandler(handler: (data: unknown) => void) {
  state.onMessage = handler;
}

export function keepRelayConnection(duration: number) {
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
  const address = relayUrl();
  if (!address) return Promise.reject(new Error("Support chat relay is disabled"));
  if (state.connecting) return state.connecting;
  if (state.socket?.readyState === WebSocket.OPEN) return Promise.resolve(state.socket);

  const opening = new Promise<WebSocket>((resolve, reject) => {
    const url = new URL(address);
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
    socket.addEventListener("message", ({ data }) => state.onMessage?.(data));
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

export async function sendToRelay(text: string, duration: number) {
  const socket = await connection();
  if (socket.readyState !== WebSocket.OPEN) throw new Error("WebSocket connection closed before sending");
  socket.send(text);
  keepRelayConnection(duration);
}

export async function sendVisitorNotification() {
  if (!isRelayConfigured()) return;
  const message = "на странице посетитель!!!";
  try {
    await sendToRelay(message, 1_000).catch(async (error: unknown) => {
      if (!isRelayBusy(error)) throw error;
      await delay(750);
      await sendToRelay(message, 1_000);
    });
  } catch (error) {
    console.warn("Visitor notification failed", error instanceof Error ? error.message : error);
  }
}

export async function reconnectRelay(remaining: number) {
  if (!isRelayConfigured() || state.socket?.readyState === WebSocket.OPEN) return;
  try {
    await connection();
    keepRelayConnection(remaining);
  } catch {
    // Polling retries while the visitor's chat is active.
  }
}
