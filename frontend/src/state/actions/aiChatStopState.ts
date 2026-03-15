import {
  clearAIFollowToolArgumentsForChat,
  getAIFollowToolArgumentsSnapshot,
  restoreAIFollowToolArgumentsSnapshot,
  type AIFollowIdsByType,
} from "state/actions/aiFollow";
import { clearAllAppSpecPatchStreams } from "state/appSpecPatchStreaming";
import { useAIStore, type ChatDetails } from "state/stores/aiStores";
import { getDefaultChatDetails } from "./aiChatDetails";
import {
  getPendingChatDetailsForSurface,
  updateChatDetails,
  updatePendingChatDetails,
} from "./aiChatState";
import {
  getInterruptedAssistantMessageIdsByChat,
  markInterruptedAssistantMessage,
  restoreInterruptedAssistantMessageIds,
} from "./aiInterruptedAssistantMessages";
import { getStopEligibleAssistantMessageId } from "./aiStopEligibleAssistantMessages";

export type StopChatResponseSnapshot = {
  waitingForResponse: boolean;
  toolCallArguments: Record<string, string>;
  interruptedAssistantMessageIdsByChat: Record<string, true>;
  stopEligibleAssistantMessageId: string | null;
  followProjectConfigId: string | null;
  followToolArgumentIdsByType: AIFollowIdsByType | null;
};

export function getStopChatResponseSnapshot(
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

export function restoreStoppedChatResponseLocally(
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

export function restoreStoppedChatFollowState(
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

export function stopChatResponseLocally(
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

export function applyConfirmedExternalStopInterruption(
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

export function reconcileStoppedLLMChatOutcome({
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
