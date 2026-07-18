import type { ChatStore } from "./chat-store-types";
import { requireSelectedChatTarget, selectedChatTarget } from "./chat-store-selected-target";

export function createChatAttachmentActions(get: () => ChatStore) {
  return {
    createImageAttachmentFromBytes: async (fileName: string, dataBase64: string) => {
      const target = requireSelectedChatTarget(get());
      return window.setta.chat.createImageAttachmentFromBytes(
        target.workspaceId,
        target.conversationId,
        fileName,
        dataBase64,
      );
    },
    createImageAttachmentsFromPicker: async (maxCount: number) => {
      const target = selectedChatTarget(get());
      if (!target) {
        return [];
      }
      return window.setta.chat.selectImageAttachments(
        target.workspaceId,
        target.conversationId,
        maxCount,
      );
    },
  } satisfies Pick<
    ChatStore,
    "createImageAttachmentFromBytes" | "createImageAttachmentsFromPicker"
  >;
}
