"use client";

import { useActionState, useEffect, useId, useOptimistic, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { sendSupportChatMessage } from "@/app/support-chat-actions";
import {
  type SupportChatActionState,
  type SupportChatMessage,
  supportChatMaxLength,
  supportChatMessages,
} from "@/lib/support-chat-types";
import { Icon } from "./icon";
import styles from "./support-chat.module.css";

function mergeMessages(current: SupportChatMessage[], incoming: SupportChatMessage[]) {
  const messages = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) messages.set(message.id, message);
  if (messages.size === current.length) return current;
  return [...messages.values()].sort((first, second) => first.id - second.id).slice(-100);
}

function SendButton({ empty }: { empty: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={styles.send} aria-label="Отправить сообщение" disabled={empty || pending}>
      <Icon name="send" />
    </button>
  );
}

export function SupportChat() {
  const [visible, setVisible] = useState(false);
  const [open, setOpen] = useState(false);
  const [openedOnce, setOpenedOnce] = useState(false);
  const [draft, setDraft] = useState("");
  const [conversation, setConversation] = useState<{ token?: string; messages: SupportChatMessage[] }>({ messages: [] });
  const [shownMessages, addOptimisticMessage] = useOptimistic(
    conversation.messages,
    (current, text: string) => [...current, { id: 0, author: "visitor" as const, text }],
  );
  const [actionState, submit, pending] = useActionState(async (previous: SupportChatActionState, form: FormData) => {
    const text = form.get("message");
    if (typeof text !== "string" || !text.trim()) return previous;

    addOptimisticMessage(text.trim());
    try {
      const result = await sendSupportChatMessage(previous.token, text);
      if (result.error || !result.message) return { ...previous, error: result.error };
      const message = result.message;
      setConversation((current) => ({
        token: result.token,
        messages: current.token === result.token ? mergeMessages(current.messages, [message]) : [message],
      }));
      setDraft("");
      return { token: result.token };
    } catch {
      return { ...previous, error: "Не удалось отправить сообщение. Попробуйте ещё раз." };
    }
  }, {});
  const panelId = useId();
  const launcher = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const history = useRef<HTMLDivElement>(null);
  const token = actionState.token;

  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(true), 30_000);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  useEffect(() => {
    if (open && history.current) history.current.scrollTop = history.current.scrollHeight;
  }, [open, shownMessages]);

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    let timer: number | undefined;

    async function poll() {
      try {
        const response = await fetch("/api/support-chat", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
          signal: controller.signal,
        });
        if (response.status === 404) return;
        if (response.ok) {
          const result = supportChatMessages.safeParse(await response.json());
          if (result.success && !controller.signal.aborted) {
            setConversation((current) => {
              if (current.token !== token) return current;
              const messages = mergeMessages(current.messages, result.data);
              return messages === current.messages ? current : { token, messages };
            });
          }
        }
      } catch {
        // Resume polling after a transient network error.
      }
      if (!controller.signal.aborted) timer = window.setTimeout(poll, 2_000);
    }

    timer = window.setTimeout(poll, 1_000);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [token]);

  if (!visible) return null;

  function closeChat() {
    setOpen(false);
    launcher.current?.focus();
  }

  return (
    <aside className={styles.widget} aria-label="Связь с разработчиком">
      {open && (
        <section id={panelId} className={styles.panel} aria-labelledby={`${panelId}-title`}
          onKeyDown={(event) => { if (event.key === "Escape") closeChat(); }}>
          <header className={styles.header}>
            <span className={styles.headerIcon}><Icon name="chat" /></span>
            <h2 id={`${panelId}-title`}>Чат с разработчиком</h2>
            <button type="button" className={styles.close} aria-label="Закрыть чат" onClick={closeChat}>
              <Icon name="close" />
            </button>
          </header>
          <div ref={history} className={styles.history} role="log" aria-label="Сообщения чата">
            <p className={styles.developer}>Если есть вопросы к разработчику - задавай!</p>
            {shownMessages.map(({ id, author, text }) => (
              <p key={id} className={author === "visitor" ? styles.visitor : styles.developer}>{text}</p>
            ))}
          </div>
          <form action={submit} className={styles.form}>
            {actionState.error && <p className={styles.error} role="alert">{actionState.error}</p>}
            <div className={styles.composer}>
              <input ref={input} name="message" aria-label="Сообщение" placeholder="Напишите сообщение…"
                maxLength={supportChatMaxLength} required value={draft} readOnly={pending}
                onChange={(event) => setDraft(event.target.value)} />
              <SendButton empty={!draft.trim()} />
            </div>
          </form>
        </section>
      )}
      <button type="button" ref={launcher} className={styles.launcher} data-invite={!openedOnce}
        aria-expanded={open} aria-controls={open ? panelId : undefined} aria-label={open ? "Свернуть чат" : "Открыть чат"}
        onClick={() => { setOpenedOnce(true); setOpen(!open); }}>
        <Icon name={open ? "close" : "chat"} />
      </button>
    </aside>
  );
}
