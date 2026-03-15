import { isChatStreamActive } from "state/aiStreamingTracker";
import { useAIStore } from "state/stores/aiStores";
import {
  buildChatAppGenerationDetails,
  deserializeChatAppGenerationByMessageId,
} from "state/utils/chatAppGenerationDetails";

import { getDefaultChatDetails } from "./aiChatDetails";
import {
  type ExternalAgentChatHydrationPayload,
  type LLMChatHydrationPayload,
} from "./aiHydrationOutcome";
import { reconcileHydratedChatMessages } from "./chatHydrationMerge";

type HydratedChatDetailsInput = {
  chatId: string;
  messages: LLMChatHydrationPayload["messages"];
  waitingForResponse: boolean;
  appGenerationByMessageId: LLMChatHydrationPayload["appGenerationByMessageId"];
  contextUsage: LLMChatHydrationPayload["contextUsage"];
  llmConfig: LLMChatHydrationPayload["llmConfig"];
  toolCallArguments?: ExternalAgentChatHydrationPayload["toolCallArguments"];
};

function applyHydratedChatDetails({
  chatId,
  messages,
  waitingForResponse,
  appGenerationByMessageId,
  contextUsage,
  llmConfig,
  toolCallArguments,
}: HydratedChatDetailsInput): boolean {
  let nextWaitingForResponse = Boolean(waitingForResponse);
  useAIStore.setState((state) => {
    const existingDetails = state.chatDetails[chatId];
    const preserveWaitingForResponse = isChatStreamActive(chatId);
    nextWaitingForResponse = preserveWaitingForResponse
      ? Boolean(waitingForResponse || existingDetails?.waitingForResponse)
      : Boolean(waitingForResponse);
    const nextMessages = reconcileHydratedChatMessages({
      backendMessages: messages,
      localMessages: existingDetails?.messages ?? [],
      preserveLocalOnlyMessages: preserveWaitingForResponse,
    });
    const nextAppGenerationDetails = buildChatAppGenerationDetails(
      nextMessages,
      deserializeChatAppGenerationByMessageId(appGenerationByMessageId),
    );
    const nextChatDetails = {
      ...getDefaultChatDetails(),
      ...(existingDetails ?? {}),
      messages: nextMessages,
      waitingForResponse: nextWaitingForResponse,
      llmConfig,
      contextUsage: contextUsage ?? null,
    };
    if (toolCallArguments !== undefined) {
      nextChatDetails.toolCallArguments = toolCallArguments;
    }
    return {
      chatDetails: {
        ...state.chatDetails,
        [chatId]: nextChatDetails,
      },
      chatAppGenerationDetailsByChatId: {
        ...state.chatAppGenerationDetailsByChatId,
        [chatId]: nextAppGenerationDetails,
      },
    };
  });
  return nextWaitingForResponse;
}

export function applyLLMHydratedChatDetails({
  chatId,
  payload,
}: {
  chatId: string;
  payload: LLMChatHydrationPayload;
}): boolean {
  return applyHydratedChatDetails({
    chatId,
    messages: payload.messages,
    waitingForResponse: payload.waitingForResponse,
    appGenerationByMessageId: payload.appGenerationByMessageId,
    contextUsage: payload.contextUsage,
    llmConfig: payload.llmConfig,
  });
}

export function applyExternalHydratedChatDetails({
  chatId,
  payload,
}: {
  chatId: string;
  payload: ExternalAgentChatHydrationPayload;
}): boolean {
  return applyHydratedChatDetails({
    chatId,
    messages: payload.messages,
    waitingForResponse: payload.waitingForResponse,
    appGenerationByMessageId: payload.appGenerationByMessageId,
    contextUsage: payload.contextUsage,
    llmConfig: null,
    toolCallArguments: payload.toolCallArguments,
  });
}
