import { BaseChatMessageUnion } from "utils/generatedTypes";

export function reconcileHydratedChatMessages({
  backendMessages,
  localMessages,
}: {
  backendMessages: Array<BaseChatMessageUnion>;
  localMessages: Array<BaseChatMessageUnion>;
}): Array<BaseChatMessageUnion> {
  if (backendMessages.length === 0) {
    return [];
  }
  const localMessageById = new Map<string, BaseChatMessageUnion>();
  for (const message of localMessages) {
    localMessageById.set(message.id, message);
  }
  return backendMessages.map((backendMessage) => {
    const localMessage = localMessageById.get(backendMessage.id);
    if (!localMessage) {
      return backendMessage;
    }
    return withPreservedCreatedAt(backendMessage, localMessage);
  });
}

function resolveMessageCreatedAtMs(message: BaseChatMessageUnion): number {
  const createdAt = (message as { createdAt?: unknown }).createdAt;
  if (
    typeof createdAt !== "number" ||
    !Number.isFinite(createdAt) ||
    createdAt <= 0
  ) {
    return 0;
  }
  return createdAt;
}

function withPreservedCreatedAt(
  message: BaseChatMessageUnion,
  fallbackMessage: BaseChatMessageUnion,
): BaseChatMessageUnion {
  if (resolveMessageCreatedAtMs(message) > 0) {
    return message;
  }
  const fallbackCreatedAt = resolveMessageCreatedAtMs(fallbackMessage);
  if (fallbackCreatedAt <= 0) {
    return message;
  }
  return {
    ...message,
    createdAt: fallbackCreatedAt,
  };
}
