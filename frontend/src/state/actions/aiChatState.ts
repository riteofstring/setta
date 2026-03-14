import { type ChatDetails, useAIStore } from "state/definitions";
import { getDefaultChatDetails } from "./aiChatDetails";

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

export function getPendingChatDetailsForSurface(
  state: ReturnType<typeof useAIStore.getState>,
  surfaceId: string | null | undefined,
): ChatDetails | null {
  return (
    state.pendingChatDetailsBySurfaceId[
      requirePendingChatSurfaceId(surfaceId)
    ] ?? null
  );
}

export function setPendingChatDetailsForSurface(
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

export function updateChatDetails(
  chatId: string,
  updater: (details: ChatDetails) => ChatDetails | null,
): void {
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
): void {
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
