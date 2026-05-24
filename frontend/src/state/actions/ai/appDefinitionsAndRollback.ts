import {
  applyAppDefinitionStructuredContentToStore,
  applyAppSpecPatchPreviewDeltaToStore,
  clearAllAppSpecPatchPreviewStreams,
  clearAppSpecPatchPreviewStream,
} from "plugins/appSubsystem";

import { clearAIFollowToolArgumentsForChat } from "state/actions/aiFollow";

import { addTemporaryNotification } from "state/actions/notifications";

import { getCurrProjectConfigId } from "state/actions/sectionInfos";

import { isChatStreamActive } from "state/aiStreamingTracker";

import {
  ChatDetails,
  ToolArgumentPreviewEntry,
  ToolArgumentPreviewProjectState,
  useAIStore,
  useToolArgumentPreview,
} from "state/definitions";

import {
  getDefaultChatAppGenerationDetails,
  mergeChatAppGenerationDetails,
  normalizeChatAppGenerationContext,
  setChatAppGenerationForMessage,
  type ChatAppGenerationContext,
} from "state/utils/chatAppGeneration";

import {
  AssistantChatMessage,
  BaseChatMessageUnion,
  ChatRoleEnum,
  LLMStreamingResponseContent,
  MessageFinalizedEvent,
  StreamingEventTypeEnum,
  ToolArgumentPreviewDeltaEvent,
  ToolChatMessage,
  ToolResultEvent,
} from "utils/generatedTypes";

import {
  applyStreamDeltaToChatDetails,
  createToolCallPlaceholder,
  resolveFinalizedAssistantMessageUpdate,
  updateMessageById,
} from "../chatStreamState";

import {
  getDefaultChatDetails,
  getPendingChatAppGenerationDetailsForSurface,
  getPendingChatDetailsForSurface,
  setPendingChatAppGenerationDetailsForSurface,
  setPendingChatDetailsForSurface,
} from "./llmConfigAndAgentRuns";

import {
  clearInterruptedAssistantMessages,
  clearStopEligibleAssistantMessageId,
} from "./chatHydration";

import {
  APP_DEFINITION_TOOL_NAMES,
  extractToolStructuredContent,
  handleAgenticScopeViolation,
} from "./streamingChunksAndTools";

function resolveAppDefinitionToolName(
  toolMessage: ToolChatMessage,
): string | null {
  const toolName =
    typeof toolMessage.tool_name === "string" ? toolMessage.tool_name : null;
  if (!toolName || !APP_DEFINITION_TOOL_NAMES.has(toolName)) {
    return null;
  }
  return toolName;
}

function maybeClearFailedStreamAppDefinition(
  toolMessage: ToolChatMessage,
): void {
  if (
    toolMessage.tool_name === "setta__stream_app_definition" &&
    toolMessage.is_error
  ) {
    clearAppSpecPatchPreviewStream(toolMessage.tool_call_id);
    // Keep the last streamed preview visible even if the tool call fails validation.
    // Otherwise the preview disappears while the AI iterates on fixes.
  }
}

function applyAppDefinitionStructuredContent(
  structured: Record<string, unknown>,
): void {
  if (!applyAppDefinitionStructuredContentToStore(structured)) {
    return;
  }
  addTemporaryNotification("App spec updated.");
}

export function maybeApplyAppDefinitionToolResult(
  toolMessage: ToolChatMessage,
): void {
  const toolName = resolveAppDefinitionToolName(toolMessage);
  if (!toolName) {
    return;
  }
  if (toolMessage.is_error) {
    maybeClearFailedStreamAppDefinition(toolMessage);
    return;
  }
  const structured = extractToolStructuredContent(toolMessage.result);
  if (!structured) {
    return;
  }
  applyAppDefinitionStructuredContent(structured);
  if (toolName === "setta__stream_app_definition") {
    clearAppSpecPatchPreviewStream(toolMessage.tool_call_id);
  }
}

function handleToolResult(
  chatId: string,
  chunk: ToolResultEvent,
  projectConfigId: string,
) {
  applyStreamingChunkToChatDetails(chatId, chunk);
  clearToolArgumentPreviewByToolCallId(
    projectConfigId,
    chunk.result.tool_call_id,
  );
  handleAgenticScopeViolation(chunk.result, projectConfigId);
  maybeApplyAppDefinitionToolResult(chunk.result);
}

