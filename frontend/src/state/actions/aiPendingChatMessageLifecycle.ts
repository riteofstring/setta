import { isChatStreamActive } from "state/aiStreamingTracker";
import { useAIStore } from "state/stores/aiStores";
import {
  getDefaultChatAppGenerationDetails,
  mergeChatAppGenerationDetails,
  type ChatAppGenerationDetails,
} from "state/utils/chatAppGenerationDetails";
import { type BaseChatMessageUnion } from "utils/generatedTypes";

import { getDefaultChatDetails } from "./aiChatDetails";
import {
  getPendingChatDetailsForSurface,
  setPendingChatDetailsForSurface,
} from "./aiChatState";
import {
  getPendingChatAppGenerationDetailsForSurface,
  setPendingChatAppGenerationDetailsForSurface,
} from "./aiPendingChatAppGenerationState";
import { mergeChatMessages } from "./chatMessageMerge";

function mergeChatDetails(
  existingDetails: ReturnType<typeof getDefaultChatDetails>,
  pendingDetails: ReturnType<typeof getDefaultChatDetails>,
  preserveWaitingForResponse: boolean,
): ReturnType<typeof getDefaultChatDetails> {
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

export function initializePendingChatDetails(surfaceId: string): void {
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
): void {
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
): void {
  initializePendingChatDetailsWithMessages(
    messages,
    false,
    surfaceId,
    appGenerationDetails,
  );
}

export function clearPendingChatDetails(surfaceId: string): void {
  useAIStore.setState((state) => ({
    ...setPendingChatDetailsForSurface(state, surfaceId, null),
    ...setPendingChatAppGenerationDetailsForSurface(state, surfaceId, null),
  }));
}

export function commitPendingChatDetails(
  chatId: string,
  surfaceId: string | null | undefined,
): void {
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

export function finalizePendingChatDetails(
  chatId: string,
  surfaceId: string,
): void {
  commitPendingChatDetails(chatId, surfaceId);
}
