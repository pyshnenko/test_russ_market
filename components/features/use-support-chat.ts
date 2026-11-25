import { useActionState, useEffect, useOptimistic, useState, useSyncExternalStore } from "react";
import { sendSupportChatMessage } from "@/app/support-chat-actions";
import { supportChatMessages, type SupportChatActionState } from "@/lib/support-chat-types";
import { getChatHistory, getServerChatHistory, mergeChatHistory, subscribeChatHistory, updateChatHistory } from "./support-chat-storage";

export function useSupportChat() {
  const [draft, setDraft] = useState("");
  const history = useSyncExternalStore(subscribeChatHistory, getChatHistory, getServerChatHistory);
  const [shownMessages, addOptimisticMessage] = useOptimistic(
    history.messages,
    (current, text: string) => [...current, { id: 0, conversation: "", author: "visitor" as const, text }],
  );
  const [actionState, submit, pending] = useActionState(async (previous: SupportChatActionState, form: FormData) => {
    const text = form.get("message");
    if (typeof text !== "string" || !text.trim()) return previous;

    addOptimisticMessage(text.trim());
    try {
      async function send() {
        const result = await sendSupportChatMessage(getChatHistory().token, text);
        if (!("message" in result) || !result.token || !result.message) return { error: result.error };
        const { token, message } = result;
        await updateChatHistory((current) => mergeChatHistory(current, token, [message]));
        setDraft("");
        return {};
      }

      // Two first messages from different tabs should reuse the same server conversation.
      return navigator.locks ? await navigator.locks.request("schedule-support-chat-send", send) : await send();
    } catch {
      return { ...previous, error: "Не удалось отправить сообщение. Попробуйте ещё раз." };
    }
  }, {});
  useEffect(() => {
    const token = history.token;
    if (!token) return;
    const controller = new AbortController();
    let timer: number | undefined;

    const poll = async () => {
      try {
        const response = await fetch("/api/support-chat", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        if (response.status === 404) {
          await updateChatHistory((current) => current.token === token ? { messages: current.messages } : current);
          return;
        }
        if (response.ok) {
          const result = supportChatMessages.safeParse(await response.json());
          if (result.success && !controller.signal.aborted) {
            await updateChatHistory((current) => controller.signal.aborted || current.token !== token
              ? current
              : mergeChatHistory(current, token, result.data));
          }
        }
      } catch {
        // Resume polling after a transient network error.
      }
      if (!controller.signal.aborted) timer = window.setTimeout(poll, 2_000);
    };

    timer = window.setTimeout(poll, 1_000);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [history.token]);

  return { draft, setDraft, messages: shownMessages, submit, pending, error: actionState.error };
}
