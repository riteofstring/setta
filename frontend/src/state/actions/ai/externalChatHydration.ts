import {
  callOpenAPI,
  createNewId,
  getErrorDetail,
  res200,
} from "@setta/app-subsystem-frontend-sdk";

import {
  getLlmResponse as apiGetLlmResponse,
  respondExternalAgentApproval as apiRespondExternalAgentApproval,
  respondExternalAgentQuestion as apiRespondExternalAgentQuestion,
  setChatSectionChatId,
  type HttpapiExternalAgentChatResponse,
} from "openapi/http";

import { clearAIFollowToolArgumentsForChat } from "state/actions/aiFollow";

import { waitForFrontendAffinityToken } from "state/actions/frontendWebsocketAffinity";

import { addTemporaryNotification } from "state/actions/notifications";

import {
  dispatchOptimisticProjectStateUpdate,
  getCurrProjectConfigId,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionInfos";

import {
  recordFinalizedMessage,
  shouldPersistOnMessageStop,
} from "state/aiStreamingTracker";

import { useAIStore } from "state/definitions";

import {
  normalizeChatAppGenerationContext,
  retainChatAppGenerationDetailsForMessages,
  serializeChatAppGenerationByMessageId,
  setChatAppGenerationForMessage,
  type ChatAppGenerationContext,
  type ChatAppGenerationDetails,
} from "state/utils/chatAppGeneration";

import {
  AgentRun,
  BaseChatMessageUnion,
  ChatFileAttachment,
  ChatRoleEnum,
  LLMStreamingResponseContent,
  NotificationTypeEnum,
  RunStatusEnum,
  StreamingEventTypeEnum,
  createMessageTextContent,
} from "utils/generatedTypes";

import { getRunInputString, getRunLastUpdatedMs } from "../agentRunUtils";

import { buildEditedMessageHistory } from "../chatBranches";

import { applyHydratedChatDetailsToStore } from "../chatDetailsAuthority";

import {
  applyHydratedChatDetailsToSectionState,
  persistChatSectionState,
} from "../chatSectionAuthority";

import { applyChatSectionStreamDelta } from "../chatSectionStreaming";

import {
  ChatExecutionSettings,
  DEFAULT_CHAT_EXECUTION_SETTINGS,
} from "./apiKeysAndHealth";

import {
  getChatAppGenerationDetailsForTarget,
  loadAgentRuns,
  requirePendingChatSurfaceId,
} from "./llmConfigAndAgentRuns";

import {
  ChatHydrationOutcome,
  applyLLMChatHydrationSuccess,
  clearPendingChatDetails,
  clearStopEligibleAssistantMessageId,
  initializePendingChatDetailsWithMessages,
  probeExternalAgentChatHydration,
  probeLLMChatHydration,
} from "./chatHydration";

import {
  handleAgenticScopeViolation,
  resolveEngineConfigIdForChat,
} from "./streamingChunksAndTools";

import {
  applyOptimisticUserMessage,
  applyToolArgumentPreviewDeltaToPreviewStore,
  clearToolArgumentPreviewByToolCallId,
  clearToolArgumentPreviewByToolCallIds,
  commitPendingChatDetails,
  maybeApplyAppDefinitionToolResult,
  rollbackOptimisticUserMessage,
} from "./appDefinitionsAndRollback";

function applyExternalChatHydrationSuccess({
  chatId,
  projectConfigId,
  sectionId,
  payload,
}: {
  chatId: string;
  projectConfigId: string | null;
  sectionId?: string;
  payload: HttpapiExternalAgentChatResponse;
}): void {
  const {
    messages,
    waitingForResponse,
    toolCallArguments,
    contextUsage,
    appGenerationByMessageId,
  } = payload;
  const nextWaitingForResponse = applyHydratedChatDetailsToStore({
    chatId,
    messages,
    waitingForResponse,
    backendToolCallArguments: toolCallArguments,
    llmConfig: null,
    contextUsage: contextUsage ?? null,
    serializedAppGenerationByMessageId: appGenerationByMessageId,
  });
  if (sectionId) {
    const nextState = applyHydratedChatDetailsToSectionState({
      sectionId,
      messages,
      waitingForResponse,
      toolCallArguments,
    });
    const resolvedProjectConfigId = projectConfigId ?? getCurrProjectConfigId();
    persistChatSectionState({
      projectConfigId: resolvedProjectConfigId,
      sectionId,
      nextState,
      reason: "hydrate-external-chat",
    });
  }
  if (!nextWaitingForResponse) {
    clearStopEligibleAssistantMessageId(chatId);
    clearAIFollowToolArgumentsForChat(
      projectConfigId ?? getCurrProjectConfigId(),
      chatId,
    );
  }
}

export async function getLLMChatHydrationOutcome(
  chatId: string,
  sectionId?: string,
): Promise<ChatHydrationOutcome> {
  const projectConfigId = getCurrProjectConfigId();
  const outcome = await probeLLMChatHydration(chatId, projectConfigId);
  if (outcome.outcome === "success") {
    applyLLMChatHydrationSuccess({
      chatId,
      sectionId,
      projectConfigId,
      payload: outcome.payload,
    });
    return {
      outcome: "success",
      status: outcome.status,
      errorCode: null,
    };
  }
  return {
    outcome: outcome.outcome,
    status: outcome.status,
    errorCode: outcome.errorCode,
  };
}

export async function getLLMChat(
  chatId: string,
  sectionId?: string,
): Promise<boolean> {
  const outcome = await getLLMChatHydrationOutcome(chatId, sectionId);
  return outcome.outcome === "success";
}

export async function getExternalAgentChatHydrationOutcome(
  chatId: string,
  projectConfigId: string | null,
  sectionId?: string,
): Promise<ChatHydrationOutcome> {
  const outcome = await probeExternalAgentChatHydration(
    chatId,
    projectConfigId,
  );
  if (outcome.outcome === "success") {
    applyExternalChatHydrationSuccess({
      chatId,
      projectConfigId,
      sectionId,
      payload: outcome.payload,
    });
    return {
      outcome: "success",
      status: outcome.status,
      errorCode: null,
    };
  }
  return {
    outcome: outcome.outcome,
    status: outcome.status,
    errorCode: outcome.errorCode,
  };
}

export async function getExternalAgentChat(
  chatId: string,
  projectConfigId: string | null,
  sectionId?: string,
): Promise<boolean> {
  const outcome = await getExternalAgentChatHydrationOutcome(
    chatId,
    projectConfigId,
    sectionId,
  );
  return outcome.outcome === "success";
}

type SubmitMessageOptions = {
  messageId?: string;
  agentProfileId?: string | null;
  sectionId?: string | null;
  continueFromChatId?: string | null;
  pendingSurfaceId?: string | null;
  executionSettings?: ChatExecutionSettings | null;
  appGeneration?: ChatAppGenerationContext | null;
};

type PreparedSubmitMessage = {
  resolvedPendingSurfaceId: string | null;
  resolvedExecutionSettings: ChatExecutionSettings;
  appGeneration: ChatAppGenerationContext | null;
  userMessage: BaseChatMessageUnion;
  userMessageId: string;
  nextAppGenerationDetails: ChatAppGenerationDetails;
};

function buildSubmittedUserMessage(
  message: string,
  attachments: ChatFileAttachment[],
  messageId?: string,
): BaseChatMessageUnion {
  const content = [];
  const trimmed = message.trim();
  if (trimmed) {
    content.push(createMessageTextContent({ text: message }));
  }
  return {
    id: messageId ?? createNewId(),
    role: ChatRoleEnum.user,
    content,
    attachments,
    createdAt: Date.now(),
  };
}

function getTargetChatMessages(
  chatId: string | null,
  resolvedPendingSurfaceId: string | null,
): BaseChatMessageUnion[] {
  const state = useAIStore.getState();
  if (chatId === null) {
    return [
      ...(state.pendingChatDetailsBySurfaceId[resolvedPendingSurfaceId]
        ?.messages ?? []),
    ];
  }
  return [...(state.chatDetails[chatId]?.messages ?? [])];
}

function prepareSubmitMessage(
  chatId: string | null,
  message: string,
  attachments: ChatFileAttachment[],
  engineConfigId: string,
  options: SubmitMessageOptions,
): PreparedSubmitMessage | null {
  const trimmed = message.trim();
  if ((!trimmed && attachments.length === 0) || !engineConfigId) {
    return null;
  }
  const resolvedPendingSurfaceId =
    chatId === null
      ? requirePendingChatSurfaceId(options.pendingSurfaceId ?? null)
      : options.pendingSurfaceId ?? null;
  const resolvedExecutionSettings =
    options.executionSettings ?? DEFAULT_CHAT_EXECUTION_SETTINGS;
  const appGeneration = normalizeChatAppGenerationContext(
    options.appGeneration ?? null,
  );
  const userMessage = buildSubmittedUserMessage(
    message,
    attachments,
    options.messageId,
  );
  const nextMessages = [
    ...getTargetChatMessages(chatId, resolvedPendingSurfaceId),
    userMessage,
  ];
  const nextAppGenerationDetails = setChatAppGenerationForMessage(
    getChatAppGenerationDetailsForTarget(
      useAIStore.getState(),
      chatId,
      resolvedPendingSurfaceId,
    ),
    nextMessages,
    userMessage.id,
    appGeneration,
  );
  return {
    resolvedPendingSurfaceId,
    resolvedExecutionSettings,
    appGeneration,
    userMessage,
    userMessageId: userMessage.id,
    nextAppGenerationDetails,
  };
}

async function hydrateSubmittedChat(
  returnedChatId: string,
  isExternalEngine: boolean,
  projectConfigId: string,
  sectionId?: string | null,
): Promise<void> {
  if (isExternalEngine) {
    await getExternalAgentChat(
      returnedChatId,
      projectConfigId,
      sectionId ?? undefined,
    );
    return;
  }
  await getLLMChat(returnedChatId, sectionId ?? undefined);
}

function resolveChatRequestFailureDetail(res: {
  data: unknown;
  status: number | undefined;
}): string {
  return (
    getErrorDetail(res.data) ??
    (typeof res.status === "number"
      ? `Chat request failed (status ${res.status}).`
      : "Chat request failed.")
  );
}

function rollbackSubmittedMessage(
  chatId: string | null,
  userMessageId: string,
  resolvedPendingSurfaceId: string | null,
  err: unknown,
): never {
  const detail =
    err instanceof Error && err.message.trim()
      ? err.message
      : "AI request failed.";
  addTemporaryNotification(detail, NotificationTypeEnum.warning);
  rollbackOptimisticUserMessage(
    chatId,
    userMessageId,
    resolvedPendingSurfaceId,
  );
  throw err;
}

// eslint-disable-next-line max-params, complexity
export async function submitMessage(
  chatId: string | null,
  message: string,
  attachments: ChatFileAttachment[],
  thinking: boolean,
  engineConfigId: string,
  isExternalEngine: boolean,
  options: SubmitMessageOptions = {},
): Promise<string | null> {
  const prepared = prepareSubmitMessage(
    chatId,
    message,
    attachments,
    engineConfigId,
    options,
  );
  if (!prepared) {
    return null;
  }
  applyOptimisticUserMessage(
    chatId,
    prepared.userMessage,
    prepared.resolvedPendingSurfaceId,
    prepared.appGeneration,
  );
  try {
    const projectConfigId = getCurrProjectConfigId();
    const frontendAffinityToken = await waitForFrontendAffinityToken();
    const res = await callOpenAPI(
      apiGetLlmResponse({
        body: {
          message: prepared.userMessage,
          thinking,
          chatId,
          continueFromChatId: options.continueFromChatId ?? null,
          engineConfigId,
          agentProfileId: options.agentProfileId ?? null,
          appGenerationMode: prepared.appGeneration?.mode ?? null,
          appGenerationByMessageId: serializeChatAppGenerationByMessageId(
            prepared.nextAppGenerationDetails,
          ),
          projectConfigId,
          sectionId: options.sectionId ?? null,
          frontendAffinityToken,
          allowUnscoped: options.sectionId == null,
          permissionMode: prepared.resolvedExecutionSettings.permissionMode,
          searchEnabled: prepared.resolvedExecutionSettings.searchEnabled,
        },
      } as Parameters<typeof apiGetLlmResponse>[0]),
    );
    if (!res200(res)) {
      throw new Error(resolveChatRequestFailureDetail(res));
    }
    const returnedChatId = res.data;
    if (returnedChatId) {
      await hydrateSubmittedChat(
        returnedChatId,
        isExternalEngine,
        projectConfigId,
        options.sectionId,
      );
    }
    return returnedChatId;
  } catch (err) {
    return rollbackSubmittedMessage(
      chatId,
      prepared.userMessageId,
      prepared.resolvedPendingSurfaceId,
      err,
    );
  }
}

// eslint-disable-next-line complexity
export async function submitEditedMessage({
  parentChatId,
  messages,
  messageId,
  message,
  attachments,
  thinking,
  engineConfigId,
  isExternalEngine,
  agentProfileId,
  sectionId,
  pendingSurfaceId,
  executionSettings,
  appGeneration,
}: {
  parentChatId: string;
  messages: Array<BaseChatMessageUnion>;
  messageId: string;
  message: string;
  attachments: ChatFileAttachment[];
  thinking: boolean;
  engineConfigId: string | null;
  isExternalEngine: boolean;
  agentProfileId?: string | null;
  sectionId?: string | null;
  pendingSurfaceId?: string | null;
  executionSettings?: ChatExecutionSettings | null;
  appGeneration?: ChatAppGenerationContext | null;
}): Promise<string | null> {
  const trimmed = message.trim();
  if (!trimmed && attachments.length === 0) {
    return null;
  }
  const resolvedExecutionSettings =
    executionSettings ?? DEFAULT_CHAT_EXECUTION_SETTINGS;
  const resolvedAppGeneration = normalizeChatAppGenerationContext(
    appGeneration ?? null,
  );
  const editedMessage = buildSubmittedUserMessage(
    message,
    attachments,
    messageId,
  );
  const nextMessages = buildEditedMessageHistory(messages, editedMessage);
  if (!nextMessages) {
    return null;
  }
  const resolvedPendingSurfaceId = requirePendingChatSurfaceId(
    pendingSurfaceId ?? null,
  );
  const parentAppGenerationDetails = getChatAppGenerationDetailsForTarget(
    useAIStore.getState(),
    parentChatId,
    null,
  );
  const nextAppGenerationDetails = setChatAppGenerationForMessage(
    retainChatAppGenerationDetailsForMessages(
      parentAppGenerationDetails,
      nextMessages,
    ),
    nextMessages,
    messageId,
    resolvedAppGeneration,
  );
  const resolvedEngineConfigId = await resolveEngineConfigIdForChat(
    parentChatId,
    engineConfigId,
  );
  if (!resolvedEngineConfigId) {
    return null;
  }
  initializePendingChatDetailsWithMessages(
    nextMessages,
    true,
    resolvedPendingSurfaceId,
    nextAppGenerationDetails,
  );
  const projectConfigId = getCurrProjectConfigId();
  const setSectionChatId = async (nextChatId: string | null) => {
    if (!sectionId) {
      return;
    }
    dispatchOptimisticProjectStateUpdate({
      apply: (state) => {
        setCurrEffectiveSectionImplValue<"ChatSection">(state, sectionId, {
          chatId: nextChatId,
        });
      },
      send: () =>
        callOpenAPI(
          setChatSectionChatId({
            body: {
              projectConfigId,
              sectionId,
              chatId: nextChatId,
            },
          } as Parameters<typeof setChatSectionChatId>[0]),
        ),
    });
  };
  if (sectionId) {
    await setSectionChatId(null);
  }
  try {
    const frontendAffinityToken = await waitForFrontendAffinityToken();
    const res = await callOpenAPI(
      apiGetLlmResponse({
        body: {
          message: editedMessage,
          thinking,
          chatId: null,
          engineConfigId: resolvedEngineConfigId,
          agentProfileId: agentProfileId ?? null,
          projectConfigId,
          sectionId: sectionId ?? null,
          frontendAffinityToken,
          allowUnscoped: sectionId == null,
          branchParentChatId: parentChatId,
          branchFromMessageId: messageId,
          appGenerationMode: resolvedAppGeneration?.mode ?? null,
          appGenerationByMessageId: serializeChatAppGenerationByMessageId(
            nextAppGenerationDetails,
          ),
          permissionMode: resolvedExecutionSettings.permissionMode,
          searchEnabled: resolvedExecutionSettings.searchEnabled,
        },
      } as Parameters<typeof apiGetLlmResponse>[0]),
    );
    if (!res200(res)) {
      const detail = resolveChatRequestFailureDetail({
        data: res.data,
        status: res.status,
      });
      addTemporaryNotification(detail, NotificationTypeEnum.warning);
      clearPendingChatDetails(resolvedPendingSurfaceId);
      if (sectionId) {
        await setSectionChatId(parentChatId);
      }
      return null;
    }
    const returnedChatId = res.data;
    if (returnedChatId) {
      await hydrateSubmittedChat(
        returnedChatId,
        isExternalEngine,
        projectConfigId,
        sectionId,
      );
      if (sectionId) {
        await setSectionChatId(returnedChatId);
        commitPendingChatDetails(returnedChatId, resolvedPendingSurfaceId);
      } else {
        commitPendingChatDetails(returnedChatId, resolvedPendingSurfaceId);
      }
    } else {
      clearPendingChatDetails(resolvedPendingSurfaceId);
    }
    return returnedChatId;
  } catch (err) {
    const detail =
      err instanceof Error && err.message.trim()
        ? err.message
        : "AI request failed.";
    addTemporaryNotification(detail, NotificationTypeEnum.warning);
    clearPendingChatDetails(resolvedPendingSurfaceId);
    if (sectionId) {
      await setSectionChatId(parentChatId);
    }
    throw err;
  }
}

export async function respondExternalAgentApproval(
  approvalId: string,
  approved: boolean,
): Promise<boolean> {
  const res = await callOpenAPI(
    apiRespondExternalAgentApproval({
      body: {
        approvalId,
        approved,
      },
    } as Parameters<typeof apiRespondExternalAgentApproval>[0]),
  );
  return res200(res);
}

export async function respondExternalAgentQuestion(
  toolCallId: string,
  answers: Record<string, string>,
): Promise<boolean> {
  const res = await callOpenAPI(
    apiRespondExternalAgentQuestion({
      body: {
        toolCallId,
        answers,
      },
    } as Parameters<typeof apiRespondExternalAgentQuestion>[0]),
  );
  return res200(res);
}

export async function findLatestRunningExternalRunId(
  chatId: string,
  projectConfigId: string | null,
): Promise<string | null> {
  let { agentRuns, agentRunsInitialLoadComplete } = useAIStore.getState();
  if (!agentRunsInitialLoadComplete) {
    await loadAgentRuns();
    ({ agentRuns, agentRunsInitialLoadComplete } = useAIStore.getState());
  }
  if (!agentRunsInitialLoadComplete) {
    return null;
  }
  const runs = agentRuns.filter((run) =>
    isMatchingRunningExternalRun(run, chatId, projectConfigId),
  );
  if (runs.length === 0) {
    return null;
  }
  runs.sort((a, b) => getRunLastUpdatedMs(b) - getRunLastUpdatedMs(a));
  return runs[0]?.id ?? null;
}

function isMatchingRunningExternalRun(
  run: AgentRun,
  chatId: string,
  projectConfigId: string | null,
): boolean {
  if (run.status !== RunStatusEnum.running) {
    return false;
  }
  if (getRunInputString(run, "runType") !== "external_agent") {
    return false;
  }
  if (getRunInputString(run, "chatId") !== chatId) {
    return false;
  }
  if (!projectConfigId) {
    return true;
  }
  return getRunInputString(run, "projectConfigId") === projectConfigId;
}

export function applyStreamingChunkToSection(
  sectionId: string,
  chunk: LLMStreamingResponseContent["chunk"],
  projectConfigId: string,
) {
  const nextState = applyChatSectionStreamDelta(sectionId, chunk);
  if (chunk.type === StreamingEventTypeEnum.tool_argument_preview_delta) {
    applyToolArgumentPreviewDeltaToPreviewStore(chunk, projectConfigId);
    return;
  }
  if (chunk.type === StreamingEventTypeEnum.tool_result) {
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
  if (chunk.type === StreamingEventTypeEnum.message_finalized) {
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
  if (chunk.type === StreamingEventTypeEnum.message_stop) {
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
