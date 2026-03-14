import {
  clearAIFollowToolArgumentsForChat,
  receiveAgenticScopeViolationEdges,
  SCOPE_VIOLATION_TIMEOUT_MS,
} from "state/actions/aiFollow";
import { addTemporaryNotification } from "state/actions/notifications";
import {
  getCurrProjectConfigId,
  isManagedChatSection,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionEffectiveImpls";
import {
  clearChatStreamActive,
  markChatStreamActive,
  recordFinalizedMessage,
  shouldPersistOnMessageStop,
} from "state/aiStreamingTracker";
import { clearAllAppSpecPatchStreams } from "state/appSpecPatchStreaming";
import { useProjectState, type ZustandProjectState } from "state/definitions";
import {
  AgentRun,
  AgentRunStatusEnum,
  AssistantChatMessage,
  BaseChatMessageUnion,
  ChatRoleEnum,
  ChatSectionState,
  createMessageTextContent,
  createMessageThinkingContent,
  LLMStreamingResponse,
  MessageDeltaEvent,
  MessageFinalizedEvent,
  MessageImageUrlContent,
  MessageStartEvent,
  MessageTextContent,
  MessageThinkingContent,
  SectionTypeEnum,
  SettaNotificationTypeEnum,
  StreamingEventTypeEnum,
  ToolResultEvent,
} from "utils/generatedTypes";
import { extractAgenticScopeViolation } from "./agenticScopeViolation";
import {
  getChatSectionStateFromStore,
  persistChatSectionState,
} from "./aiChatSectionState";
import { updateChatDetails } from "./aiChatState";
import {
  applyToolCallDelta,
  applyToolCallDeltaToChatMessages,
  clearToolArgumentPreviewByToolCallId,
  clearToolArgumentPreviewByToolCallIds,
  handleToolArgumentPreviewDelta,
  handleToolCallDelta,
  maybeApplyAppDefinitionToolResult,
} from "./aiChatStreamingTools";
import { clearInterruptedAssistantMessages } from "./aiInterruptedAssistantMessages";
import {
  clearStopEligibleAssistantMessageId,
  setStopEligibleAssistantMessageId,
} from "./aiStopEligibleAssistantMessages";

const scopeViolationToastTimeouts = new Map<
  string,
  ReturnType<typeof setTimeout>
>();

function applyStreamingChunkToSection(
  sectionId: string,
  chunk: LLMStreamingResponse["chunk"],
  projectConfigId: string,
) {
  const nextState = applyChatSectionStreamDelta(sectionId, chunk);
  if (chunk.type === StreamingEventTypeEnum.TOOL_ARGUMENT_PREVIEW_DELTA) {
    applyToolArgumentPreviewDeltaToPreviewStore(chunk, projectConfigId);
    return;
  }
  if (chunk.type === StreamingEventTypeEnum.TOOL_RESULT) {
    maybeApplyAppDefinitionToolResult(chunk.result);
    persistChatSectionState({
      projectConfigId,
      sectionId,
      nextState,
      reason: chunk.type,
    });
    clearToolArgumentPreviewByToolCallId(
      projectConfigId,
      chunk.result.tool_call_id,
    );
    handleAgenticScopeViolation(chunk.result, projectConfigId);
    return;
  }
  if (chunk.type === StreamingEventTypeEnum.MESSAGE_FINALIZED) {
    recordFinalizedMessage(sectionId, chunk.message.id);
    persistChatSectionState({
      projectConfigId,
      sectionId,
      nextState,
      reason: chunk.type,
    });
    const toolCallIds =
      chunk.message.role === ChatRoleEnum.assistant
        ? chunk.message.tool_calls?.map((toolCall) => toolCall.id) ?? []
        : [];
    clearToolArgumentPreviewByToolCallIds(projectConfigId, toolCallIds);
    return;
  }
  if (chunk.type === StreamingEventTypeEnum.MESSAGE_STOP) {
    if (!shouldPersistOnMessageStop(sectionId, chunk.message_id)) {
      return;
    }
    persistChatSectionState({
      projectConfigId,
      sectionId,
      nextState,
      reason: chunk.type,
    });
  }
}

export function receiveLLMResponseChunk(msg: LLMStreamingResponse) {
  const { chatId, chunk } = msg;
  const projectConfigId = msg.projectConfigId ?? getCurrProjectConfigId();
  let sectionId = msg.sectionId;
  if (shouldIgnoreResponsePlaceholderChunk(chunk)) {
    return;
  }
  if (!sectionId && chatId) {
    sectionId = resolveSectionIdForChatId(chatId);
  }
  const isManagedSection = sectionId
    ? isManagedChatSection(useProjectState.getState(), sectionId)
    : false;
  const shouldUpdateChatDetails = !sectionId || isManagedSection;

  const shouldMarkActive =
    chunk.type === StreamingEventTypeEnum.MESSAGE_START ||
    chunk.type === StreamingEventTypeEnum.DELTA ||
    chunk.type === StreamingEventTypeEnum.TOOL_CALL_DELTA ||
    chunk.type === StreamingEventTypeEnum.TOOL_ARGUMENT_PREVIEW_DELTA;
  if (shouldMarkActive) {
    markChatStreamActive(chatId, sectionId);
  }
  if (
    chunk.type === StreamingEventTypeEnum.MESSAGE_STOP ||
    chunk.type === StreamingEventTypeEnum.MESSAGE_FINALIZED
  ) {
    clearChatStreamActive(chatId, sectionId);
  }
  if (sectionId) {
    applyStreamingChunkToSection(sectionId, chunk, projectConfigId);
  }
  if (shouldUpdateChatDetails) {
    switch (chunk.type) {
      case StreamingEventTypeEnum.MESSAGE_START:
        handleMessageStart(chatId, chunk);
        return;
      case StreamingEventTypeEnum.DELTA:
        handleMessageDelta(chatId, chunk);
        return;
      case StreamingEventTypeEnum.TOOL_CALL_DELTA:
        handleToolCallDelta(chatId, chunk);
        return;
      case StreamingEventTypeEnum.TOOL_ARGUMENT_PREVIEW_DELTA:
        if (sectionId) {
          updateChatDetails(chatId, (details) =>
            applyToolCallDelta(details, chunk),
          );
          return;
        }
        handleToolArgumentPreviewDelta(chatId, chunk, projectConfigId);
        return;
      case StreamingEventTypeEnum.TOOL_RESULT:
        if (sectionId) {
          updateChatDetails(chatId, (details) => {
            return {
              ...details,
              messages: upsertMessage(details.messages, chunk.result),
            };
          });
          clearToolArgumentPreviewByToolCallId(
            projectConfigId,
            chunk.result.tool_call_id,
          );
          return;
        }
        handleToolResult(chatId, chunk, projectConfigId);
        return;
      case StreamingEventTypeEnum.MESSAGE_STOP:
        handleMessageStop(chatId, projectConfigId);
        return;
      case StreamingEventTypeEnum.MESSAGE_FINALIZED:
        handleMessageFinalized(chatId, chunk, projectConfigId);
        return;
      default:
        return chunk satisfies never;
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

function shouldIgnoreResponsePlaceholderChunk(
  chunk: LLMStreamingResponse["chunk"],
): boolean {
  if (chunk.type === StreamingEventTypeEnum.MESSAGE_START) {
    return isResponsePlaceholderId(chunk.message.id);
  }
  if (chunk.type === StreamingEventTypeEnum.MESSAGE_FINALIZED) {
    return isResponsePlaceholderId(chunk.message.id);
  }
  return false;
}

type ChatSectionStreamChunk = LLMStreamingResponse["chunk"];

type RunPayload = Record<string, unknown>;

function buildChatStateFromAgentRun(run: AgentRun): ChatSectionState {
  const outputMessages = extractRunMessages(run.outputs);
  if (outputMessages) {
    return buildChatSectionState(
      outputMessages,
      run.status === AgentRunStatusEnum.running,
    );
  }

  const inputMessages = extractRunMessages(run.inputs) ?? [];
  return buildChatSectionState(
    inputMessages,
    run.status === AgentRunStatusEnum.running,
  );
}

function buildChatSectionState(
  messages: Array<BaseChatMessageUnion>,
  waitingForResponse: boolean,
): ChatSectionState {
  return {
    messages: [...messages],
    inputText: "",
    waitingForResponse,
    toolCallArguments: {},
  };
}

function extractRunMessages(
  payload: RunPayload | null,
): Array<BaseChatMessageUnion> | null {
  if (!payload) {
    return null;
  }
  const raw = payload.messages;
  if (!Array.isArray(raw)) {
    return null;
  }
  return raw as Array<BaseChatMessageUnion>;
}

function applyChatSectionStreamDelta(
  sectionId: string,
  chunk: ChatSectionStreamChunk,
): ChatSectionState | null {
  let nextState: ChatSectionState | null = null;
  useProjectState.setState((state) => {
    const currentState = getChatSectionStateFromStore(state, sectionId);
    if (!currentState) {
      return;
    }
    nextState = applyStreamDeltaToChatSectionState(currentState, chunk);
    setCurrEffectiveSectionImplValue<"ChatSection">(state, sectionId, {
      messages: nextState.messages,
      inputText: nextState.inputText,
      waitingForResponse: nextState.waitingForResponse,
      toolCallArguments: nextState.toolCallArguments,
      activeBranchId: nextState.activeBranchId,
      branches: nextState.branches,
    });
  });
  return nextState;
}

function handleMessageStart(chatId: string, chunk: MessageStartEvent) {
  if (chunk.message.role === ChatRoleEnum.assistant) {
    setStopEligibleAssistantMessageId(chatId, chunk.message.id);
    clearInterruptedAssistantMessages(chatId, [chunk.message.id]);
  }
  updateChatDetails(chatId, (details) => ({
    ...details,
    messages: upsertMessage(details.messages, chunk.message),
    waitingForResponse: true,
  }));
}

function handleMessageDelta(chatId: string, chunk: MessageDeltaEvent) {
  if (!chunk.content || chunk.content.length === 0) {
    return;
  }
  updateChatDetails(chatId, (details) => {
    return {
      ...details,
      messages: applyMessageDeltaToChatMessages(details.messages, chunk),
      waitingForResponse: true,
    };
  });
}

function handleAgenticScopeViolation(
  toolResult: ToolResultEvent["result"],
  projectConfigId: string,
): void {
  const violation = extractAgenticScopeViolation(toolResult);
  if (!violation) {
    return;
  }
  receiveAgenticScopeViolationEdges({
    projectConfigId,
    edges: violation.edges,
  });
  const existingTimeout = scopeViolationToastTimeouts.get(projectConfigId);
  if (existingTimeout !== undefined) {
    globalThis.clearTimeout(existingTimeout);
    const timeoutId = globalThis.setTimeout(() => {
      scopeViolationToastTimeouts.delete(projectConfigId);
    }, SCOPE_VIOLATION_TIMEOUT_MS);
    scopeViolationToastTimeouts.set(projectConfigId, timeoutId);
    return;
  }
  const notice = `${violation.message} Add the missing agentic edge(s) shown on the canvas. Use Project Chat for full access.`;
  addTemporaryNotification(notice, SettaNotificationTypeEnum.warning);
  const timeoutId = globalThis.setTimeout(() => {
    scopeViolationToastTimeouts.delete(projectConfigId);
  }, SCOPE_VIOLATION_TIMEOUT_MS);
  scopeViolationToastTimeouts.set(projectConfigId, timeoutId);
}

function handleToolResult(
  chatId: string,
  chunk: ToolResultEvent,
  projectConfigId: string,
) {
  updateChatDetails(chatId, (details) => {
    return {
      ...details,
      messages: upsertMessage(details.messages, chunk.result),
    };
  });
  clearToolArgumentPreviewByToolCallId(
    projectConfigId,
    chunk.result.tool_call_id,
  );
  handleAgenticScopeViolation(chunk.result, projectConfigId);
  maybeApplyAppDefinitionToolResult(chunk.result);
}

function handleMessageStop(chatId: string, projectConfigId: string) {
  clearStopEligibleAssistantMessageId(chatId);
  updateChatDetails(chatId, (details) => ({
    ...details,
    waitingForResponse: false,
  }));
  clearAIFollowToolArgumentsForChat(projectConfigId, chatId);
  clearAllAppSpecPatchStreams();
}

function handleMessageFinalized(
  chatId: string,
  chunk: MessageFinalizedEvent,
  projectConfigId: string,
) {
  let resolvedTargetId: string | null = chunk.message.id;
  updateChatDetails(chatId, (details) => {
    const { message: messageToUpsert, targetId } =
      chunk.message.role === ChatRoleEnum.assistant
        ? resolveFinalizedAssistantMessageUpdate(
            details.messages,
            chunk.message as AssistantChatMessage,
          )
        : {
            message: chunk.message,
            targetId: chunk.message.id,
          };
    resolvedTargetId = targetId;
    return {
      ...details,
      messages: upsertMessage(details.messages, messageToUpsert, targetId),
      waitingForResponse: false,
      toolCallArguments: {},
    };
  });
  if (chunk.message.role === ChatRoleEnum.assistant) {
    clearStopEligibleAssistantMessageId(chatId);
    clearInterruptedAssistantMessages(chatId, [
      resolvedTargetId,
      chunk.message.id,
    ]);
  }
  clearAIFollowToolArgumentsForChat(projectConfigId, chatId);
  const toolCallIds: string[] =
    chunk.message.role === "assistant"
      ? chunk.message.tool_calls?.map((toolCall) => toolCall.id) ?? []
      : [];
  clearToolArgumentPreviewByToolCallIds(projectConfigId, toolCallIds);
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

function upsertMessage(
  messages: Array<BaseChatMessageUnion>,
  message: BaseChatMessageUnion,
  targetId: string | null = null,
) {
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

type ChatIdLookupCache = {
  projectConfigId: string;
  sectionVariantMap: ZustandProjectState["projectConfig"]["sectionVariantMap"];
  sectionVariants: ZustandProjectState["sectionVariants"];
  sectionImpls: ZustandProjectState["sectionImpls"];
  sections: ZustandProjectState["sections"];
  map: Map<string, string>;
};

let chatIdLookupCache: ChatIdLookupCache | null = null;

function buildChatIdLookup(state: ZustandProjectState): Map<string, string> {
  const lookup = new Map<string, string>();
  for (const [sectionId, variantId] of Object.entries(
    state.projectConfig.sectionVariantMap,
  )) {
    const variant = state.sectionVariants[variantId];
    if (!variant) {
      continue;
    }
    const impl = state.sectionImpls[variant.impl];
    if (!impl) {
      continue;
    }
    const core = state.sections[sectionId];
    if (!core) {
      continue;
    }
    const effective = {
      ...impl,
      ...core.sharedModifier,
      ...variant.modifier,
    };
    if (effective.type !== SectionTypeEnum.Chat) {
      continue;
    }
    const candidate =
      typeof effective.chatId === "string" && effective.chatId.trim()
        ? effective.chatId
        : null;
    if (!candidate) {
      continue;
    }
    lookup.set(candidate, sectionId);
  }
  return lookup;
}

function resolveSectionIdForChatId(chatId: string): string | null {
  const state = useProjectState.getState();
  const shouldRebuild =
    !chatIdLookupCache ||
    chatIdLookupCache.projectConfigId !== state.projectConfig.id ||
    chatIdLookupCache.sectionVariantMap !==
      state.projectConfig.sectionVariantMap ||
    chatIdLookupCache.sectionVariants !== state.sectionVariants ||
    chatIdLookupCache.sectionImpls !== state.sectionImpls ||
    chatIdLookupCache.sections !== state.sections;
  if (shouldRebuild) {
    chatIdLookupCache = {
      projectConfigId: state.projectConfig.id,
      sectionVariantMap: state.projectConfig.sectionVariantMap,
      sectionVariants: state.sectionVariants,
      sectionImpls: state.sectionImpls,
      sections: state.sections,
      map: buildChatIdLookup(state),
    };
  }
  return chatIdLookupCache.map.get(chatId) ?? null;
}

function applyStreamDeltaToChatSectionState(
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
