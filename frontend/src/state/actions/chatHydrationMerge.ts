import {
  AssistantChatMessage,
  BaseChatMessageUnion,
  ChatRoleEnum,
  MessageImageUrlContent,
  MessageTextContent,
  MessageThinkingContent,
} from "utils/generatedTypes";

import { withPreservedCreatedAt } from "./chatMessageMerge";

type ChatContentItem =
  | MessageTextContent
  | MessageImageUrlContent
  | MessageThinkingContent;

export function reconcileHydratedChatMessages({
  backendMessages,
  localMessages,
  preserveLocalOnlyMessages,
}: {
  backendMessages: Array<BaseChatMessageUnion>;
  localMessages: Array<BaseChatMessageUnion>;
  preserveLocalOnlyMessages: boolean;
}): Array<BaseChatMessageUnion> {
  if (backendMessages.length === 0) {
    if (!preserveLocalOnlyMessages) {
      return [];
    }
    return [...localMessages];
  }
  const localMessageById = new Map<string, BaseChatMessageUnion>();
  for (const message of localMessages) {
    localMessageById.set(message.id, message);
  }
  const nextMessages = backendMessages.map((backendMessage) => {
    const localMessage = localMessageById.get(backendMessage.id);
    if (!localMessage) {
      return backendMessage;
    }
    if (
      preserveLocalOnlyMessages &&
      backendMessage.role === ChatRoleEnum.assistant &&
      localMessage.role === ChatRoleEnum.assistant
    ) {
      return mergeStreamingAssistantMessage(backendMessage, localMessage);
    }
    return withPreservedCreatedAt(backendMessage, localMessage);
  });
  if (!preserveLocalOnlyMessages) {
    return nextMessages;
  }
  const backendMessageIds = new Set(
    backendMessages.map((message) => message.id),
  );
  for (const localMessage of localMessages) {
    if (backendMessageIds.has(localMessage.id)) {
      continue;
    }
    nextMessages.push(localMessage);
  }
  return nextMessages;
}

function mergeStreamingAssistantMessage(
  backendMessage: AssistantChatMessage,
  localMessage: AssistantChatMessage,
): AssistantChatMessage {
  return withPreservedCreatedAt(
    {
      ...backendMessage,
      content: mergeStreamingAssistantContent(
        backendMessage.content,
        localMessage.content,
      ),
      tool_calls:
        backendMessage.tool_calls && backendMessage.tool_calls.length > 0
          ? backendMessage.tool_calls
          : localMessage.tool_calls,
      attachments:
        backendMessage.attachments && backendMessage.attachments.length > 0
          ? backendMessage.attachments
          : localMessage.attachments,
    },
    localMessage,
  ) as AssistantChatMessage;
}

function mergeStreamingAssistantContent(
  backendContent: Array<ChatContentItem>,
  localContent: Array<ChatContentItem>,
): Array<ChatContentItem> {
  if (
    !areStreamingAssistantContentItemsShapeCompatible(
      backendContent,
      localContent,
    )
  ) {
    return backendContent;
  }

  const merged = backendContent.map((backendItem, index) =>
    mergeStreamingAssistantContentItem(backendItem, localContent[index]),
  );
  if (localContent.length <= backendContent.length) {
    return merged;
  }
  return [...merged, ...localContent.slice(backendContent.length)];
}

function areStreamingAssistantContentItemsShapeCompatible(
  backendContent: Array<ChatContentItem>,
  localContent: Array<ChatContentItem>,
): boolean {
  const sharedLength = Math.min(backendContent.length, localContent.length);
  for (let index = 0; index < sharedLength; index += 1) {
    const backendItem = backendContent[index];
    const localItem = localContent[index];
    if (!backendItem || !localItem || backendItem.type !== localItem.type) {
      return false;
    }
  }
  return true;
}

function mergeStreamingAssistantContentItem(
  backendItem: ChatContentItem,
  localItem: ChatContentItem | undefined,
): ChatContentItem {
  if (!localItem) {
    return backendItem;
  }
  if (backendItem.type === "text" && localItem.type === "text") {
    return {
      ...backendItem,
      text: pickMoreCompleteAssistantText(backendItem.text, localItem.text),
    };
  }
  if (backendItem.type === "thinking" && localItem.type === "thinking") {
    return {
      ...backendItem,
      thinking: pickMoreCompleteAssistantText(
        backendItem.thinking,
        localItem.thinking,
      ),
      summary: preferHydratedThinkingMetadata(
        backendItem.summary,
        localItem.summary,
      ),
      signature: preferHydratedThinkingMetadata(
        backendItem.signature,
        localItem.signature,
      ),
    };
  }
  return backendItem;
}

function pickMoreCompleteAssistantText(
  backendText: string,
  localText: string,
): string {
  if (!backendText) {
    return localText;
  }
  if (!localText) {
    return backendText;
  }
  if (localText.length > backendText.length) {
    return localText;
  }
  return backendText;
}

function preferHydratedThinkingMetadata(
  backendValue: string | null | undefined,
  localValue: string | null | undefined,
): string | null {
  if (typeof backendValue === "string" && backendValue.length > 0) {
    return backendValue;
  }
  if (typeof localValue === "string" && localValue.length > 0) {
    return localValue;
  }
  if (backendValue !== undefined) {
    return backendValue;
  }
  if (localValue !== undefined) {
    return localValue;
  }
  return null;
}
