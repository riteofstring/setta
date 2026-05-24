export type DraftProjectThreadState =
  | { phase: "none" }
  | { phase: "idle" }
  | { phase: "pending_chat_id" }
  | { phase: "awaiting_title"; chatId: string };

type DraftThreadHistoryEntry = {
  nameSource: string | null;
};

type ResolveDraftThreadStateAfterChatContextChangeInput = {
  current: DraftProjectThreadState;
  chatId: string | null | undefined;
  chatHistoryEntriesById: Map<string, DraftThreadHistoryEntry>;
};

// eslint-disable-next-line complexity
export function resolveDraftThreadStateAfterChatContextChange({
  current,
  chatId,
  chatHistoryEntriesById,
}: ResolveDraftThreadStateAfterChatContextChangeInput): DraftProjectThreadState {
  if (current.phase === "none") {
    return current;
  }
  if (current.phase === "idle") {
    return typeof chatId === "string" ? { phase: "none" } : current;
  }
  if (current.phase === "pending_chat_id") {
    if (typeof chatId === "string") {
      return { phase: "awaiting_title", chatId };
    }
    return chatId === undefined ? { phase: "idle" } : current;
  }
  if (typeof chatId === "string" && chatId !== current.chatId) {
    return { phase: "none" };
  }
  const historyEntry = chatHistoryEntriesById.get(current.chatId);
  if (historyEntry && historyEntry.nameSource !== null) {
    return { phase: "none" };
  }
  return current;
}
