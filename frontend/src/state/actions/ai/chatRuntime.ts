import { addTemporaryNotification } from "state/actions/notifications";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrProjectConfigId,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionInfos";
import {
  isChatStreamActive,
  isSectionStreamActive,
} from "state/aiStreamingTracker";
import { clearAllAppSpecPatchStreams } from "state/appSpecPatchStreaming";
import {
  ChatDetails,
  useAIStore,
  useProjectState,
  type ZustandProjectState,
} from "state/definitions";
import { getErrorCode, res200 } from "utils/endpointUtils";
import {
  route_get_external_agent_chat,
  route_get_llm_chat,
  route_set_chat_section_state,
  route_stop_external_agent_run,
  route_stop_llm_chat,
} from "utils/generatedEndpoints";
import {
  AgentRunStatusEnum,
  type BaseChatMessageUnion,
  ChatSectionBranch,
  type ChatSectionState,
  SectionTypeEnum,
  SettaNotificationTypeEnum,
} from "utils/generatedTypes";
import {
  mergeChatMessages,
  reconcileHydratedChatMessages,
} from "../chatMergeUtils";
import { findLatestRunningExternalRunId, loadAgentRuns } from "./agentRuns";

export function getDefaultChatDetails(): ChatDetails {
  return {
    messages: [],
    toolCallArguments: {},
    waitingForResponse: false,
    llmConfig: null,
    contextUsage: null,
  };
}

function normalizePendingChatSurfaceId(
  surfaceId: string | null | undefined,
): string | null {
  if (typeof surfaceId !== "string") {
    return null;
  }
  const normalizedSurfaceId = surfaceId.trim();
  if (!normalizedSurfaceId) {
    return null;
  }
  return normalizedSurfaceId;
}

export function requirePendingChatSurfaceId(
  surfaceId: string | null | undefined,
): string {
  const normalizedSurfaceId = normalizePendingChatSurfaceId(surfaceId);
  if (!normalizedSurfaceId) {
    throw new Error("Pending chat surface id is required.");
  }
  return normalizedSurfaceId;
}

function getPendingChatDetailsForSurface(
  state: ReturnType<typeof useAIStore.getState>,
  surfaceId: string | null | undefined,
): ChatDetails | null {
  return (
    state.pendingChatDetailsBySurfaceId[
      requirePendingChatSurfaceId(surfaceId)
    ] ?? null
  );
}

function setPendingChatDetailsForSurface(
  state: ReturnType<typeof useAIStore.getState>,
  surfaceId: string | null | undefined,
  nextDetails: ChatDetails | null,
): Partial<ReturnType<typeof useAIStore.getState>> {
  const normalizedSurfaceId = requirePendingChatSurfaceId(surfaceId);
  const currentDetails =
    state.pendingChatDetailsBySurfaceId[normalizedSurfaceId];
  if (currentDetails === nextDetails) {
    return state;
  }
  const nextBySurfaceId = {
    ...state.pendingChatDetailsBySurfaceId,
  };
  if (nextDetails === null) {
    delete nextBySurfaceId[normalizedSurfaceId];
  } else {
    nextBySurfaceId[normalizedSurfaceId] = nextDetails;
  }
  return {
    pendingChatDetailsBySurfaceId: nextBySurfaceId,
  };
}

const stopEligibleAssistantMessageIdByChatId = new Map<string, string>();

type StopChatResponseSnapshot = {
  waitingForResponse: boolean;
  toolCallArguments: Record<string, string>;
  interruptedAssistantMessageIdsByChat: Record<string, true>;
  stopEligibleAssistantMessageId: string | null;
};

export function setStopEligibleAssistantMessageId(
  chatId: string,
  messageId: string,
) {
  const normalizedChatId = chatId.trim();
  const normalizedMessageId = messageId.trim();
  if (!normalizedChatId || !normalizedMessageId) {
    return;
  }
  stopEligibleAssistantMessageIdByChatId.set(
    normalizedChatId,
    normalizedMessageId,
  );
}

