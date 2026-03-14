import {
  clearAIFollowToolArgumentsForChat,
  getAIFollowToolArgumentsSnapshot,
  restoreAIFollowToolArgumentsSnapshot,
  type AIFollowIdsByType,
} from "state/actions/aiFollow";
import { addTemporaryNotification } from "state/actions/notifications";
import { getCurrProjectConfigId } from "state/actions/sectionInfos";
import { clearAllAppSpecPatchStreams } from "state/appSpecPatchStreaming";
import { useAIStore, type ChatDetails } from "state/stores/aiStores";
import { res200 } from "utils/endpointUtils";
import {
  route_respond_external_agent_approval,
  route_respond_external_agent_question,
  route_stop_external_agent_run,
  route_stop_llm_chat,
} from "utils/generatedEndpoints";
import {
  AgentRunStatusEnum,
  SettaNotificationTypeEnum,
} from "utils/generatedTypes";
import { getRunLastUpdatedMs } from "./agentRunUtils";
import { loadAgentRuns } from "./aiAgentRuns";
import { getDefaultChatDetails } from "./aiChatDetails";
import {
  getPendingChatDetailsForSurface,
  updateChatDetails,
  updatePendingChatDetails,
} from "./aiChatState";
import {
  getExternalAgentChat,
  getLLMChatHydrationOutcome,
} from "./aiHydration";
import {
  getInterruptedAssistantMessageIdsByChat,
  markInterruptedAssistantMessage,
  restoreInterruptedAssistantMessageIds,
} from "./aiInterruptedAssistantMessages";
import { getStopEligibleAssistantMessageId } from "./aiStopEligibleAssistantMessages";

type StopChatResponseSnapshot = {
  waitingForResponse: boolean;
  toolCallArguments: Record<string, string>;
  interruptedAssistantMessageIdsByChat: Record<string, true>;
  stopEligibleAssistantMessageId: string | null;
  followProjectConfigId: string | null;
  followToolArgumentIdsByType: AIFollowIdsByType | null;
};

function getStopChatResponseSnapshot(
  chatId: string | null | undefined,
  pendingSurfaceId: string | null | undefined = null,
  followProjectConfigId: string | null = null,
): StopChatResponseSnapshot {
  const state = useAIStore.getState();
  const currentDetails =
    typeof chatId === "string"
      ? state.chatDetails[chatId] ?? getDefaultChatDetails()
      : getPendingChatDetailsForSurface(state, pendingSurfaceId) ??
        getDefaultChatDetails();
  return {
    waitingForResponse: currentDetails.waitingForResponse,
    toolCallArguments: { ...currentDetails.toolCallArguments },
    interruptedAssistantMessageIdsByChat:
      typeof chatId === "string"
        ? getInterruptedAssistantMessageIdsByChat(chatId)
        : {},
    stopEligibleAssistantMessageId:
      typeof chatId === "string"
        ? getStopEligibleAssistantMessageId(chatId)
        : null,
    followProjectConfigId,
    followToolArgumentIdsByType:
      typeof chatId === "string" && followProjectConfigId
        ? getAIFollowToolArgumentsSnapshot(followProjectConfigId, chatId)
        : null,
  };
}

function restoreStoppedChatResponseLocally(
  chatId: string | null | undefined,
  snapshot: StopChatResponseSnapshot,
  pendingSurfaceId: string | null | undefined = null,
): void {
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
): void {
  if (typeof chatId !== "string" || !snapshot.followProjectConfigId) {
    return;
  }
  restoreAIFollowToolArgumentsSnapshot({
    projectConfigId: snapshot.followProjectConfigId,
    chatId,
    idsByType: snapshot.followToolArgumentIdsByType,
  });
}

function stopChatResponseLocally(
  chatId: string | null | undefined,
  options: {
    markInterruptedOptimistically?: boolean;
    pendingSurfaceId?: string | null;
    followProjectConfigId?: string | null;
  } = {},
): StopChatResponseSnapshot {
  const markInterruptedOptimistically =
    options.markInterruptedOptimistically ?? true;
  const pendingSurfaceId = options.pendingSurfaceId ?? null;
  const followProjectConfigId = options.followProjectConfigId ?? null;
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
  restoreInterruptedAssistantMessageIds(
    chatId,
    snapshot.interruptedAssistantMessageIdsByChat,
  );
  const stoppedMessageId =
    snapshot.stopEligibleAssistantMessageId?.trim() ?? "";
  if (!stoppedMessageId) {
    return;
  }
  markInterruptedAssistantMessage(chatId, stoppedMessageId);
}

