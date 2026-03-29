import { isChatStreamActive } from "state/aiStreamingTracker";
import { ChatDetails, useAIStore } from "state/definitions";
import {
  buildChatAppGenerationDetails,
  deserializeChatAppGenerationByMessageId,
} from "state/utils/chatAppGeneration";
import { BaseChatMessageUnion } from "utils/generatedTypes";
import { resolveHydratedToolCallArguments } from "./chatSectionAuthority";
import { reconcileHydratedChatMessages } from "./chatMergeUtils";

function getDefaultHydratedChatDetails(): ChatDetails {
  return {
    messages: [],
    toolCallArguments: {},
    waitingForResponse: false,
    llmConfig: null,
    contextUsage: null,
  };
}

export function applyHydratedChatDetailsToStore({
  chatId,
  messages,
  waitingForResponse,
  backendToolCallArguments,
  llmConfig,
  contextUsage,
  serializedAppGenerationByMessageId,
}: {
  chatId: string;
  messages: Array<BaseChatMessageUnion>;
  waitingForResponse: boolean;
  backendToolCallArguments: Record<string, string>;
  llmConfig: ChatDetails["llmConfig"];
  contextUsage: ChatDetails["contextUsage"];
  serializedAppGenerationByMessageId: unknown;
}): boolean {
  let nextWaitingForResponse = Boolean(waitingForResponse);
  useAIStore.setState((state) => {
    const existingDetails = state.chatDetails[chatId];
    const preserveWaitingForResponse = isChatStreamActive(chatId);
    const nextToolCallArguments = resolveHydratedToolCallArguments({
      backendToolCallArguments,
      localToolCallArguments: existingDetails?.toolCallArguments ?? {},
      preserveLocalOverlay: preserveWaitingForResponse,
    });
    nextWaitingForResponse = preserveWaitingForResponse
      ? Boolean(waitingForResponse || existingDetails?.waitingForResponse)
      : Boolean(waitingForResponse);
    const nextMessages = reconcileHydratedChatMessages({
      backendMessages: messages,
      localMessages: existingDetails?.messages ?? [],
    });
    const nextAppGenerationDetails = buildChatAppGenerationDetails(
      nextMessages,
      deserializeChatAppGenerationByMessageId(serializedAppGenerationByMessageId),
    );
    return {
      chatDetails: {
        ...state.chatDetails,
        [chatId]: {
          ...getDefaultHydratedChatDetails(),
          ...(existingDetails ?? {}),
          messages: nextMessages,
          waitingForResponse: nextWaitingForResponse,
          toolCallArguments: nextToolCallArguments,
          llmConfig,
          contextUsage: contextUsage ?? null,
        },
      },
      chatAppGenerationDetailsByChatId: {
        ...state.chatAppGenerationDetailsByChatId,
        [chatId]: nextAppGenerationDetails,
      },
    };
  });
  return nextWaitingForResponse;
}