export function clearStopEligibleAssistantMessageId(chatId: string) {
  const normalizedChatId = chatId.trim();
  if (!normalizedChatId) {
    return;
  }
  stopEligibleAssistantMessageIdByChatId.delete(normalizedChatId);
}

function markInterruptedAssistantMessage(chatId: string, messageId: string) {
  useAIStore.setState((state) => {
    const existingByChat =
      state.interruptedAssistantMessageIdsByChatId[chatId] ?? {};
    if (existingByChat[messageId]) {
      return state;
    }
    return {
      interruptedAssistantMessageIdsByChatId: {
        ...state.interruptedAssistantMessageIdsByChatId,
        [chatId]: {
          ...existingByChat,
          [messageId]: true,
        },
      },
    };
  });
}

export function clearInterruptedAssistantMessages(
  chatId: string,
  messageIds: Array<string | null | undefined>,
) {
  const normalizedIds = messageIds.filter(
    (messageId): messageId is string => typeof messageId === "string",
  );
  if (normalizedIds.length === 0) {
    return;
  }
  useAIStore.setState((state) => {
    const existingByChat =
      state.interruptedAssistantMessageIdsByChatId[chatId] ?? {};
    let changed = false;
    const nextByChat = { ...existingByChat };
    for (const messageId of normalizedIds) {
      if (nextByChat[messageId]) {
        changed = true;
        delete nextByChat[messageId];
      }
    }
    if (!changed) {
      return state;
    }
    if (Object.keys(nextByChat).length === 0) {
      const nextByChatId = {
        ...state.interruptedAssistantMessageIdsByChatId,
      };
      delete nextByChatId[chatId];
      return {
        interruptedAssistantMessageIdsByChatId: nextByChatId,
      };
    }
    return {
      interruptedAssistantMessageIdsByChatId: {
        ...state.interruptedAssistantMessageIdsByChatId,
        [chatId]: nextByChat,
      },
    };
  });
}

function interruptedMessageMapEquals(
  left: Record<string, true>,
  right: Record<string, true>,
): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }
  for (const key of leftKeys) {
    if (!right[key]) {
      return false;
    }
  }
  return true;
}