export function handleMessageStop(chatId: string, projectConfigId: string) {
  clearStopEligibleAssistantMessageId(chatId);
  applyStreamingChunkToChatDetails(chatId, {
    type: StreamingEventTypeEnum.message_stop,
    message_id: "",
  });
  clearAIFollowToolArgumentsForChat(projectConfigId, chatId);
  clearAllAppSpecPatchPreviewStreams();
}

export function handleMessageFinalized(
  chatId: string,
  chunk: MessageFinalizedEvent,
  projectConfigId: string,
) {
  let resolvedTargetId: string | null = chunk.message.id;
  updateChatDetails(chatId, (details) => {
    if (chunk.message.role === ChatRoleEnum.assistant) {
      resolvedTargetId = resolveFinalizedAssistantMessageUpdate(
        details.messages,
        chunk.message as AssistantChatMessage,
      ).targetId;
    }
    return applyStreamDeltaToChatDetails(details, chunk);
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

function handleToolArgumentPreviewDelta(
  chatId: string,
  chunk: ToolArgumentPreviewDeltaEvent,
  projectConfigId: string,
) {
  if (chunk.preview_kind === "appSpecPatch") {
    // For app spec patch streaming, the `arguments_delta` includes the entire JSON tool
    // arguments payload (including the growing patches string). Updating chatDetails on
    // every tiny delta can overwhelm React. We only need the patch preview for live
    // rendering, so keep chat updates minimal.
    ensureToolCallPlaceholder(chatId, chunk);
    applyToolArgumentPreviewDeltaToPreviewStore(chunk);
    return;
  }
  applyStreamingChunkToChatDetails(chatId, chunk);
  applyToolArgumentPreviewDeltaToPreviewStore(chunk, projectConfigId);
}

export function handleSectionAwareChatDetailsChunk({
  chatId,
  chunk,
  sectionId,
  projectConfigId,
}: {
  chatId: string;
  chunk: ToolArgumentPreviewDeltaEvent | ToolResultEvent;
  sectionId: string | undefined;
  projectConfigId: string;
}) {
  if (sectionId) {
    applyStreamingChunkToChatDetails(chatId, chunk);
    if (chunk.type === StreamingEventTypeEnum.tool_result) {
      clearToolArgumentPreviewByToolCallId(
        projectConfigId,
        chunk.result.tool_call_id,
      );
    }
    return;
  }
  if (chunk.type === StreamingEventTypeEnum.tool_argument_preview_delta) {
    handleToolArgumentPreviewDelta(chatId, chunk, projectConfigId);
    return;
  }
  handleToolResult(chatId, chunk, projectConfigId);
}

export function applyStreamingChunkToChatDetails(
  chatId: string,
  chunk: LLMStreamingResponseContent["chunk"],
) {
  updateChatDetails(chatId, (details) =>
    applyStreamDeltaToChatDetails(details, chunk),
  );
}

function ensureToolCallPlaceholder(
  chatId: string,
  chunk: ToolArgumentPreviewDeltaEvent,
) {
  useAIStore.setState((state) => {
    const existingDetails = state.chatDetails[chatId];
    if (!existingDetails) {
      return state;
    }
    const { messages, changed } = updateMessageById(
      existingDetails.messages,
      chunk.message_id,
      (message) => {
        const toolCalls = [...(message.tool_calls ?? [])];
        const existingIndex = toolCalls.findIndex(
          (entry) => entry.id === chunk.tool_call_id,
        );
        if (existingIndex !== -1) {
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
        toolCalls.push(
          createToolCallPlaceholder({
            tool_call_id: chunk.tool_call_id,
            tool_name: chunk.tool_name,
          }),
        );
        return { ...message, tool_calls: toolCalls };
      },
    );
    if (!changed) {
      return state;
    }
    return {
      chatDetails: {
        ...state.chatDetails,
        [chatId]: {
          ...existingDetails,
          messages,
        },
      },
    };
  });
}

export function applyToolArgumentPreviewDeltaToPreviewStore(
  chunk: ToolArgumentPreviewDeltaEvent,
  projectConfigId?: string,
) {
  if (chunk.preview_kind === "appSpecPatch") {
    applyAppSpecPatchPreviewDeltaToStore({
      toolCallId: chunk.tool_call_id,
      previewValueDelta: chunk.preview_value_delta,
    });
    return;
  }
  const resolvedProjectConfigId = projectConfigId ?? getCurrProjectConfigId();
  // eslint-disable-next-line complexity
  useToolArgumentPreview.setState((state) => {
    const previewState =
      state.byProjectConfigId[resolvedProjectConfigId] ??
      (state.byProjectConfigId[resolvedProjectConfigId] =
        createToolArgumentPreviewProjectState());
    const previewDelta = chunk.preview_value_delta;
    const toolCallId = chunk.tool_call_id;
    switch (chunk.preview_kind) {
      case "code": {
        const sectionIds = chunk.target_ids_by_type.section ?? [];
        for (const sectionId of sectionIds) {
          const existing = previewState.previewCodeBySectionId[sectionId];
          previewState.previewCodeBySectionId[sectionId] = applyPreviewDelta(
            existing,
            previewDelta,
            toolCallId,
          );
        }
        return;
      }
      case "paramValue": {
        const sectionIds = chunk.target_ids_by_type.section ?? [];
        const paramIds = chunk.target_ids_by_type.codeObj ?? [];
        if (sectionIds.length === 0 || paramIds.length === 0) {
          return;
        }
        for (const sectionId of sectionIds) {
          const paramEntries =
            previewState.previewParamValueBySectionAndParamId[sectionId] ??
            (previewState.previewParamValueBySectionAndParamId[sectionId] = {});
          for (const paramInfoId of paramIds) {
            const existing = paramEntries[paramInfoId];
            paramEntries[paramInfoId] = applyPreviewDelta(
              existing,
              previewDelta,
              toolCallId,
            );
          }
        }
        return;
      }
      case "callableName": {
        const sectionIds = chunk.target_ids_by_type.section ?? [];
        for (const sectionId of sectionIds) {
          const existing =
            previewState.previewCallableNameBySectionId[sectionId];
          previewState.previewCallableNameBySectionId[sectionId] =
            applyPreviewDelta(existing, previewDelta, toolCallId);
        }
        return;
      }
      default: {
        chunk.preview_kind satisfies never;
        return;
      }
    }
  });
}

function createToolArgumentPreviewProjectState(): ToolArgumentPreviewProjectState {
  return {
    previewCodeBySectionId: {},
    previewParamValueBySectionAndParamId: {},
    previewCallableNameBySectionId: {},
  };
}

function applyPreviewDelta(
  existing: ToolArgumentPreviewEntry | undefined,
  previewDelta: string,
  toolCallId: string,
): ToolArgumentPreviewEntry {
  if (!existing || existing.toolCallId !== toolCallId) {
    return { value: previewDelta, toolCallId };
  }
  if (!previewDelta) {
    return existing;
  }
  return { value: existing.value + previewDelta, toolCallId };
}

export function clearToolArgumentPreviewByToolCallId(
  projectConfigId: string,
  toolCallId: string,
) {
  clearToolArgumentPreviewByToolCallIds(projectConfigId, [toolCallId]);
}

export function clearToolArgumentPreviewByToolCallIds(
  projectConfigId: string,
  toolCallIds: string[],
) {
  if (toolCallIds.length === 0) {
    return;
  }
  const toolCallIdSet = new Set(toolCallIds);
  // eslint-disable-next-line complexity
  useToolArgumentPreview.setState((state) => {
    const previewState = state.byProjectConfigId[projectConfigId];
    if (!previewState) {
      return;
    }
    for (const [sectionId, entry] of Object.entries(
      previewState.previewCodeBySectionId,
    )) {
      if (toolCallIdSet.has(entry.toolCallId)) {
        delete previewState.previewCodeBySectionId[sectionId];
      }
    }
    for (const [sectionId, entry] of Object.entries(
      previewState.previewCallableNameBySectionId,
    )) {
      if (toolCallIdSet.has(entry.toolCallId)) {
        delete previewState.previewCallableNameBySectionId[sectionId];
      }
    }
    for (const [sectionId, paramEntries] of Object.entries(
      previewState.previewParamValueBySectionAndParamId,
    )) {
      for (const [paramInfoId, entry] of Object.entries(paramEntries)) {
        if (toolCallIdSet.has(entry.toolCallId)) {
          delete paramEntries[paramInfoId];
        }
      }
      if (Object.keys(paramEntries).length === 0) {
        delete previewState.previewParamValueBySectionAndParamId[sectionId];
      }
    }
    if (
      Object.keys(previewState.previewCodeBySectionId).length === 0 &&
      Object.keys(previewState.previewCallableNameBySectionId).length === 0 &&
      Object.keys(previewState.previewParamValueBySectionAndParamId).length ===
        0
    ) {
      delete state.byProjectConfigId[projectConfigId];
    }
  });
}

export function updateChatDetails(
  chatId: string,
  updater: (details: ChatDetails) => ChatDetails | null,
) {
  useAIStore.setState((state) => {
    const baseDetails: ChatDetails = {
      ...getDefaultChatDetails(),
      ...(state.chatDetails[chatId] ?? {}),
    };
    const nextDetails = updater(baseDetails);
    if (!nextDetails) {
      return state;
    }
    return {
      chatDetails: {
        ...state.chatDetails,
        [chatId]: nextDetails,
      },
    };
  });
}

export function updatePendingChatDetails(
  updater: (details: ChatDetails) => ChatDetails | null,
  surfaceId: string | null | undefined,
) {
  useAIStore.setState((state) => {
    const baseDetails: ChatDetails =
      getPendingChatDetailsForSurface(state, surfaceId) ??
      getDefaultChatDetails();
    const nextDetails = updater(baseDetails);
    if (!nextDetails) {
      return state;
    }
    return setPendingChatDetailsForSurface(state, surfaceId, nextDetails);
  });
}

function mergeChatDetails(
  existingDetails: ChatDetails,
  pendingDetails: ChatDetails,
  preserveWaitingForResponse: boolean,
): ChatDetails {
  const existingMessageIds = new Set(
    existingDetails.messages.map((message) => message.id),
  );
  const promotedPendingMessages = pendingDetails.messages.filter(
    (message) => !existingMessageIds.has(message.id),
  );
  const nextWaitingForResponse = preserveWaitingForResponse
    ? pendingDetails.waitingForResponse || existingDetails.waitingForResponse
    : pendingDetails.waitingForResponse;
  return {
    ...existingDetails,
    messages:
      promotedPendingMessages.length === 0
        ? [...existingDetails.messages]
        : [...promotedPendingMessages, ...existingDetails.messages],
    toolCallArguments: {
      ...pendingDetails.toolCallArguments,
      ...existingDetails.toolCallArguments,
    },
    waitingForResponse: nextWaitingForResponse,
  };
}

export function finalizePendingChatDetails(chatId: string, surfaceId: string) {
  useAIStore.setState((state) => {
    const pendingDetails = getPendingChatDetailsForSurface(state, surfaceId);
    if (!pendingDetails) {
      return state;
    }
    const existingDetails =
      state.chatDetails[chatId] ?? getDefaultChatDetails();
    const pendingAppGeneration =
      getPendingChatAppGenerationDetailsForSurface(state, surfaceId) ??
      getDefaultChatAppGenerationDetails();
    const existingAppGeneration =
      state.chatAppGenerationDetailsByChatId[chatId] ??
      getDefaultChatAppGenerationDetails();
    return {
      chatDetails: {
        ...state.chatDetails,
        [chatId]: mergeChatDetails(
          existingDetails,
          pendingDetails,
          isChatStreamActive(chatId),
        ),
      },
      chatAppGenerationDetailsByChatId: {
        ...state.chatAppGenerationDetailsByChatId,
        [chatId]: mergeChatAppGenerationDetails(
          existingAppGeneration,
          pendingAppGeneration,
        ),
      },
      ...setPendingChatDetailsForSurface(state, surfaceId, null),
      ...setPendingChatAppGenerationDetailsForSurface(state, surfaceId, null),
    };
  });
}

export function commitPendingChatDetails(
  chatId: string,
  surfaceId: string | null | undefined,
) {
  useAIStore.setState((state) => {
    const pendingDetails = getPendingChatDetailsForSurface(state, surfaceId);
    if (!pendingDetails) {
      return state;
    }
    const existingDetails =
      state.chatDetails[chatId] ?? getDefaultChatDetails();
    const pendingAppGeneration =
      getPendingChatAppGenerationDetailsForSurface(state, surfaceId) ??
      getDefaultChatAppGenerationDetails();
    const existingAppGeneration =
      state.chatAppGenerationDetailsByChatId[chatId] ??
      getDefaultChatAppGenerationDetails();
    return {
      chatDetails: {
        ...state.chatDetails,
        [chatId]: mergeChatDetails(
          existingDetails,
          pendingDetails,
          isChatStreamActive(chatId),
        ),
      },
      chatAppGenerationDetailsByChatId: {
        ...state.chatAppGenerationDetailsByChatId,
        [chatId]: mergeChatAppGenerationDetails(
          existingAppGeneration,
          pendingAppGeneration,
        ),
      },
      ...setPendingChatDetailsForSurface(state, surfaceId, null),
      ...setPendingChatAppGenerationDetailsForSurface(state, surfaceId, null),
    };
  });
}

export function applyOptimisticUserMessage(
  chatId: string | null,
  userMessage: BaseChatMessageUnion,
  surfaceId: string | null | undefined = null,
  appGeneration: ChatAppGenerationContext | null = null,
) {
  const resolvedAppGeneration =
    normalizeChatAppGenerationContext(appGeneration);
  // eslint-disable-next-line complexity
  useAIStore.setState((state) => {
    if (typeof chatId === "string") {
      clearStopEligibleAssistantMessageId(chatId);
      return {
        chatDetails: {
          ...state.chatDetails,
          [chatId]: {
            ...getDefaultChatDetails(),
            ...(state.chatDetails[chatId] ?? {}),
            messages: [
              ...(state.chatDetails[chatId]?.messages ?? []),
              userMessage,
            ],
            waitingForResponse: true,
          },
        },
        chatAppGenerationDetailsByChatId: {
          ...state.chatAppGenerationDetailsByChatId,
          [chatId]: setChatAppGenerationForMessage(
            state.chatAppGenerationDetailsByChatId[chatId] ??
              getDefaultChatAppGenerationDetails(),
            [...(state.chatDetails[chatId]?.messages ?? []), userMessage],
            userMessage.id,
            resolvedAppGeneration,
          ),
        },
      };
    }
    const nextDetails = {
      ...(getPendingChatDetailsForSurface(state, surfaceId) ??
        getDefaultChatDetails()),
      messages: [
        ...(getPendingChatDetailsForSurface(state, surfaceId)?.messages ?? []),
        userMessage,
      ],
      waitingForResponse: true,
    };
    return {
      ...setPendingChatDetailsForSurface(state, surfaceId, nextDetails),
      ...setPendingChatAppGenerationDetailsForSurface(
        state,
        surfaceId,
        setChatAppGenerationForMessage(
          getPendingChatAppGenerationDetailsForSurface(state, surfaceId) ??
            getDefaultChatAppGenerationDetails(),
          nextDetails.messages,
          userMessage.id,
          resolvedAppGeneration,
        ),
      ),
    };
  });
}

export function rollbackOptimisticUserMessage(
  chatId: string | null,
  userMessageId: string,
  surfaceId: string | null | undefined = null,
) {
  useAIStore.setState((state) => {
    if (chatId === null) {
      const pendingDetails =
        getPendingChatDetailsForSurface(state, surfaceId) ??
        getDefaultChatDetails();
      const nextMessages = pendingDetails.messages.filter(
        (message) => message.id !== userMessageId,
      );
      return {
        ...setPendingChatDetailsForSurface(state, surfaceId, {
          ...pendingDetails,
          messages: nextMessages,
          waitingForResponse: false,
        }),
        ...setPendingChatAppGenerationDetailsForSurface(
          state,
          surfaceId,
          setChatAppGenerationForMessage(
            getPendingChatAppGenerationDetailsForSurface(state, surfaceId) ??
              getDefaultChatAppGenerationDetails(),
            nextMessages,
            userMessageId,
            null,
          ),
        ),
      };
    }
    const currentDetails = state.chatDetails[chatId] ?? getDefaultChatDetails();
    const nextMessages = currentDetails.messages.filter(
      (message) => message.id !== userMessageId,
    );
    return {
      chatDetails: {
        ...state.chatDetails,
        [chatId]: {
          ...currentDetails,
          messages: nextMessages,
          waitingForResponse: false,
        },
      },
      chatAppGenerationDetailsByChatId: {
        ...state.chatAppGenerationDetailsByChatId,
        [chatId]: setChatAppGenerationForMessage(
          state.chatAppGenerationDetailsByChatId[chatId] ??
            getDefaultChatAppGenerationDetails(),
          nextMessages,
          userMessageId,
          null,
        ),
      },
    };
  });
}
