import type { ChatStore } from "./chat-store-types";
import { errorMessage } from "./chat-store-helpers";

export function createListComposerPromptHistoryAction(
  get: () => ChatStore,
): ChatStore["listComposerPromptHistory"] {
  return async (beforeOrdinal, limit) => {
    const { selectedConversation, workspaceId } = get();
    if (!workspaceId || !selectedConversation) {
      return null;
    }
    return window.setta.chat.listComposerPromptHistory(
      workspaceId,
      selectedConversation.id,
      beforeOrdinal,
      limit,
    );
  };
}

export function createSetConversationPinnedAction({
  get,
  set,
}: {
  get: () => ChatStore;
  set: (patch: Partial<ChatStore>) => void;
}): ChatStore["setConversationPinned"] {
  return async (conversationId, pinned, targetWorkspaceId) => {
    const workspaceId = targetWorkspaceId ?? get().workspaceId;
    if (!workspaceId) {
      return;
    }
    try {
      const item = await window.setta.chat.setConversationPinned(
        workspaceId,
        conversationId,
        pinned,
      );
      get().applyConversationUpdatedEvent(workspaceId, item);
    } catch (error) {
      set({ error: errorMessage(error), status: "error" });
      throw error;
    }
  };
}
