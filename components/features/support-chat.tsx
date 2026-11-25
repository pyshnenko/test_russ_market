"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { supportChatMaxLength } from "@/lib/support-chat-types";
import { useSupportChat } from "./use-support-chat";
import { Icon } from "./icon";
import styles from "./support-chat.module.css";

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
  const { draft, setDraft, messages, submit, pending, error } = useSupportChat();
  const panelId = useId();
  const launcher = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const history = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(true), 30_000);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  useEffect(() => {
    if (open && history.current) history.current.scrollTop = history.current.scrollHeight;
  }, [open, messages]);

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
            {messages.map(({ id, conversation, author, text }) => (
              <p key={`${conversation}:${id}`} className={author === "visitor" ? styles.visitor : styles.developer}>{text}</p>
            ))}
          </div>
          <form action={submit} className={styles.form}>
            {error && <p className={styles.error} role="alert">{error}</p>}
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