async function findLatestRunningExternalRunId(
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
  const runs = agentRuns.filter((run) => {
    if (run.status !== AgentRunStatusEnum.running) {
      return false;
    }
    const inputs = run.inputs ?? {};
    const runType = typeof inputs.runType === "string" ? inputs.runType : null;
    if (runType !== "external_agent") {
      return false;
    }
    const runChatId = typeof inputs.chatId === "string" ? inputs.chatId : null;
    if (runChatId !== chatId) {
      return false;
    }
    const runProjectConfigId =
      typeof inputs.projectConfigId === "string"
        ? inputs.projectConfigId
        : null;
    if (projectConfigId && runProjectConfigId !== projectConfigId) {
      return false;
    }
    return true;
  });
  if (runs.length === 0) {
    return null;
  }
  runs.sort((a, b) => getRunLastUpdatedMs(b) - getRunLastUpdatedMs(a));
  return runs[0]?.id ?? null;
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
      restoreInterruptedAssistantMessageIds(
        chatId,
        localSnapshot.interruptedAssistantMessageIdsByChat,
      );
      return true;
    }
    restoreInterruptedAssistantMessageIds(
      chatId,
      localSnapshot.interruptedAssistantMessageIdsByChat,
    );
    restoreStoppedChatFollowState(chatId, localSnapshot);
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
    restoreInterruptedAssistantMessageIds(
      chatId,
      localSnapshot.interruptedAssistantMessageIdsByChat,
    );
    if (refreshState.hydrated && !refreshState.waitingForResponse) {
      return true;
    }
    restoreStoppedChatFollowState(chatId, localSnapshot);
    if (!refreshState.hydrated) {
      restoreStoppedChatResponseLocally(chatId, localSnapshot);
    }
    addTemporaryNotification(failureMessage, SettaNotificationTypeEnum.warning);
    return false;
  }
  const refreshState = await refreshChatAndResolveWaiting();
  if (refreshState.hydrated && !refreshState.waitingForResponse) {
    restoreInterruptedAssistantMessageIds(
      chatId,
      localSnapshot.interruptedAssistantMessageIdsByChat,
    );
    return true;
  }
  restoreInterruptedAssistantMessageIds(
    chatId,
    localSnapshot.interruptedAssistantMessageIdsByChat,
  );
  restoreStoppedChatFollowState(chatId, localSnapshot);
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
    restoreInterruptedAssistantMessageIds(
      chatId,
      localSnapshot.interruptedAssistantMessageIdsByChat,
    );
    return;
  }
  const stoppedMessageId = stopOutcome.stoppedMessageId?.trim() ?? "";
  if (!stoppedMessageId) {
    restoreInterruptedAssistantMessageIds(
      chatId,
      localSnapshot.interruptedAssistantMessageIdsByChat,
    );
    return;
  }
  const localStoppedMessageId =
    localSnapshot.stopEligibleAssistantMessageId?.trim() ?? "";
  if (!localStoppedMessageId) {
    restoreInterruptedAssistantMessageIds(
      chatId,
      localSnapshot.interruptedAssistantMessageIdsByChat,
    );
    return;
  }
  if (localStoppedMessageId === stoppedMessageId) {
    return;
  }
  restoreInterruptedAssistantMessageIds(
    chatId,
    localSnapshot.interruptedAssistantMessageIdsByChat,
  );
  markInterruptedAssistantMessage(chatId, stoppedMessageId);
}

export async function stopProjectChatResponse(
  chatId: string | null | undefined,
  isExternalEngine: boolean,
  pendingSurfaceId: string | null | undefined = null,
): Promise<boolean> {
  const followProjectConfigId =
    typeof chatId === "string" ? getCurrProjectConfigId() : null;
  const localSnapshot = stopChatResponseLocally(chatId, {
    markInterruptedOptimistically: !isExternalEngine,
    pendingSurfaceId,
    followProjectConfigId,
  });
  if (typeof chatId !== "string") {
    return true;
  }

  if (isExternalEngine) {
    return stopExternalChatResponse({
      chatId,
      projectConfigId: followProjectConfigId,
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
  const hydrationOutcome = await getLLMChatHydrationOutcome(chatId);
  const waitingForResponse = Boolean(
    useAIStore.getState().chatDetails[chatId]?.waitingForResponse,
  );
  const hydrated = hydrationOutcome.outcome === "success";
  restoreInterruptedAssistantMessageIds(
    chatId,
    localSnapshot.interruptedAssistantMessageIdsByChat,
  );
  if (hydrated && waitingForResponse) {
    restoreStoppedChatFollowState(chatId, localSnapshot);
  }
  if (!hydrated) {
    restoreStoppedChatResponseLocally(chatId, localSnapshot, pendingSurfaceId);
    restoreStoppedChatFollowState(chatId, localSnapshot);
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
  const hydrationOutcome = await getLLMChatHydrationOutcome(chatId, sectionId);
  const waitingForResponse = Boolean(
    useAIStore.getState().chatDetails[chatId]?.waitingForResponse,
  );
  const hydrated = hydrationOutcome.outcome === "success";
  restoreInterruptedAssistantMessageIds(
    chatId,
    localSnapshot.interruptedAssistantMessageIdsByChat,
  );
  if (hydrated && waitingForResponse) {
    restoreStoppedChatFollowState(chatId, localSnapshot);
  }
  if (!hydrated) {
    restoreStoppedChatResponseLocally(chatId, localSnapshot, pendingSurfaceId);
    restoreStoppedChatFollowState(chatId, localSnapshot);
  }
  addTemporaryNotification(
    "Failed to stop section chat.",
    SettaNotificationTypeEnum.warning,
  );
  return false;
}

export async function respondExternalAgentApproval(
  approvalId: string,
  approved: boolean,
): Promise<boolean> {
  const res = await route_respond_external_agent_approval({
    approvalId,
    approved,
  });
  return res200(res);
}

export async function respondExternalAgentQuestion(
  toolCallId: string,
  answers: Record<string, string>,
): Promise<boolean> {
  const res = await route_respond_external_agent_question({
    toolCallId,
    answers,
  });
  return res200(res);
}
