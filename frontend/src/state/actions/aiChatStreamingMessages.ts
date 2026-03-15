import {
  AssistantChatMessage,
  BaseChatMessageUnion,
  ChatRoleEnum,
  createMessageTextContent,
  createMessageThinkingContent,
  MessageDeltaEvent,
  MessageImageUrlContent,
  MessageTextContent,
  MessageThinkingContent,
} from "utils/generatedTypes";

export function isResponsePlaceholderId(
  messageId: string | null | undefined,
): boolean {
  if (!messageId) {
    return false;
  }
  return messageId.startsWith("rs_") || messageId.startsWith("resp_");
}

export function upsertMessage(
  messages: Array<BaseChatMessageUnion>,
  message: BaseChatMessageUnion,
  targetId: string | null = null,
): Array<BaseChatMessageUnion> {
  const idToUse = targetId ?? message.id;
  const existingIndex = messages.findIndex((entry) => entry.id === idToUse);
  if (existingIndex === -1) {
    return [...messages, stampMessageCreatedAtIfMissing(message)];
  }
  const existingMessage = messages[existingIndex];
  const nextMessages = [...messages];
  nextMessages[existingIndex] = mergeMessageCreatedAt(message, existingMessage);
  return nextMessages;
}

export function applyFinalizedMessageToChatMessages(
  messages: Array<BaseChatMessageUnion>,
  message: BaseChatMessageUnion,
): { messages: Array<BaseChatMessageUnion>; targetId: string } {
  if (message.role !== ChatRoleEnum.assistant) {
    return {
      messages: upsertMessage(messages, message),
      targetId: message.id,
    };
  }
  const { message: messageToUpsert, targetId } =
    resolveFinalizedAssistantMessageUpdate(messages, message);
  return {
    messages: upsertMessage(messages, messageToUpsert, targetId),
    targetId,
  };
}

export function applyMessageDeltaToChatMessages(
  messages: Array<BaseChatMessageUnion>,
  chunk: MessageDeltaEvent,
): Array<BaseChatMessageUnion> {
  if (!chunk.content || chunk.content.length === 0) {
    return messages;
  }
  const { messages: updatedMessages, assistant } = ensureAssistantMessage(
    messages,
    chunk.message_id,
  );
  let mutated = false;
  const content = [...assistant.content];
  for (const delta of chunk.content ?? []) {
    if (delta.type === "text_delta") {
      const index = normalizeChatContentIndex(delta.index, content.length);
      const block = ensureTextContentBlock(content, index);
      if (delta.text) {
        block.text += delta.text;
        mutated = true;
      }
      continue;
    }
    if (delta.type === "thinking_delta") {
      const index = normalizeChatContentIndex(delta.index, content.length);
      const block = ensureThinkingContentBlock(content, index);
      const thinkingUpdate = delta.thinking ?? "";
      const summaryUpdate = delta.summary;
      const signatureUpdate = delta.signature;
      let blockMutated = false;
      if (thinkingUpdate) {
        block.thinking += thinkingUpdate;
        blockMutated = true;
      }
      if (summaryUpdate !== undefined && summaryUpdate !== null) {
        block.summary = summaryUpdate;
        blockMutated = true;
      }
      if (signatureUpdate !== undefined) {
        block.signature = signatureUpdate ?? "";
        blockMutated = true;
      }
      if (blockMutated) {
        mutated = true;
      }
      continue;
    }
    delta satisfies never;
  }
  if (!mutated) {
    return updatedMessages;
  }
  assistant.content = content;
  return updatedMessages;
}

export function ensureAssistantMessage(
  messages: Array<BaseChatMessageUnion>,
  messageId: string,
): {
  messages: Array<BaseChatMessageUnion>;
  assistant: AssistantChatMessage;
} {
  const existingIndex = messages.findIndex((entry) => entry.id === messageId);
  if (existingIndex !== -1) {
    const existing = messages[existingIndex];
    if (existing.role === ChatRoleEnum.assistant) {
      const assistant: AssistantChatMessage = {
        ...existing,
        content: [...existing.content],
        tool_calls: existing.tool_calls ? [...existing.tool_calls] : null,
      };
      const nextMessages = [...messages];
      nextMessages[existingIndex] = assistant;
      return { messages: nextMessages, assistant };
    }
  }
  const assistant: AssistantChatMessage = {
    id: messageId,
    role: ChatRoleEnum.assistant,
    content: [],
    tool_calls: null,
    createdAt: Date.now(),
    attachments: [],
  };
  return { messages: [...messages, assistant], assistant };
}

