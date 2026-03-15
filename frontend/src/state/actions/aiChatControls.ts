import { addTemporaryNotification } from "state/actions/notifications";
import { getCurrProjectConfigId } from "state/actions/sectionInfos";
import { useAIStore } from "state/stores/aiStores";
import { res200 } from "utils/endpointUtils";
import { route_stop_llm_chat } from "utils/generatedEndpoints";
import { SettaNotificationTypeEnum } from "utils/generatedTypes";
import {
  reconcileStoppedLLMChatOutcome,
  restoreStoppedChatFollowState,
  restoreStoppedChatResponseLocally,
  stopChatResponseLocally,
  type StopChatResponseSnapshot,
} from "./aiChatStopState";
import { stopExternalChatResponse } from "./aiExternalAgentStop";
import { getLLMChatHydrationOutcome } from "./aiHydration";
import { restoreInterruptedAssistantMessageIds } from "./aiInterruptedAssistantMessages";

async function stopLLMChatResponse({
  chatId,
  sectionId,
  pendingSurfaceId,
  failureMessage,
  localSnapshot,
}: {
  chatId: string;
  sectionId?: string;
  pendingSurfaceId?: string | null;
  failureMessage: string;
  localSnapshot: StopChatResponseSnapshot;
}): Promise<boolean> {
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
  return stopLLMChatResponse({
    chatId,
    pendingSurfaceId,
    failureMessage: "Failed to stop project chat.",
    localSnapshot,
  });
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
  return stopLLMChatResponse({
    chatId,
    sectionId,
    pendingSurfaceId,
    failureMessage: "Failed to stop section chat.",
    localSnapshot,
  });
}