function restoreInterruptedAssistantMessageSnapshot(
  chatId: string | null | undefined,
  snapshot: StopChatResponseSnapshot,
) {
  if (typeof chatId !== "string") {
    return;
  }
  useAIStore.setState((state) => {
    const currentByChat =
      state.interruptedAssistantMessageIdsByChatId[chatId] ?? {};
    const snapshotByChat = snapshot.interruptedAssistantMessageIdsByChat;
    if (interruptedMessageMapEquals(currentByChat, snapshotByChat)) {
      return state;
    }
    const nextByChatId = {
      ...state.interruptedAssistantMessageIdsByChatId,
    };
    if (Object.keys(snapshotByChat).length === 0) {
      delete nextByChatId[chatId];
    } else {
      nextByChatId[chatId] = { ...snapshotByChat };
    }
    return {
      interruptedAssistantMessageIdsByChatId: nextByChatId,
    };
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

export function getChatSectionStateFromStore(
  state: ZustandProjectState,
  sectionId: string,
): ChatSectionState | null {
  const variantId = state.projectConfig.sectionVariantMap[sectionId];
  if (!variantId) {
    return null;
  }
  const variant = state.sectionVariants[variantId];
  if (!variant) {
    return null;
  }
  const impl = state.sectionImpls[variant.impl];
  if (!impl) {
    return null;
  }
  const core = state.sections[sectionId];
  if (!core) {
    return null;
  }
  const effective = {
    ...impl,
    ...core.sharedModifier,
    ...variant.modifier,
  };
  if (effective.type !== SectionTypeEnum.Chat) {
    return null;
  }
  const chatImpl = effective as {
    type: SectionTypeEnum.Chat;
    messages: BaseChatMessageUnion[];
    inputText: string;
    waitingForResponse: boolean;
    toolCallArguments: Record<string, string>;
    activeBranchId?: string | null;
    branches?: Record<string, ChatSectionBranch>;
  };
  return {
    messages: [...(chatImpl.messages ?? [])],
    inputText: chatImpl.inputText ?? "",
    waitingForResponse: Boolean(chatImpl.waitingForResponse),
    toolCallArguments: { ...(chatImpl.toolCallArguments ?? {}) },
    activeBranchId: chatImpl.activeBranchId ?? null,
    branches: { ...(chatImpl.branches ?? {}) },
  };
}

function mergeChatSectionState(
  currentState: ChatSectionState,
  incoming: {
    messages: Array<BaseChatMessageUnion>;
    waitingForResponse: boolean;
    toolCallArguments: Record<string, string>;
  },
  preserveWaitingForResponse: boolean,
): ChatSectionState {
  const mergedMessages = reconcileHydratedChatMessages({
    backendMessages: incoming.messages ?? [],
    localMessages: currentState.messages ?? [],
    preserveLocalOnlyMessages: preserveWaitingForResponse,
  });
  const nextWaitingForResponse = preserveWaitingForResponse
    ? Boolean(incoming.waitingForResponse || currentState.waitingForResponse)
    : Boolean(incoming.waitingForResponse);
  const nextToolCallArguments = preserveWaitingForResponse
    ? {
        ...(currentState.toolCallArguments ?? {}),
        ...(incoming.toolCallArguments ?? {}),
      }
    : { ...(incoming.toolCallArguments ?? {}) };
  return {
    messages: mergedMessages,
    inputText: currentState.inputText ?? "",
    waitingForResponse: nextWaitingForResponse,
    toolCallArguments: nextToolCallArguments,
    activeBranchId: currentState.activeBranchId ?? null,
    branches: { ...(currentState.branches ?? {}) },
  };
}

function applyChatDetailsToSectionState({
  sectionId,
  messages,
  waitingForResponse,
  toolCallArguments,
}: {
  sectionId: string;
  messages: Array<BaseChatMessageUnion>;
  waitingForResponse: boolean;
  toolCallArguments: Record<string, string>;
}): ChatSectionState | null {
  let nextState: ChatSectionState | null = null;
  useProjectState.setState((state) => {
    const currentState = getChatSectionStateFromStore(state, sectionId);
    if (!currentState) {
      return;
    }
    const preserveWaitingForResponse = isSectionStreamActive(sectionId);
    nextState = mergeChatSectionState(
      currentState,
      {
        messages,
        waitingForResponse,
        toolCallArguments,
      },
      preserveWaitingForResponse,
    );
    setCurrEffectiveSectionImplValue<"ChatSection">(state, sectionId, {
      messages: nextState.messages,
      waitingForResponse: nextState.waitingForResponse,
      toolCallArguments: nextState.toolCallArguments,
      inputText: nextState.inputText,
      activeBranchId: nextState.activeBranchId,
      branches: nextState.branches,
    });
  });
  return nextState;
}

export function persistChatSectionState({
  projectConfigId,
  sectionId,
  nextState,
}: {
  projectConfigId: string;
  sectionId: string;
  nextState: ChatSectionState | null;
}): void {
  if (!nextState) {
    return;
  }
  dispatchOptimisticProjectStateUpdate({
    apply: (state) => {
      setCurrEffectiveSectionImplValue<"ChatSection">(state, sectionId, {
        messages: nextState.messages,
        inputText: nextState.inputText,
        waitingForResponse: nextState.waitingForResponse,
        toolCallArguments: nextState.toolCallArguments,
        activeBranchId: nextState.activeBranchId,
        branches: nextState.branches,
      });
    },
    send: (frontendOpId) =>
      route_set_chat_section_state({
        projectConfigId,
        sectionId,
        state: nextState,
        frontendOpId,
      }),
  });
}

export function initializePendingChatDetails(surfaceId: string) {
  useAIStore.setState((state) =>
    setPendingChatDetailsForSurface(state, surfaceId, getDefaultChatDetails()),
  );
}

export function initializePendingChatDetailsWithMessages(
  messages: Array<BaseChatMessageUnion>,
  waitingForResponse: boolean = true,
  surfaceId: string | null | undefined,
) {
  useAIStore.setState((state) =>
    setPendingChatDetailsForSurface(state, surfaceId, {
      ...getDefaultChatDetails(),
      messages,
      waitingForResponse,
    }),
  );
}

export function seedPendingChatDetails(
  messages: Array<BaseChatMessageUnion>,
  surfaceId: string,
) {
  initializePendingChatDetailsWithMessages(messages, false, surfaceId);
}

export function clearPendingChatDetails(surfaceId: string) {
  useAIStore.setState((state) =>
    setPendingChatDetailsForSurface(state, surfaceId, null),
  );
}

function mergeChatDetails(
  existingDetails: ChatDetails,
  pendingDetails: ChatDetails,
  preserveWaitingForResponse: boolean,
): ChatDetails {
  const nextWaitingForResponse = preserveWaitingForResponse
    ? pendingDetails.waitingForResponse || existingDetails.waitingForResponse
    : pendingDetails.waitingForResponse;
  return {
    ...existingDetails,
    ...pendingDetails,
    messages: mergeChatMessages(
      existingDetails.messages,
      pendingDetails.messages,
    ),
    toolCallArguments: {
      ...existingDetails.toolCallArguments,
      ...pendingDetails.toolCallArguments,
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
    return {
      chatDetails: {
        ...state.chatDetails,
        [chatId]: mergeChatDetails(
          existingDetails,
          pendingDetails,
          isChatStreamActive(chatId),
        ),
      },
      ...setPendingChatDetailsForSurface(state, surfaceId, null),
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
    return {
      chatDetails: {
        ...state.chatDetails,
        [chatId]: mergeChatDetails(
          existingDetails,
          pendingDetails,
          isChatStreamActive(chatId),
        ),
      },
      ...setPendingChatDetailsForSurface(state, surfaceId, null),
    };
  });
}

export type ChatHydrationOutcomeType =
  | "success"
  | "transient_failure"
  | "terminal_failure";

export type ChatHydrationErrorCode =
  | "llm_disallowed"
  | "chat_not_found"
  | "chat_runtime_ambiguous"
  | "terminal_hydration_failure";

export type ChatHydrationOutcome = {
  outcome: ChatHydrationOutcomeType;
  status: number | undefined;
  errorCode: ChatHydrationErrorCode | null;
};

type ProjectChatHydrationRunType = "llm_chat" | "external_agent";

function parseChatHydrationErrorCode(
  value: string | null,
): ChatHydrationErrorCode | null {
  if (value === "llm_disallowed") {
    return "llm_disallowed";
  }
  if (value === "chat_not_found") {
    return "chat_not_found";
  }
  if (value === "chat_runtime_ambiguous") {
    return "chat_runtime_ambiguous";
  }
  return null;
}

function classifyChatHydrationOutcomeType(
  status: number | undefined,
): ChatHydrationOutcomeType {
  if (status === 403 || status === 404 || status === 409) {
    return "terminal_failure";
  }
  return "transient_failure";
}

function buildChatHydrationFailureOutcome(response: {
  status: number | undefined;
  data: unknown;
}): ChatHydrationOutcome {
  const outcome = classifyChatHydrationOutcomeType(response.status);
  const parsedErrorCode = parseChatHydrationErrorCode(
    getErrorCode(response.data),
  );
  return {
    outcome,
    status: response.status,
    errorCode:
      outcome === "terminal_failure"
        ? parsedErrorCode ??
          (response.status === 403
            ? "llm_disallowed"
            : "terminal_hydration_failure")
        : parsedErrorCode,
  };
}

type ChatHydrationProbeResult<TPayload> =
  | {
      outcome: "success";
      status: number | undefined;
      errorCode: null;
      payload: TPayload;
    }
  | {
      outcome: ChatHydrationOutcomeType;
      status: number | undefined;
      errorCode: ChatHydrationErrorCode | null;
      payload: null;
    };

async function probeLLMChatHydration(
  chatId: string,
  projectConfigId: string,
): Promise<
  ChatHydrationProbeResult<
    NonNullable<Awaited<ReturnType<typeof route_get_llm_chat>>["data"]>
  >
> {
  const response = await route_get_llm_chat({ chatId, projectConfigId });
  if (!res200(response)) {
    return {
      ...buildChatHydrationFailureOutcome(response),
      payload: null,
    };
  }
  return {
    outcome: "success",
    status: response.status,
    errorCode: null,
    payload: response.data,
  };
}

async function probeExternalAgentChatHydration(
  chatId: string,
  projectConfigId: string | null,
): Promise<
  ChatHydrationProbeResult<
    NonNullable<
      Awaited<ReturnType<typeof route_get_external_agent_chat>>["data"]
    >
  >
> {
  const response = await route_get_external_agent_chat({
    chatId,
    projectConfigId,
  });
  if (!res200(response)) {
    return {
      ...buildChatHydrationFailureOutcome(response),
      payload: null,
    };
  }
  return {
    outcome: "success",
    status: response.status,
    errorCode: null,
    payload: response.data,
  };
}

function applyLLMChatHydrationSuccess({
  chatId,
  sectionId,
  projectConfigId,
  payload,
}: {
  chatId: string;
  sectionId?: string;
  projectConfigId: string;
  payload: NonNullable<Awaited<ReturnType<typeof route_get_llm_chat>>["data"]>;
}): void {
  const { messages, waitingForResponse, llmConfig, contextUsage } = payload;
  useAIStore.setState((state) => {
    const existingDetails = state.chatDetails[chatId];
    const preserveWaitingForResponse = isChatStreamActive(chatId);
    const nextWaitingForResponse = preserveWaitingForResponse
      ? Boolean(waitingForResponse || existingDetails?.waitingForResponse)
      : Boolean(waitingForResponse);
    const nextMessages = reconcileHydratedChatMessages({
      backendMessages: messages,
      localMessages: existingDetails?.messages ?? [],
      preserveLocalOnlyMessages: preserveWaitingForResponse,
    });
    return {
      chatDetails: {
        ...state.chatDetails,
        [chatId]: {
          ...getDefaultChatDetails(),
          ...(existingDetails ?? {}),
          messages: nextMessages,
          waitingForResponse: nextWaitingForResponse,
          llmConfig: llmConfig,
          contextUsage: contextUsage ?? null,
        },
      },
    };
  });
  if (sectionId) {
    const nextState = applyChatDetailsToSectionState({
      sectionId,
      messages,
      waitingForResponse,
      toolCallArguments: {},
    });
    persistChatSectionState({
      projectConfigId,
      sectionId,
      nextState,
      reason: "hydrate-llm-chat",
    });
  }
  if (!waitingForResponse) {
    clearStopEligibleAssistantMessageId(chatId);
  }
}

function applyExternalChatHydrationSuccess({
  chatId,
  projectConfigId,
  sectionId,
  payload,
}: {
  chatId: string;
  projectConfigId: string | null;
  sectionId?: string;
  payload: NonNullable<
    Awaited<ReturnType<typeof route_get_external_agent_chat>>["data"]
  >;
}): void {
  const { messages, waitingForResponse, toolCallArguments, contextUsage } =
    payload;
  useAIStore.setState((state) => {
    const existingDetails = state.chatDetails[chatId];
    const preserveWaitingForResponse = isChatStreamActive(chatId);
    const nextWaitingForResponse = preserveWaitingForResponse
      ? Boolean(waitingForResponse || existingDetails?.waitingForResponse)
      : Boolean(waitingForResponse);
    const nextMessages = reconcileHydratedChatMessages({
      backendMessages: messages,
      localMessages: existingDetails?.messages ?? [],
      preserveLocalOnlyMessages: preserveWaitingForResponse,
    });
    return {
      chatDetails: {
        ...state.chatDetails,
        [chatId]: {
          ...getDefaultChatDetails(),
          ...(existingDetails ?? {}),
          messages: nextMessages,
          waitingForResponse: nextWaitingForResponse,
          toolCallArguments,
          llmConfig: null,
          contextUsage: contextUsage ?? null,
        },
      },
    };
  });
  if (sectionId) {
    const nextState = applyChatDetailsToSectionState({
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
  if (!waitingForResponse) {
    clearStopEligibleAssistantMessageId(chatId);
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

export async function getProjectChatHydrationOutcomeWithFallback(
  chatId: string,
  projectConfigId: string,
  preferredRunType: ProjectChatHydrationRunType | null,
  sectionId?: string,
): Promise<ChatHydrationOutcome> {
  const [llmProbe, externalProbe] = await Promise.all([
    probeLLMChatHydration(chatId, projectConfigId),
    probeExternalAgentChatHydration(chatId, projectConfigId),
  ]);

  if (llmProbe.outcome === "success" && externalProbe.outcome === "success") {
    return {
      outcome: "terminal_failure",
      status: 409,
      errorCode: "chat_runtime_ambiguous",
    };
  }
  if (llmProbe.outcome === "success") {
    applyLLMChatHydrationSuccess({
      chatId,
      sectionId,
      projectConfigId,
      payload: llmProbe.payload,
    });
    return {
      outcome: "success",
      status: llmProbe.status,
      errorCode: null,
    };
  }
  if (externalProbe.outcome === "success") {
    applyExternalChatHydrationSuccess({
      chatId,
      projectConfigId,
      sectionId,
      payload: externalProbe.payload,
    });
    return {
      outcome: "success",
      status: externalProbe.status,
      errorCode: null,
    };
  }

  const orderedOutcomes =
    preferredRunType === "external_agent"
      ? [externalProbe, llmProbe]
      : [llmProbe, externalProbe];
  const prioritizedOutcome = orderedOutcomes.find(
    (outcome) => outcome.errorCode !== "chat_not_found",
  );
  const resolvedOutcome = prioritizedOutcome ?? orderedOutcomes[0];
  return {
    outcome: resolvedOutcome.outcome,
    status: resolvedOutcome.status,
    errorCode: resolvedOutcome.errorCode,
  };
}

function getStopChatResponseSnapshot(
  chatId: string | null | undefined,
  pendingSurfaceId: string | null | undefined = null,
): StopChatResponseSnapshot {
  const state = useAIStore.getState();
  const currentDetails =
    typeof chatId === "string"
      ? state.chatDetails[chatId] ?? getDefaultChatDetails()
      : getPendingChatDetailsForSurface(state, pendingSurfaceId) ??
        getDefaultChatDetails();
  const interruptedAssistantMessageIdsByChat =
    typeof chatId === "string"
      ? {
          ...(state.interruptedAssistantMessageIdsByChatId[chatId] ?? {}),
        }
      : {};
  return {
    waitingForResponse: currentDetails.waitingForResponse,
    toolCallArguments: { ...currentDetails.toolCallArguments },
    interruptedAssistantMessageIdsByChat,
    stopEligibleAssistantMessageId:
      typeof chatId === "string"
        ? stopEligibleAssistantMessageIdByChatId.get(chatId) ?? null
        : null,
  };
}

function restoreStoppedChatResponseLocally(
  chatId: string | null | undefined,
  snapshot: StopChatResponseSnapshot,
  pendingSurfaceId: string | null | undefined = null,
) {
  const restoreDetails = (details: ChatDetails): ChatDetails => ({
    ...details,
    waitingForResponse: snapshot.waitingForResponse,
    toolCallArguments: { ...snapshot.toolCallArguments },
  });
  if (typeof chatId === "string") {
    updateChatDetails(chatId, restoreDetails);
    return;
  }
  updatePendingChatDetails(restoreDetails, pendingSurfaceId);
}

function stopChatResponseLocally(
  chatId: string | null | undefined,
  options: {
    markInterruptedOptimistically?: boolean;
    pendingSurfaceId?: string | null;
  } = {},
): StopChatResponseSnapshot {
  const markInterruptedOptimistically =
    options.markInterruptedOptimistically ?? true;
  const pendingSurfaceId = options.pendingSurfaceId ?? null;
  const snapshot = getStopChatResponseSnapshot(chatId, pendingSurfaceId);
  const stopDetails = (details: ChatDetails): ChatDetails => ({
    ...details,
    waitingForResponse: false,
  });
  if (typeof chatId === "string") {
    updateChatDetails(chatId, stopDetails);
    if (
      markInterruptedOptimistically &&
      snapshot.waitingForResponse &&
      snapshot.stopEligibleAssistantMessageId
    ) {
      markInterruptedAssistantMessage(
        chatId,
        snapshot.stopEligibleAssistantMessageId,
      );
    }
  } else {
    updatePendingChatDetails(stopDetails, pendingSurfaceId);
  }
  clearAllAppSpecPatchStreams();
  return snapshot;
}

function applyConfirmedExternalStopInterruption(
  chatId: string,
  snapshot: StopChatResponseSnapshot,
): void {
  restoreInterruptedAssistantMessageSnapshot(chatId, snapshot);
  const stoppedMessageId =
    snapshot.stopEligibleAssistantMessageId?.trim() ?? "";
  if (!stoppedMessageId) {
    return;
  }
  markInterruptedAssistantMessage(chatId, stoppedMessageId);
}

async function resolveLatestRunningExternalRunIdWithRefresh(
  chatId: string,
  projectConfigId: string | null,
): Promise<string | null> {
  let runId = await findLatestRunningExternalRunId(chatId, projectConfigId);
  if (runId) {
    return runId;
  }
  await loadAgentRuns();
  runId = await findLatestRunningExternalRunId(chatId, projectConfigId);
  return runId;
}

async function stopExternalChatResponse({
  chatId,
  projectConfigId,
  sectionId,
  failureMessage,
  localSnapshot,
}: {
  chatId: string;
  projectConfigId: string | null;
  sectionId?: string;
  failureMessage: string;
  localSnapshot: StopChatResponseSnapshot;
}): Promise<boolean> {
  const refreshChatAndResolveWaiting = async (): Promise<{
    hydrated: boolean;
    waitingForResponse: boolean;
  }> => {
    const hydrated = await getExternalAgentChat(
      chatId,
      projectConfigId,
      sectionId,
    );
    const waitingForResponse = Boolean(
      useAIStore.getState().chatDetails[chatId]?.waitingForResponse,
    );
    return { hydrated, waitingForResponse };
  };

  const runId = await resolveLatestRunningExternalRunIdWithRefresh(
    chatId,
    projectConfigId,
  );
  if (!runId) {
    const refreshState = await refreshChatAndResolveWaiting();
    if (refreshState.hydrated && !refreshState.waitingForResponse) {
      restoreInterruptedAssistantMessageSnapshot(chatId, localSnapshot);
      return true;
    }
    restoreInterruptedAssistantMessageSnapshot(chatId, localSnapshot);
    if (!refreshState.hydrated) {
      restoreStoppedChatResponseLocally(chatId, localSnapshot);
    }
    addTemporaryNotification(failureMessage, SettaNotificationTypeEnum.warning);
    return false;
  }
  const response = await route_stop_external_agent_run({ runId });
  if (res200(response)) {
    void loadAgentRuns();
    if (response.data?.status === AgentRunStatusEnum.cancelled) {
      applyConfirmedExternalStopInterruption(chatId, localSnapshot);
      return true;
    }
    const refreshState = await refreshChatAndResolveWaiting();
    restoreInterruptedAssistantMessageSnapshot(chatId, localSnapshot);
    if (refreshState.hydrated && !refreshState.waitingForResponse) {
      return true;
    }
    if (!refreshState.hydrated) {
      restoreStoppedChatResponseLocally(chatId, localSnapshot);
    }
    addTemporaryNotification(failureMessage, SettaNotificationTypeEnum.warning);
    return false;
  }
  const refreshState = await refreshChatAndResolveWaiting();
  if (refreshState.hydrated && !refreshState.waitingForResponse) {
    restoreInterruptedAssistantMessageSnapshot(chatId, localSnapshot);
    return true;
  }
  restoreInterruptedAssistantMessageSnapshot(chatId, localSnapshot);
  if (!refreshState.hydrated) {
    restoreStoppedChatResponseLocally(chatId, localSnapshot);
  }
  addTemporaryNotification(failureMessage, SettaNotificationTypeEnum.warning);
  return false;
}

function reconcileStoppedLLMChatOutcome({
  chatId,
  localSnapshot,
  stopOutcome,
}: {
  chatId: string;
  localSnapshot: StopChatResponseSnapshot;
  stopOutcome:
    | {
        alreadyStopped: boolean;
        stoppedMessageId: string | null;
      }
    | null
    | undefined;
}): void {
  if (!stopOutcome) {
    return;
  }
  if (stopOutcome.alreadyStopped) {
    restoreInterruptedAssistantMessageSnapshot(chatId, localSnapshot);
    return;
  }
  const stoppedMessageId = stopOutcome.stoppedMessageId?.trim() ?? "";
  if (!stoppedMessageId) {
    restoreInterruptedAssistantMessageSnapshot(chatId, localSnapshot);
    return;
  }
  const localStoppedMessageId =
    localSnapshot.stopEligibleAssistantMessageId?.trim() ?? "";
  if (!localStoppedMessageId) {
    restoreInterruptedAssistantMessageSnapshot(chatId, localSnapshot);
    return;
  }
  if (localStoppedMessageId === stoppedMessageId) {
    return;
  }
  restoreInterruptedAssistantMessageSnapshot(chatId, localSnapshot);
  markInterruptedAssistantMessage(chatId, stoppedMessageId);
}

export async function stopProjectChatResponse(
  chatId: string | null | undefined,
  isExternalEngine: boolean,
  pendingSurfaceId: string | null | undefined = null,
): Promise<boolean> {
  const localSnapshot = stopChatResponseLocally(chatId, {
    markInterruptedOptimistically: !isExternalEngine,
    pendingSurfaceId,
  });
  if (typeof chatId !== "string") {
    return true;
  }

  if (isExternalEngine) {
    const projectConfigId = getCurrProjectConfigId();
    return stopExternalChatResponse({
      chatId,
      projectConfigId,
      failureMessage: "Failed to stop project chat.",
      localSnapshot,
    });
  }

  const response = await route_stop_llm_chat({ chatId });
  if (res200(response)) {
    reconcileStoppedLLMChatOutcome({
      chatId,
      localSnapshot,
      stopOutcome: response.data,
    });
    return true;
  }
  const hydrated = await getLLMChat(chatId);
  restoreInterruptedAssistantMessageSnapshot(chatId, localSnapshot);
  if (!hydrated) {
    restoreStoppedChatResponseLocally(chatId, localSnapshot, pendingSurfaceId);
  }
  addTemporaryNotification(
    "Failed to stop project chat.",
    SettaNotificationTypeEnum.warning,
  );
  return false;
}

export async function stopManagedSectionChatResponse(
  chatId: string | null | undefined,
  isExternalEngine: boolean,
  projectConfigId: string,
  sectionId: string,
  pendingSurfaceId: string | null | undefined = null,
): Promise<boolean> {
  const localSnapshot = stopChatResponseLocally(chatId, {
    markInterruptedOptimistically: !isExternalEngine,
    pendingSurfaceId,
  });
  if (typeof chatId !== "string") {
    return true;
  }
  if (isExternalEngine) {
    return stopExternalChatResponse({
      chatId,
      projectConfigId,
      sectionId,
      failureMessage: "Failed to stop section chat.",
      localSnapshot,
    });
  }
  const response = await route_stop_llm_chat({ chatId });
  if (res200(response)) {
    reconcileStoppedLLMChatOutcome({
      chatId,
      localSnapshot,
      stopOutcome: response.data,
    });
    return true;
  }
  const hydrated = await getLLMChat(chatId, sectionId);
  restoreInterruptedAssistantMessageSnapshot(chatId, localSnapshot);
  if (!hydrated) {
    restoreStoppedChatResponseLocally(chatId, localSnapshot, pendingSurfaceId);
  }
  addTemporaryNotification(
    "Failed to stop section chat.",
    SettaNotificationTypeEnum.warning,
  );
  return false;
}
