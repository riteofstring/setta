import { isChatStreamActive } from "state/aiStreamingTracker";
import { useAIStore } from "state/stores/aiStores";
import {
  getDefaultChatAppGenerationDetails,
  mergeChatAppGenerationDetails,
  normalizeChatAppGenerationContext,
  setChatAppGenerationForMessage,
  type ChatAppGenerationContext,
  type ChatAppGenerationDetails,
} from "state/utils/chatAppGeneration";
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
import { clearStopEligibleAssistantMessageId } from "./aiStopEligibleAssistantMessages";
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

export function applyOptimisticUserMessage(
  chatId: string | null,
  userMessage: BaseChatMessageUnion,
  surfaceId: string | null | undefined = null,
  appGeneration: ChatAppGenerationContext | null = null,
): void {
  const resolvedAppGeneration =
    normalizeChatAppGenerationContext(appGeneration);
  useAIStore.setState((state) => {
    if (typeof chatId === "string") {
      clearStopEligibleAssistantMessageId(chatId);
      return {
        chatDetails: {
          ...state.chatDetails,
          [chatId]: {
            ...getDefaultChatDetails(),
            ...(state.chatDetails[chatId] ?? {}),
            messages: [
              ...(state.chatDetails[chatId]?.messages ?? []),
              userMessage,
            ],
            waitingForResponse: true,
          },
        },
        chatAppGenerationDetailsByChatId: {
          ...state.chatAppGenerationDetailsByChatId,
          [chatId]: setChatAppGenerationForMessage(
            state.chatAppGenerationDetailsByChatId[chatId] ??
              getDefaultChatAppGenerationDetails(),
            [...(state.chatDetails[chatId]?.messages ?? []), userMessage],
            userMessage.id,
            resolvedAppGeneration,
          ),
        },
      };
    }
    const nextDetails = {
      ...(getPendingChatDetailsForSurface(state, surfaceId) ??
        getDefaultChatDetails()),
      messages: [
        ...(getPendingChatDetailsForSurface(state, surfaceId)?.messages ?? []),
        userMessage,
      ],
      waitingForResponse: true,
    };
    return {
      ...setPendingChatDetailsForSurface(state, surfaceId, nextDetails),
      ...setPendingChatAppGenerationDetailsForSurface(
        state,
        surfaceId,
        setChatAppGenerationForMessage(
          getPendingChatAppGenerationDetailsForSurface(state, surfaceId) ??
            getDefaultChatAppGenerationDetails(),
          nextDetails.messages,
          userMessage.id,
          resolvedAppGeneration,
        ),
      ),
    };
  });
}

export function rollbackOptimisticUserMessage(
  chatId: string | null,
  userMessageId: string,
  surfaceId: string | null | undefined = null,
): void {
  useAIStore.setState((state) => {
    if (chatId === null) {
      const pendingDetails =
        getPendingChatDetailsForSurface(state, surfaceId) ??
        getDefaultChatDetails();
      const nextMessages = pendingDetails.messages.filter(
        (message) => message.id !== userMessageId,
      );
      return {
        ...setPendingChatDetailsForSurface(state, surfaceId, {
          ...pendingDetails,
          messages: nextMessages,
          waitingForResponse: false,
        }),
        ...setPendingChatAppGenerationDetailsForSurface(
          state,
          surfaceId,
          setChatAppGenerationForMessage(
            getPendingChatAppGenerationDetailsForSurface(state, surfaceId) ??
              getDefaultChatAppGenerationDetails(),
            nextMessages,
            userMessageId,
            null,
          ),
        ),
      };
    }
    const currentDetails = state.chatDetails[chatId] ?? getDefaultChatDetails();
    const nextMessages = currentDetails.messages.filter(
      (message) => message.id !== userMessageId,
    );
    return {
      chatDetails: {
        ...state.chatDetails,
        [chatId]: {
          ...currentDetails,
          messages: nextMessages,
          waitingForResponse: false,
        },
      },
      chatAppGenerationDetailsByChatId: {
        ...state.chatAppGenerationDetailsByChatId,
        [chatId]: setChatAppGenerationForMessage(
          state.chatAppGenerationDetailsByChatId[chatId] ??
            getDefaultChatAppGenerationDetails(),
          nextMessages,
          userMessageId,
          null,
        ),
      },
    };
  });
}
