import {
  AssistantChatMessage,
  BaseChatMessageUnion,
  ChatRoleEnum,
  MessageImageUrlContent,
  MessageTextContent,
  MessageThinkingContent,
  ToolChatMessage,
} from "utils/generatedTypes";

export function mergeChatMessages(
  existing: Array<BaseChatMessageUnion>,
  incoming: Array<BaseChatMessageUnion>,
): Array<BaseChatMessageUnion> {
  if (incoming.length === 0) {
    return [...existing];
  }
  if (existing.length === 0) {
    return [...incoming];
  }
  const merged = [...existing];
  const indexById = new Map<string, number>();
  merged.forEach((message, index) => {
    indexById.set(message.id, index);
  });
  for (const message of incoming) {
    const existingIndex = indexById.get(message.id);
    if (existingIndex === undefined) {
      indexById.set(message.id, merged.length);
      merged.push(message);
      continue;
    }
    merged[existingIndex] = pickMoreCompleteMessage(
      merged[existingIndex],
      message,
    );
  }
  return merged;
}

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
    return pickMoreCompleteMessage(backendMessage, localMessage);
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

type ChatContentItem =
  | MessageTextContent
  | MessageImageUrlContent
  | MessageThinkingContent;

function mergeStreamingAssistantMessage(
  backendMessage: AssistantChatMessage,
  localMessage: AssistantChatMessage,
): AssistantChatMessage {
  return {
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
  };
}

function mergeStreamingAssistantContent(
  backendContent: Array<ChatContentItem>,
  localContent: Array<ChatContentItem>,
): Array<ChatContentItem> {
  const merged: Array<ChatContentItem> = [];
  const maxLength = Math.max(backendContent.length, localContent.length);
  for (let index = 0; index < maxLength; index += 1) {
    const mergedItem = mergeStreamingAssistantContentItem(
      backendContent[index],
      localContent[index],
    );
    if (mergedItem) {
      merged.push(mergedItem);
    }
  }
  return merged;
}

function mergeStreamingAssistantContentItem(
  backendItem: ChatContentItem | undefined,
  localItem: ChatContentItem | undefined,
): ChatContentItem | null {
  if (!backendItem) {
    return localItem ?? null;
  }
  if (!localItem) {
    return backendItem;
  }
  if (backendItem.type !== localItem.type) {
    return localItem;
  }
  if (backendItem.type === "text" && localItem.type === "text") {
    return {
      ...backendItem,
      text: localItem.text || backendItem.text,
    };
  }
  if (backendItem.type === "thinking" && localItem.type === "thinking") {
    return {
      ...backendItem,
      thinking: localItem.thinking || backendItem.thinking,
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
  return localItem;
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

export function getMessageCompletenessScore(
  message: BaseChatMessageUnion,
): number {
  let score = 0;
  if (message.role === ChatRoleEnum.assistant) {
    score = getAssistantMessageScore(message);
  } else if (message.role === ChatRoleEnum.tool) {
    score = getToolMessageScore(message);
  } else {
    score = getContentScore(message.content);
  }
  return score + getAttachmentScore(message);
}

function pickMoreCompleteMessage(
  existing: BaseChatMessageUnion,
  incoming: BaseChatMessageUnion,
): BaseChatMessageUnion {
  if (existing.role !== incoming.role) {
    return incoming;
  }
  const existingScore = getMessageCompletenessScore(existing);
  const incomingScore = getMessageCompletenessScore(incoming);
  if (incomingScore > existingScore) {
    return incoming;
  }
  if (existingScore > incomingScore) {
    return existing;
  }
  return incoming;
}

function getAssistantMessageScore(message: AssistantChatMessage): number {
  let score = getContentScore(message.content);
  const toolCalls = message.tool_calls ?? [];
  score += toolCalls.length * 5;
  for (const toolCall of toolCalls) {
    if (toolCall.function?.name) {
      score += toolCall.function.name.length;
    }
    if (toolCall.function?.arguments) {
      score += getPayloadSize(toolCall.function.arguments);
    }
  }
  return score;
}

function getAttachmentScore(message: BaseChatMessageUnion): number {
  if (!("attachments" in message)) {
    return 0;
  }
  const attachments = message.attachments;
  if (!Array.isArray(attachments)) {
    return 0;
  }
  return attachments.length * 8;
}

function getToolMessageScore(message: ToolChatMessage): number {
  let score = 0;
  score += getPayloadSize(message.arguments);
  score += getPayloadSize(message.result);
  if (message.completed_at) {
    score += 5;
  }
  if (Array.isArray(message.content)) {
    score += message.content.length * 4;
    for (const entry of message.content) {
      if (entry.type === "text") {
        score += entry.text.length;
        continue;
      }
      if (entry.type === "resource") {
        if ("text" in entry.resource) {
          score += entry.resource.text.length;
        } else {
          score += 4;
        }
        continue;
      }
      score += 2;
    }
  }
  return score;
}

function getContentScore(
  content: Array<
    MessageTextContent | MessageImageUrlContent | MessageThinkingContent
  >,
): number {
  let score = 0;
  for (const item of content) {
    if (item.type === "text") {
      score += item.text.length;
      continue;
    }
    if (item.type === "thinking") {
      score += item.thinking.length;
      score += item.summary?.length ?? 0;
      score += item.signature?.length ?? 0;
      continue;
    }
    if (item.type === "image_url") {
      score += 8;
    }
  }
  return score;
}

function getPayloadSize(payload: unknown): number {
  if (payload === null || payload === undefined) {
    return 0;
  }
  if (typeof payload === "string") {
    return payload.length;
  }
  if (typeof payload === "number" || typeof payload === "boolean") {
    return 4;
  }
  if (Array.isArray(payload)) {
    return payload.length * 4;
  }
  try {
    return JSON.stringify(payload).length;
  } catch {
    return 0;
  }
}
