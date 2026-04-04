import type { ChatDetails } from "state/definitions";
import {
  AssistantChatMessage,
  BaseChatMessageUnion,
  ChatRoleEnum,
  ChatSectionState,
  createMessageTextContent,
  createMessageThinkingContent,
  LLMStreamingResponse,
  MessageDeltaEvent,
  MessageImageUrlContent,
  MessageTextContent,
  MessageThinkingContent,
  StreamingEventTypeEnum,
  ToolArgumentPreviewDeltaEvent,
  ToolCall,
  ToolCallDeltaEvent,
} from "utils/generatedTypes";

export type ChatSectionStreamChunk = LLMStreamingResponse["chunk"];

export function shouldIgnoreResponsePlaceholderChunk(
  chunk: LLMStreamingResponse["chunk"],
): boolean {
  if (chunk.type === StreamingEventTypeEnum.MESSAGE_START) {
    return shouldIgnoreResponsePlaceholderMessage(chunk.message);
  }
  if (chunk.type === StreamingEventTypeEnum.MESSAGE_FINALIZED) {
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

function applyToolCallDelta(
  details: ChatDetails,
  chunk: {
    message_id: string;
    tool_call_id: string;
    tool_name: string | null;
    arguments_delta: string;
  },
): ChatDetails {
  const toolCallArguments = {
    ...details.toolCallArguments,
    [chunk.tool_call_id]:
      (details.toolCallArguments?.[chunk.tool_call_id] ?? "") +
      chunk.arguments_delta,
  };
  const { messages, changed } = updateMessageById(
    details.messages,
    chunk.message_id,
    (message) => {
      const toolCalls = [...(message.tool_calls ?? [])];
      const existingIndex = toolCalls.findIndex(
        (entry) => entry.id === chunk.tool_call_id,
      );
      if (existingIndex !== -1) {
        if (!chunk.tool_name) {
          return null;
        }
        const existingCall = toolCalls[existingIndex];
        if (existingCall.function.name === chunk.tool_name) {
          return null;
        }
        toolCalls[existingIndex] = {
          ...existingCall,
          function: {
            ...existingCall.function,
            name: chunk.tool_name,
          },
        };
        return { ...message, tool_calls: toolCalls };
      }
      toolCalls.push(createToolCallPlaceholder(chunk));
      return { ...message, tool_calls: toolCalls };
    },
  );
  return {
    ...details,
    toolCallArguments,
    ...(changed ? { messages } : {}),
  };
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

export function applyStreamDeltaToChatSectionState(
  state: ChatSectionState,
  chunk: ChatSectionStreamChunk,
): ChatSectionState {
  let messages = [...state.messages];
  let toolCallArguments = { ...state.toolCallArguments };
  let waitingForResponse = state.waitingForResponse;
  const inputText = state.inputText;
  const activeBranchId = state.activeBranchId ?? null;
  const branches = { ...(state.branches ?? {}) };

  const syncActiveBranchMessages = (
    nextMessages: Array<BaseChatMessageUnion>,
  ) => {
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
        messages: nextMessages,
      },
    };
  };

  switch (chunk.type) {
    case StreamingEventTypeEnum.MESSAGE_START: {
      messages = upsertMessage(messages, chunk.message);
      waitingForResponse = true;
      const nextBranches = syncActiveBranchMessages(messages);
      return {
        messages,
        inputText,
        waitingForResponse,
        toolCallArguments,
        activeBranchId,
        branches: nextBranches,
      };
    }
    case StreamingEventTypeEnum.DELTA: {
      messages = applyMessageDeltaToChatMessages(messages, chunk);
      const nextBranches = syncActiveBranchMessages(messages);
      return {
        messages,
        inputText,
        waitingForResponse,
        toolCallArguments,
        activeBranchId,
        branches: nextBranches,
      };
    }
    case StreamingEventTypeEnum.TOOL_CALL_DELTA: {
      const result = applyToolCallDeltaToChatMessages(
        messages,
        toolCallArguments,
        chunk,
      );
      messages = result.messages;
      toolCallArguments = result.toolCallArguments;
      const nextBranches = syncActiveBranchMessages(messages);
      return {
        messages,
        inputText,
        waitingForResponse,
        toolCallArguments,
        activeBranchId,
        branches: nextBranches,
      };
    }
    case StreamingEventTypeEnum.TOOL_ARGUMENT_PREVIEW_DELTA: {
      const result = applyToolCallDeltaToChatMessages(
        messages,
        toolCallArguments,
        chunk,
      );
      messages = result.messages;
      toolCallArguments = result.toolCallArguments;
      const nextBranches = syncActiveBranchMessages(messages);
      return {
        messages,
        inputText,
        waitingForResponse,
        toolCallArguments,
        activeBranchId,
        branches: nextBranches,
      };
    }
    case StreamingEventTypeEnum.TOOL_RESULT: {
      messages = upsertMessage(messages, chunk.result);
      const nextBranches = syncActiveBranchMessages(messages);
      return {
        messages,
        inputText,
        waitingForResponse,
        toolCallArguments,
        activeBranchId,
        branches: nextBranches,
      };
    }
    case StreamingEventTypeEnum.MESSAGE_STOP: {
      waitingForResponse = false;
      const nextBranches = syncActiveBranchMessages(messages);
      return {
        messages,
        inputText,
        waitingForResponse,
        toolCallArguments,
        activeBranchId,
        branches: nextBranches,
      };
    }
    case StreamingEventTypeEnum.MESSAGE_FINALIZED: {
      const { message: messageToUpsert, targetId } =
        chunk.message.role === ChatRoleEnum.assistant
          ? resolveFinalizedAssistantMessageUpdate(
              messages,
              chunk.message as AssistantChatMessage,
            )
          : {
              message: chunk.message,
              targetId: chunk.message.id,
            };
      messages = upsertMessage(messages, messageToUpsert, targetId);
      waitingForResponse = false;
      toolCallArguments = {};
      const nextBranches = syncActiveBranchMessages(messages);
      return {
        messages,
        inputText,
        waitingForResponse,
        toolCallArguments,
        activeBranchId,
        branches: nextBranches,
      };
    }
    default: {
      chunk satisfies never;
      const nextBranches = syncActiveBranchMessages(messages);
      return {
        messages,
        inputText,
        waitingForResponse,
        toolCallArguments,
        activeBranchId,
        branches: nextBranches,
      };
    }
  }
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
