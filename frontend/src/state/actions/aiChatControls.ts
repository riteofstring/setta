import { addTemporaryNotification } from "state/actions/notifications";
import { getCurrProjectConfigId } from "state/actions/sectionInfos";
import { useAIStore } from "state/stores/aiStores";
import { res200 } from "utils/endpointUtils";
import {
  route_stop_external_agent_run,
  route_stop_llm_chat,
} from "utils/generatedEndpoints";
import {
  AgentRunStatusEnum,
  SettaNotificationTypeEnum,
} from "utils/generatedTypes";
import { getRunLastUpdatedMs } from "./agentRunUtils";
import { loadAgentRuns } from "./aiAgentRuns";
import {
  applyConfirmedExternalStopInterruption,
  reconcileStoppedLLMChatOutcome,
  restoreStoppedChatFollowState,
  restoreStoppedChatResponseLocally,
  stopChatResponseLocally,
  type StopChatResponseSnapshot,
} from "./aiChatStopState";
import {
  getExternalAgentChat,
  getLLMChatHydrationOutcome,
} from "./aiHydration";
import { restoreInterruptedAssistantMessageIds } from "./aiInterruptedAssistantMessages";

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
