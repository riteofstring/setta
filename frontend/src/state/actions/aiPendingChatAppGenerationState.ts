import { useAIStore } from "state/stores/aiStores";
import {
  getDefaultChatAppGenerationDetails,
  type ChatAppGenerationDetails,
} from "state/utils/chatAppGenerationDetails";

import { requirePendingChatSurfaceId } from "./aiChatState";

type AIState = ReturnType<typeof useAIStore.getState>;

export function getPendingChatAppGenerationDetailsForSurface(
  state: AIState,
  surfaceId: string | null | undefined,
): ChatAppGenerationDetails | null {
  return (
    state.pendingChatAppGenerationDetailsBySurfaceId[
      requirePendingChatSurfaceId(surfaceId)
    ] ?? null
  );
}

export function setPendingChatAppGenerationDetailsForSurface(
  state: AIState,
  surfaceId: string | null | undefined,
  nextDetails: ChatAppGenerationDetails | null,
): Partial<AIState> {
  const normalizedSurfaceId = requirePendingChatSurfaceId(surfaceId);
  const currentDetails =
    state.pendingChatAppGenerationDetailsBySurfaceId[normalizedSurfaceId];
  if (currentDetails === nextDetails) {
    return state;
  }
  const nextBySurfaceId = {
    ...state.pendingChatAppGenerationDetailsBySurfaceId,
  };
  if (nextDetails === null) {
    delete nextBySurfaceId[normalizedSurfaceId];
  } else {
    nextBySurfaceId[normalizedSurfaceId] = nextDetails;
  }
  return {
    pendingChatAppGenerationDetailsBySurfaceId: nextBySurfaceId,
  };
}

export function getChatAppGenerationDetailsForTarget(
  state: AIState,
  chatId: string | null,
  surfaceId: string | null | undefined,
): ChatAppGenerationDetails {
  if (chatId === null) {
    return (
      getPendingChatAppGenerationDetailsForSurface(state, surfaceId) ??
      getDefaultChatAppGenerationDetails()
    );
  }
  return (
    state.chatAppGenerationDetailsByChatId[chatId] ??
    getDefaultChatAppGenerationDetails()
  );
}
