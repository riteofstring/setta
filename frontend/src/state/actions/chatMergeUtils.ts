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
    return withPreservedCreatedAt(incoming, existing);
  }
  const existingScore = getMessageCompletenessScore(existing);
  const incomingScore = getMessageCompletenessScore(incoming);
  if (incomingScore > existingScore) {
    return withPreservedCreatedAt(incoming, existing);
  }
  if (existingScore > incomingScore) {
    return withPreservedCreatedAt(existing, incoming);
  }
  return withPreservedCreatedAt(incoming, existing);
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