function resolveFinalizedAssistantMessageUpdate(
  messages: Array<BaseChatMessageUnion>,
  message: AssistantChatMessage,
): { message: AssistantChatMessage; targetId: string } {
  const existingAssistant = findAssistantMessageForFinalizedUpdate(
    messages,
    message,
  );
  const targetId = existingAssistant?.id ?? message.id;
  return {
    message: mergeFinalizedAssistantMessage(message, existingAssistant),
    targetId,
  };
}

function findAssistantMessageForFinalizedUpdate(
  messages: Array<BaseChatMessageUnion>,
  message: AssistantChatMessage,
): AssistantChatMessage | null {
  const sameId = messages.find((entry) => entry.id === message.id);
  if (sameId?.role === ChatRoleEnum.assistant) {
    return sameId;
  }
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const candidate = messages[index];
    if (candidate.role !== ChatRoleEnum.assistant) {
      continue;
    }
    if (!isResponsePlaceholderId(candidate.id)) {
      continue;
    }
    return candidate;
  }
  return null;
}

function mergeFinalizedAssistantMessage(
  message: AssistantChatMessage,
  existingAssistant: AssistantChatMessage | null,
): AssistantChatMessage {
  if (!existingAssistant) {
    return message;
  }
  const hasFinalizedContent = message.content.length > 0;
  const mergedContent = hasFinalizedContent
    ? message.content
    : existingAssistant.content;
  const finalizedToolCalls = message.tool_calls ?? [];
  const existingToolCalls = existingAssistant.tool_calls ?? [];
  const mergedToolCalls =
    finalizedToolCalls.length > 0 ? finalizedToolCalls : existingToolCalls;
  const finalizedAttachments = message.attachments ?? [];
  const existingAttachments = existingAssistant.attachments ?? [];
  const mergedAttachments =
    finalizedAttachments.length > 0
      ? finalizedAttachments
      : existingAttachments;
  if (
    mergedContent === message.content &&
    mergedToolCalls === message.tool_calls &&
    mergedAttachments === message.attachments
  ) {
    return message;
  }
  return {
    ...message,
    content: mergedContent,
    tool_calls: mergedToolCalls,
    attachments: mergedAttachments,
  };
}

function ensureTextContentBlock(
  content: Array<
    MessageTextContent | MessageImageUrlContent | MessageThinkingContent
  >,
  index: number,
): MessageTextContent {
  while (content.length <= index) {
    content.push(createMessageTextContent({ text: "" }));
  }
  const block = content[index];
  if (!block || block.type !== "text") {
    const nextBlock = createMessageTextContent({ text: "" });
    content[index] = nextBlock;
    return nextBlock;
  }
  return block;
}

function ensureThinkingContentBlock(
  content: Array<
    MessageTextContent | MessageImageUrlContent | MessageThinkingContent
  >,
  index: number,
): MessageThinkingContent {
  while (content.length <= index) {
    content.push(createMessageThinkingContent({ thinking: "" }));
  }
  const block = content[index];
  if (!block || block.type !== "thinking") {
    const nextBlock = createMessageThinkingContent({ thinking: "" });
    content[index] = nextBlock;
    return nextBlock;
  }
  return block as MessageThinkingContent;
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

function mergeMessageCreatedAt(
  message: BaseChatMessageUnion,
  existingMessage: BaseChatMessageUnion | null,
): BaseChatMessageUnion {
  const nextCreatedAt = resolveMessageCreatedAtMs(message);
  if (nextCreatedAt > 0 || existingMessage === null) {
    return message;
  }
  const existingCreatedAt = resolveMessageCreatedAtMs(existingMessage);
  if (existingCreatedAt <= 0) {
    return message;
  }
  return {
    ...message,
    createdAt: existingCreatedAt,
  };
}

function stampMessageCreatedAtIfMissing(
  message: BaseChatMessageUnion,
): BaseChatMessageUnion {
  if (
    message.role === ChatRoleEnum.tool ||
    resolveMessageCreatedAtMs(message) > 0
  ) {
    return message;
  }
  return {
    ...message,
    createdAt: Date.now(),
  };
}

function normalizeChatContentIndex(
  index: number | null | undefined,
  currentLength: number,
): number {
  if (index === null || index === undefined) {
    return Math.max(currentLength - 1, 0);
  }
  if (index < 0) {
    return 0;
  }
  return index;
}
