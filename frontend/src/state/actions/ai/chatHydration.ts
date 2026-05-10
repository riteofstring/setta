import {
  callOpenAPI,
  getErrorCode,
  res200,
} from "@setta/app-subsystem-frontend-sdk";

import {
  getExternalAgentChat as apiGetExternalAgentChat,
  getLlmChat as apiGetLlmChat,
  stopExternalAgentRun as apiStopExternalAgentRun,
  stopLlmChat as apiStopLlmChat,
  type HttpapiExternalAgentChatResponse,
  type HttpapiLlmChatResponse,
  type HttpapiStopLlmChatResponse,
} from "openapi/http";

import { clearAllAppSpecPatchPreviewStreams } from "plugins/appSubsystem";

import {
  clearAIFollowToolArgumentsForChat,
  getAIFollowToolArgumentsSnapshot,
  restoreAIFollowToolArgumentsSnapshot,
  type AIFollowIdsByType,
} from "state/actions/aiFollow";

import { addTemporaryNotification } from "state/actions/notifications";

import { getCurrProjectConfigId } from "state/actions/sectionInfos";

import { ChatDetails, useAIStore } from "state/definitions";

import { type ChatAppGenerationDetails } from "state/utils/chatAppGeneration";

import {
  BaseChatMessageUnion,
  NotificationTypeEnum,
  RunStatusEnum,
} from "utils/generatedTypes";

import { applyHydratedChatDetailsToStore } from "../chatDetailsAuthority";

import {
  applyHydratedChatDetailsToSectionState,
  persistChatSectionState,
} from "../chatSectionAuthority";

import {
  AIStateSnapshot,
  stopEligibleAssistantMessageIdByChatId,
} from "./apiKeysAndHealth";

import {
  ResolvedStopChatResponseLocalOptions,
  StopChatResponseLocalOptions,
  StopChatResponseSnapshot,
  getDefaultChatDetails,
  getPendingChatDetailsForSurface,
  loadAgentRuns,
  receiveAgentRunUpdate,
  setPendingChatAppGenerationDetailsForSurface,
  setPendingChatDetailsForSurface,
} from "./llmConfigAndAgentRuns";

import {
  findLatestRunningExternalRunId,
  getExternalAgentChat,
  getLLMChatHydrationOutcome,
} from "./externalChatHydration";

import {
  updateChatDetails,
  updatePendingChatDetails,
} from "./appDefinitionsAndRollback";

type StopChatResponseRequest = {
  chatId: string | null | undefined;
  isExternalEngine: boolean;
  pendingSurfaceId?: string | null;
  failureMessage: string;
  projectConfigId: string | null;
  sectionId?: string;
};

type InternalChatStopFailureParams = {
  chatId: string;
  failureMessage: string;
  localSnapshot: StopChatResponseSnapshot;
  pendingSurfaceId?: string | null;
  sectionId?: string;
};

const DEFAULT_STOP_CHAT_RESPONSE_LOCAL_OPTIONS = {
  markInterruptedOptimistically: true,
  pendingSurfaceId: null,
  followProjectConfigId: null,
} satisfies ResolvedStopChatResponseLocalOptions;

function getStopChatSnapshotDetails(
  state: AIStateSnapshot,
  chatId: string | null | undefined,
  pendingSurfaceId: string | null | undefined,
): ChatDetails {
  if (typeof chatId === "string") {
    return state.chatDetails[chatId] ?? getDefaultChatDetails();
  }
  return (
    getPendingChatDetailsForSurface(state, pendingSurfaceId) ??
    getDefaultChatDetails()
  );
}

function getInterruptedAssistantMessageSnapshot(
  state: AIStateSnapshot,
  chatId: string | null | undefined,
): Record<string, true> {
  if (typeof chatId !== "string") {
    return {};
  }
  return {
    ...(state.interruptedAssistantMessageIdsByChatId[chatId] ?? {}),
  };
}

function getFollowToolArgumentSnapshot(
  chatId: string | null | undefined,
  followProjectConfigId: string | null,
): AIFollowIdsByType | null {
  if (typeof chatId !== "string" || !followProjectConfigId) {
    return null;
  }
  return getAIFollowToolArgumentsSnapshot(followProjectConfigId, chatId);
}

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

