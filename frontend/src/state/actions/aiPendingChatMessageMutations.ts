import { useAIStore } from "state/stores/aiStores";
import {
  getDefaultChatAppGenerationDetails,
  normalizeChatAppGenerationContext,
  setChatAppGenerationForMessage,
  type ChatAppGenerationContext,
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
import { clearStopEligibleAssistantMessageId } from "./aiStopEligibleAssistantMessages";

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
