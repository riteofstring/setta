import type { ChatDetails } from "state/definitions";
import {
  AssistantChatMessage,
  BaseChatMessageUnion,
  ChatRoleEnum,
  ChatSectionState,
  createMessageTextContent,
  createMessageThinkingContent,
  LLMStreamingResponseContent,
  MessageDeltaEvent,
  MessageImageURLContent,
  MessageTextContent,
  MessageThinkingContent,
  StreamingEventTypeEnum,
  ToolArgumentPreviewDeltaEvent,
  ToolCall,
  ToolCallDeltaEvent,
} from "utils/generatedTypes";

export type ChatSectionStreamChunk = LLMStreamingResponseContent["chunk"];

export function shouldIgnoreResponsePlaceholderChunk(
  chunk: LLMStreamingResponseContent["chunk"],
): boolean {
  if (chunk.type === StreamingEventTypeEnum.message_start) {
    return shouldIgnoreResponsePlaceholderMessage(chunk.message);
  }
  if (chunk.type === StreamingEventTypeEnum.message_finalized) {
    return shouldIgnoreResponsePlaceholderMessage(chunk.message);
  }
  return false;
}

export function resolveFinalizedAssistantMessageUpdate(
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

export function createToolCallPlaceholder(chunk: {
  tool_call_id: string;
  tool_name: string | null;
}): ToolCall {
  return {
    id: chunk.tool_call_id,
    type: "function",
    function: {
      name: chunk.tool_name ?? "",
      arguments: {},
    },
  };
}

export function updateMessageById(
  messages: Array<BaseChatMessageUnion>,
  messageId: string | null,
  updater: (message: BaseChatMessageUnion) => BaseChatMessageUnion | null,
): { messages: Array<BaseChatMessageUnion>; changed: boolean } {
  if (!messageId) {
    return { messages, changed: false };
  }
  const index = messages.findIndex((message) => message.id === messageId);
  if (index === -1) {
    return { messages, changed: false };
  }
  const updatedMessage = updater(messages[index]);
  if (!updatedMessage) {
    return { messages, changed: false };
  }
  const nextMessages = [...messages];
  nextMessages[index] = updatedMessage;
  return { messages: nextMessages, changed: true };
}

type ChatMessageContent = Array<
  MessageTextContent | MessageImageURLContent | MessageThinkingContent
>;

type MessageContentDelta = NonNullable<MessageDeltaEvent["content"]>[number];

function upsertMessage(
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

export function applyStreamDeltaToChatDetails(
  details: ChatDetails,
  chunk: ChatSectionStreamChunk,
): ChatDetails {
  const nextState = applyStreamDeltaToChatSectionState(
    {
      messages: details.messages,
      inputText: "",
      waitingForResponse: details.waitingForResponse,
      toolCallArguments: details.toolCallArguments,
      activeBranchId: null,
      branches: {},
    },
    chunk,
  );
  return {
    ...details,
    messages: nextState.messages,
    waitingForResponse: nextState.waitingForResponse,
    toolCallArguments: nextState.toolCallArguments,
  };
}

function syncActiveBranchMessages(
  branches: ChatSectionState["branches"],
  activeBranchId: string | null,
  messages: Array<BaseChatMessageUnion>,
): ChatSectionState["branches"] {
  if (!activeBranchId) {
    return branches;
  }
  const activeBranch = branches[activeBranchId];
  if (!activeBranch) {
    return branches;
  }
  return {
    ...branches,
    [activeBranchId]: {
      ...activeBranch,
      messages,
    },
  };
}

function createChatSectionStateResult(
  state: ChatSectionState,
  messages: Array<BaseChatMessageUnion>,
  waitingForResponse: boolean,
  toolCallArguments: Record<string, string>,
): ChatSectionState {
  const activeBranchId = state.activeBranchId ?? null;
  return {
    messages,
    inputText: state.inputText,
    waitingForResponse,
    toolCallArguments,
    activeBranchId,
    branches: syncActiveBranchMessages(
      { ...(state.branches ?? {}) },
      activeBranchId,
      messages,
    ),
  };
}

function resolveFinalizedMessageUpsert(
  messages: Array<BaseChatMessageUnion>,
  message: BaseChatMessageUnion,
): { messageToUpsert: BaseChatMessageUnion; targetId: string } {
  if (message.role !== ChatRoleEnum.assistant) {
    return {
      messageToUpsert: message,
      targetId: message.id,
    };
  }
  const finalized = resolveFinalizedAssistantMessageUpdate(
    messages,
    message as AssistantChatMessage,
  );
  return {
    messageToUpsert: finalized.message,
    targetId: finalized.targetId,
  };
}

export function applyStreamDeltaToChatSectionState(
  state: ChatSectionState,
  chunk: ChatSectionStreamChunk,
): ChatSectionState {
  let messages = [...state.messages];
  let toolCallArguments = { ...state.toolCallArguments };
  let waitingForResponse = state.waitingForResponse;

  switch (chunk.type) {
    case StreamingEventTypeEnum.message_start: {
      messages = upsertMessage(messages, chunk.message);
      waitingForResponse = true;
      break;
    }
    case StreamingEventTypeEnum.delta:
      messages = applyMessageDeltaToChatMessages(messages, chunk);
      break;
    case StreamingEventTypeEnum.tool_call_delta: {
      const result = applyToolCallDeltaToChatMessages(
        messages,
        toolCallArguments,
        chunk,
      );
      messages = result.messages;
      toolCallArguments = result.toolCallArguments;
      break;
    }
    case StreamingEventTypeEnum.tool_argument_preview_delta: {
      const result = applyToolCallDeltaToChatMessages(
        messages,
        toolCallArguments,
        chunk,
      );
      messages = result.messages;
      toolCallArguments = result.toolCallArguments;
      break;
    }
    case StreamingEventTypeEnum.tool_result:
      messages = upsertMessage(messages, chunk.result);
      break;
    case StreamingEventTypeEnum.message_stop:
      waitingForResponse = false;
      break;
    case StreamingEventTypeEnum.message_finalized: {
      const { messageToUpsert, targetId } = resolveFinalizedMessageUpsert(
        messages,
        chunk.message,
      );
      messages = upsertMessage(messages, messageToUpsert, targetId);
      waitingForResponse = false;
      toolCallArguments = {};
      break;
    }
    default:
      chunk satisfies never;
      break;
  }

  return createChatSectionStateResult(
    state,
    messages,
    waitingForResponse,
    toolCallArguments,
  );
}

function isResponsePlaceholderId(
  messageId: string | null | undefined,
): boolean {
  if (!messageId) {
    return false;
  }
  return messageId.startsWith("rs_") || messageId.startsWith("resp_");
}

function assistantMessageEmpty(message: AssistantChatMessage): boolean {
  return (
    message.content.length === 0 &&
    (message.tool_calls?.length ?? 0) === 0 &&
    (message.attachments?.length ?? 0) === 0
  );
}

function shouldIgnoreResponsePlaceholderMessage(
  message: BaseChatMessageUnion,
): boolean {
  return (
    message.role === ChatRoleEnum.assistant &&
    isResponsePlaceholderId(message.id) &&
    assistantMessageEmpty(message)
  );
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
  const mergedToolCalls = mergeFinalizedAssistantToolCalls(
    message.tool_calls,
    existingAssistant.tool_calls,
  );
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

function mergeFinalizedAssistantToolCalls(
  finalizedToolCalls: AssistantChatMessage["tool_calls"],
  existingToolCalls: AssistantChatMessage["tool_calls"],
): AssistantChatMessage["tool_calls"] {
  if (finalizedToolCalls && finalizedToolCalls.length > 0) {
    return finalizedToolCalls;
  }
  if (existingToolCalls && existingToolCalls.length > 0) {
    return existingToolCalls;
  }
  if (finalizedToolCalls === null || existingToolCalls === null) {
    return null;
  }
  return finalizedToolCalls ?? existingToolCalls;
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

function ensureTextContentBlock(
  content: ChatMessageContent,
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
  content: ChatMessageContent,
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

function resolveDeltaContentIndex(
  delta: MessageContentDelta,
  contentLength: number,
): number {
  return normalizeChatContentIndex(delta.index, contentLength);
}

function applyTextDeltaToContent(
  content: ChatMessageContent,
  delta: Extract<MessageContentDelta, { type: "text_delta" }>,
): boolean {
  if (!delta.text) {
    return false;
  }
  const block = ensureTextContentBlock(
    content,
    resolveDeltaContentIndex(delta, content.length),
  );
  block.text += delta.text;
  return true;
}

function applyThinkingDeltaToContent(
  content: ChatMessageContent,
  delta: Extract<MessageContentDelta, { type: "thinking_delta" }>,
): boolean {
  const block = ensureThinkingContentBlock(
    content,
    resolveDeltaContentIndex(delta, content.length),
  );
  let mutated = false;
  if (delta.thinking) {
    block.thinking += delta.thinking;
    mutated = true;
  }
  if (delta.summary !== undefined && delta.summary !== null) {
    block.summary = delta.summary;
    mutated = true;
  }
  if (delta.signature !== undefined) {
    block.signature = delta.signature ?? "";
    mutated = true;
  }
  return mutated;
}

function applyMessageContentDelta(
  content: ChatMessageContent,
  delta: MessageContentDelta,
): boolean {
  switch (delta.type) {
    case "text_delta":
      return applyTextDeltaToContent(content, delta);
    case "thinking_delta":
      return applyThinkingDeltaToContent(content, delta);
    default:
      delta satisfies never;
      return false;
  }
}

function applyMessageDeltaToChatMessages(
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
    mutated = applyMessageContentDelta(content, delta) || mutated;
  }
  if (!mutated) {
    return updatedMessages;
  }
  assistant.content = content;
  return updatedMessages;
}

function applyToolCallDeltaToChatMessages(
  messages: Array<BaseChatMessageUnion>,
  toolCallArguments: Record<string, string>,
  chunk: ToolCallDeltaEvent | ToolArgumentPreviewDeltaEvent,
): {
  messages: Array<BaseChatMessageUnion>;
  toolCallArguments: Record<string, string>;
} {
  const nextToolCallArguments = {
    ...toolCallArguments,
    [chunk.tool_call_id]:
      (toolCallArguments[chunk.tool_call_id] ?? "") + chunk.arguments_delta,
  };
  const { messages: updatedMessages, assistant } = ensureAssistantMessage(
    messages,
    chunk.message_id,
  );
  const toolCalls = [...(assistant.tool_calls ?? [])];
  const existingIndex = toolCalls.findIndex(
    (entry) => entry.id === chunk.tool_call_id,
  );
  if (existingIndex === -1) {
    toolCalls.push(createToolCallPlaceholder(chunk));
  } else if (chunk.tool_name) {
    const existingCall = toolCalls[existingIndex];
    if (existingCall.function.name !== chunk.tool_name) {
      toolCalls[existingIndex] = {
        ...existingCall,
        function: {
          ...existingCall.function,
          name: chunk.tool_name,
        },
      };
    }
  }
  assistant.tool_calls = toolCalls.length > 0 ? toolCalls : null;
  return {
    messages: updatedMessages,
    toolCallArguments: nextToolCallArguments,
  };
}

function ensureAssistantMessage(
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
    attachments: [],
    tool_calls: null,
    createdAt: Date.now(),
  };
  return { messages: [...messages, assistant], assistant };
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