function getStopChatResponseSnapshot(
  chatId: string | null | undefined,
  pendingSurfaceId: string | null | undefined = null,
  followProjectConfigId: string | null = null,
): StopChatResponseSnapshot {
  const state = useAIStore.getState();
  const currentDetails = getStopChatSnapshotDetails(
    state,
    chatId,
    pendingSurfaceId,
  );
  return {
    waitingForResponse: currentDetails.waitingForResponse,
    toolCallArguments: { ...currentDetails.toolCallArguments },
    interruptedAssistantMessageIdsByChat:
      getInterruptedAssistantMessageSnapshot(state, chatId),
    stopEligibleAssistantMessageId:
      typeof chatId === "string"
        ? stopEligibleAssistantMessageIdByChatId.get(chatId) ?? null
        : null,
    followProjectConfigId,
    followToolArgumentIdsByType: getFollowToolArgumentSnapshot(
      chatId,
      followProjectConfigId,
    ),
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

function restoreStoppedChatFollowState(
  chatId: string | null | undefined,
  snapshot: StopChatResponseSnapshot,
) {
  if (typeof chatId !== "string" || !snapshot.followProjectConfigId) {
    return;
  }
  restoreAIFollowToolArgumentsSnapshot({
    projectConfigId: snapshot.followProjectConfigId,
    chatId,
    idsByType: snapshot.followToolArgumentIdsByType,
  });
}

function resolveStopChatResponseLocalOptions(
  options: StopChatResponseLocalOptions | undefined,
): ResolvedStopChatResponseLocalOptions {
  return {
    ...DEFAULT_STOP_CHAT_RESPONSE_LOCAL_OPTIONS,
    ...options,
  };
}

function stopKnownChatResponseLocally({
  chatId,
  followProjectConfigId,
  markInterruptedOptimistically,
  snapshot,
  stopDetails,
}: {
  chatId: string;
  followProjectConfigId: string | null;
  markInterruptedOptimistically: boolean;
  snapshot: StopChatResponseSnapshot;
  stopDetails: (details: ChatDetails) => ChatDetails;
}) {
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
  if (followProjectConfigId) {
    clearAIFollowToolArgumentsForChat(followProjectConfigId, chatId);
  }
}

function stopChatResponseLocally(
  chatId: string | null | undefined,
  options?: StopChatResponseLocalOptions,
): StopChatResponseSnapshot {
  const {
    markInterruptedOptimistically,
    pendingSurfaceId,
    followProjectConfigId,
  } = resolveStopChatResponseLocalOptions(options);
  const snapshot = getStopChatResponseSnapshot(
    chatId,
    pendingSurfaceId,
    followProjectConfigId,
  );
  const stopDetails = (details: ChatDetails): ChatDetails => ({
    ...details,
    waitingForResponse: false,
  });
  if (typeof chatId === "string") {
    stopKnownChatResponseLocally({
      chatId,
      followProjectConfigId,
      markInterruptedOptimistically,
      snapshot,
      stopDetails,
    });
  } else {
    updatePendingChatDetails(stopDetails, pendingSurfaceId);
  }
  clearAllAppSpecPatchPreviewStreams();
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

function shouldRestoreInterruptedSnapshotForStop({
  alreadyStopped,
  localStoppedMessageId,
  stoppedMessageId,
}: {
  alreadyStopped: boolean;
  localStoppedMessageId: string;
  stoppedMessageId: string;
}): boolean {
  return alreadyStopped || !stoppedMessageId || !localStoppedMessageId;
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

type ExternalChatRefreshState = {
  hydrated: boolean;
  waitingForResponse: boolean;
};

async function refreshExternalChatState(
  chatId: string,
  projectConfigId: string | null,
  sectionId?: string,
): Promise<ExternalChatRefreshState> {
  const hydrated = await getExternalAgentChat(
    chatId,
    projectConfigId,
    sectionId,
  );
  const waitingForResponse = Boolean(
    useAIStore.getState().chatDetails[chatId]?.waitingForResponse,
  );
  return { hydrated, waitingForResponse };
}

function finalizeExternalStopRefreshResult(
  chatId: string,
  failureMessage: string,
  localSnapshot: StopChatResponseSnapshot,
  refreshState: ExternalChatRefreshState,
): boolean {
  restoreInterruptedAssistantMessageSnapshot(chatId, localSnapshot);
  if (refreshState.hydrated && !refreshState.waitingForResponse) {
    return true;
  }
  restoreStoppedChatFollowState(chatId, localSnapshot);
  if (!refreshState.hydrated) {
    restoreStoppedChatResponseLocally(chatId, localSnapshot);
  }
  addTemporaryNotification(failureMessage, NotificationTypeEnum.warning);
  return false;
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
  const runId = await resolveLatestRunningExternalRunIdWithRefresh(
    chatId,
    projectConfigId,
  );
  if (!runId) {
    const refreshState = await refreshExternalChatState(
      chatId,
      projectConfigId,
      sectionId,
    );
    return finalizeExternalStopRefreshResult(
      chatId,
      failureMessage,
      localSnapshot,
      refreshState,
    );
  }
  const response = await callOpenAPI(
    apiStopExternalAgentRun({
      body: { runId },
    } as Parameters<typeof apiStopExternalAgentRun>[0]),
  );
  if (!res200(response)) {
    const refreshState = await refreshExternalChatState(
      chatId,
      projectConfigId,
      sectionId,
    );
    return finalizeExternalStopRefreshResult(
      chatId,
      failureMessage,
      localSnapshot,
      refreshState,
    );
  }
  receiveAgentRunUpdate(response.data);
  if (response.data?.status === RunStatusEnum.cancelled) {
    applyConfirmedExternalStopInterruption(chatId, localSnapshot);
    return true;
  }
  const refreshState = await refreshExternalChatState(
    chatId,
    projectConfigId,
    sectionId,
  );
  return finalizeExternalStopRefreshResult(
    chatId,
    failureMessage,
    localSnapshot,
    refreshState,
  );
}

function reconcileStoppedLLMChatOutcome({
  chatId,
  localSnapshot,
  stopOutcome,
}: {
  chatId: string;
  localSnapshot: StopChatResponseSnapshot;
  stopOutcome: HttpapiStopLlmChatResponse | null | undefined;
}): void {
  if (!stopOutcome) {
    return;
  }
  const stoppedMessageId = stopOutcome.stoppedMessageId?.trim() ?? "";
  const localStoppedMessageId =
    localSnapshot.stopEligibleAssistantMessageId?.trim() ?? "";
  if (
    shouldRestoreInterruptedSnapshotForStop({
      alreadyStopped: stopOutcome.alreadyStopped,
      localStoppedMessageId,
      stoppedMessageId,
    })
  ) {
    restoreInterruptedAssistantMessageSnapshot(chatId, localSnapshot);
    return;
  }
  if (localStoppedMessageId === stoppedMessageId) {
    return;
  }
  restoreInterruptedAssistantMessageSnapshot(chatId, localSnapshot);
  markInterruptedAssistantMessage(chatId, stoppedMessageId);
}

async function finalizeInternalChatStopFailure({
  chatId,
  failureMessage,
  localSnapshot,
  pendingSurfaceId,
  sectionId,
}: InternalChatStopFailureParams): Promise<boolean> {
  const hydrationOutcome = await getLLMChatHydrationOutcome(chatId, sectionId);
  const waitingForResponse = Boolean(
    useAIStore.getState().chatDetails[chatId]?.waitingForResponse,
  );
  const hydrated = hydrationOutcome.outcome === "success";
  restoreInterruptedAssistantMessageSnapshot(chatId, localSnapshot);
  if (hydrated && waitingForResponse) {
    restoreStoppedChatFollowState(chatId, localSnapshot);
  }
  if (!hydrated) {
    restoreStoppedChatResponseLocally(chatId, localSnapshot, pendingSurfaceId);
    restoreStoppedChatFollowState(chatId, localSnapshot);
  }
  addTemporaryNotification(failureMessage, NotificationTypeEnum.warning);
  return false;
}

async function stopInternalChatResponse({
  chatId,
  failureMessage,
  localSnapshot,
  pendingSurfaceId,
  sectionId,
}: InternalChatStopFailureParams): Promise<boolean> {
  const response = await callOpenAPI(
    apiStopLlmChat({
      body: { chatId },
    } as Parameters<typeof apiStopLlmChat>[0]),
  );
  if (res200(response)) {
    reconcileStoppedLLMChatOutcome({
      chatId,
      localSnapshot,
      stopOutcome: response.data,
    });
    return true;
  }
  return finalizeInternalChatStopFailure({
    chatId,
    failureMessage,
    localSnapshot,
    pendingSurfaceId,
    sectionId,
  });
}

async function stopChatResponse({
  chatId,
  isExternalEngine,
  pendingSurfaceId = null,
  failureMessage,
  projectConfigId,
  sectionId,
}: StopChatResponseRequest): Promise<boolean> {
  const localSnapshot = stopChatResponseLocally(chatId, {
    markInterruptedOptimistically: !isExternalEngine,
    pendingSurfaceId,
    followProjectConfigId: projectConfigId,
  });
  if (typeof chatId !== "string") {
    return true;
  }
  if (isExternalEngine) {
    return stopExternalChatResponse({
      chatId,
      projectConfigId,
      sectionId,
      failureMessage,
      localSnapshot,
    });
  }
  return stopInternalChatResponse({
    chatId,
    failureMessage,
    localSnapshot,
    pendingSurfaceId,
    sectionId,
  });
}

export async function stopProjectChatResponse(
  chatId: string | null | undefined,
  isExternalEngine: boolean,
  pendingSurfaceId: string | null | undefined = null,
): Promise<boolean> {
  return stopChatResponse({
    chatId,
    isExternalEngine,
    pendingSurfaceId,
    failureMessage: "Failed to stop project chat.",
    projectConfigId:
      typeof chatId === "string" ? getCurrProjectConfigId() : null,
  });
}

export async function stopManagedSectionChatResponse(
  chatId: string | null | undefined,
  isExternalEngine: boolean,
  projectConfigId: string,
  sectionId: string,
  pendingSurfaceId: string | null | undefined = null,
): Promise<boolean> {
  return stopChatResponse({
    chatId,
    isExternalEngine,
    pendingSurfaceId,
    failureMessage: "Failed to stop section chat.",
    projectConfigId,
    sectionId,
  });
}

export function initializePendingChatDetails(surfaceId: string) {
  useAIStore.setState((state) => ({
    ...setPendingChatDetailsForSurface(
      state,
      surfaceId,
      getDefaultChatDetails(),
    ),
    ...setPendingChatAppGenerationDetailsForSurface(state, surfaceId, null),
  }));
}

export function initializePendingChatDetailsWithMessages(
  messages: Array<BaseChatMessageUnion>,
  waitingForResponse: boolean = true,
  surfaceId: string | null | undefined,
  appGenerationDetails: ChatAppGenerationDetails | null = null,
) {
  useAIStore.setState((state) => ({
    ...setPendingChatDetailsForSurface(state, surfaceId, {
      ...getDefaultChatDetails(),
      messages,
      waitingForResponse,
    }),
    ...setPendingChatAppGenerationDetailsForSurface(
      state,
      surfaceId,
      appGenerationDetails,
    ),
  }));
}

export function seedPendingChatDetails(
  messages: Array<BaseChatMessageUnion>,
  surfaceId: string,
  appGenerationDetails: ChatAppGenerationDetails | null = null,
) {
  initializePendingChatDetailsWithMessages(
    messages,
    false,
    surfaceId,
    appGenerationDetails,
  );
}

export function clearPendingChatDetails(surfaceId: string) {
  useAIStore.setState((state) => ({
    ...setPendingChatDetailsForSurface(state, surfaceId, null),
    ...setPendingChatAppGenerationDetailsForSurface(state, surfaceId, null),
  }));
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

export async function probeLLMChatHydration(
  chatId: string,
  projectConfigId: string,
): Promise<ChatHydrationProbeResult<HttpapiLlmChatResponse>> {
  const response = await callOpenAPI(
    apiGetLlmChat({
      body: { chatId, projectConfigId },
    } as Parameters<typeof apiGetLlmChat>[0]),
  );
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

export async function probeExternalAgentChatHydration(
  chatId: string,
  projectConfigId: string | null,
): Promise<ChatHydrationProbeResult<HttpapiExternalAgentChatResponse>> {
  const response = await callOpenAPI(
    apiGetExternalAgentChat({
      body: {
        chatId,
        projectConfigId,
      },
    } as Parameters<typeof apiGetExternalAgentChat>[0]),
  );
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

export function applyLLMChatHydrationSuccess({
  chatId,
  sectionId,
  projectConfigId,
  payload,
}: {
  chatId: string;
  sectionId?: string;
  projectConfigId: string;
  payload: HttpapiLlmChatResponse;
}): void {
  const managedHydrationPayload = payload as HttpapiLlmChatResponse & {
    toolCallArguments?: Record<string, string>;
    appGenerationByMessageId?: Record<string, string>;
  };
  const {
    messages,
    waitingForResponse,
    llmConfig,
    contextUsage,
    appGenerationByMessageId,
  } = managedHydrationPayload;
  const toolCallArguments = managedHydrationPayload.toolCallArguments ?? {};
  const nextWaitingForResponse = applyHydratedChatDetailsToStore({
    chatId,
    messages,
    waitingForResponse,
    backendToolCallArguments: toolCallArguments,
    llmConfig,
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
    persistChatSectionState({
      projectConfigId,
      sectionId,
      nextState,
      reason: "hydrate-llm-chat",
    });
  }
  if (!nextWaitingForResponse) {
    clearStopEligibleAssistantMessageId(chatId);
    clearAIFollowToolArgumentsForChat(projectConfigId, chatId);
  }
}
