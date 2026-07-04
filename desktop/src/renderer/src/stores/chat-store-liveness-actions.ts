import { errorPatch } from "./chat-store-helpers";
import { runLivenessesPatch } from "./chat-store-liveness";
import { normalizeStatePatch } from "./chat-store-detail-cache";
import type { ChatPatch, ChatStore } from "./chat-store-types";

interface RetryActiveRunLivenessDeps {
  get: () => ChatStore;
  runChatStoreBackgroundResync: () => void;
  set: (patch: (current: ChatStore) => ChatPatch) => void;
}

export function createRetryActiveRunLivenessAction({
  get,
  runChatStoreBackgroundResync,
  set,
}: RetryActiveRunLivenessDeps) {
  return async () => {
    const { selectedConversation, workspaceId } = get();
    if (!workspaceId || !selectedConversation) {
      return;
    }
    try {
      const response = await window.setta.chat.reconcileRuns({
        conversationId: selectedConversation.id,
        reason: "user_retry",
        workspaceId,
      });
      set((current) =>
        normalizeStatePatch(current, runLivenessesPatch(current, response.result.runs)),
      );
      runChatStoreBackgroundResync();
    } catch (error) {
      set((current) => normalizeStatePatch(current, errorPatch(error)));
    }
  };
}
