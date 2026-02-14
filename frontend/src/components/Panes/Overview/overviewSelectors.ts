import type { ChatDetails } from "state/definitions";

export type AIWaitingSlice = {
  chatDetails: Record<string, ChatDetails>;
  pendingChatDetails: ChatDetails | null;
};

export function hasWaitingChatResponses(
  chatDetails: Record<string, ChatDetails>,
): boolean {
  for (const chatId in chatDetails) {
    if (!Object.prototype.hasOwnProperty.call(chatDetails, chatId)) {
      continue;
    }
    const details = chatDetails[chatId];
    if (details?.waitingForResponse) {
      return true;
    }
  }
  return false;
}

export function createHasActiveProjectAIChatSelector(
  scanChatDetails: (chatDetails: Record<string, ChatDetails>) => boolean = (
    chatDetails,
  ) => hasWaitingChatResponses(chatDetails),
): (state: AIWaitingSlice) => boolean {
  let lastChatDetailsRef: Record<string, ChatDetails> | null = null;
  let lastChatDetailsResult = false;

  return (state: AIWaitingSlice): boolean => {
    if (state.pendingChatDetails?.waitingForResponse) {
      return true;
    }
    if (state.chatDetails === lastChatDetailsRef) {
      return lastChatDetailsResult;
    }
    lastChatDetailsRef = state.chatDetails;
    lastChatDetailsResult = scanChatDetails(state.chatDetails);
    return lastChatDetailsResult;
  };
}

export const selectHasActiveProjectAIChat =
  createHasActiveProjectAIChatSelector();
