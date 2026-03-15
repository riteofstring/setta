import { clearAIFollowToolArgumentsForChat } from "state/actions/aiFollow";
import { setCurrEffectiveSectionImplValue } from "state/actions/sectionEffectiveImplMutations";
import { getCurrProjectConfigId } from "state/actions/sectionEffectiveImplSelectors";
import {
  isChatStreamActive,
  isSectionStreamActive,
} from "state/aiStreamingTracker";
import { useProjectState } from "state/definitions";
import { useAIStore } from "state/stores/aiStores";
import {
  buildChatAppGenerationDetails,
  deserializeChatAppGenerationByMessageId,
} from "state/utils/chatAppGenerationDetails";
import {
  type BaseChatMessageUnion,
  type ChatSectionState,
} from "utils/generatedTypes";
import { getDefaultChatDetails } from "./aiChatDetails";
import {
  getChatSectionStateFromStore,
  persistChatSectionState,
} from "./aiChatSectionState";
import {
  type ExternalAgentChatHydrationPayload,
  type LLMChatHydrationPayload,
} from "./aiHydrationOutcome";
import { clearStopEligibleAssistantMessageId } from "./aiStopEligibleAssistantMessages";
import { reconcileHydratedChatMessages } from "./chatHydrationMerge";

type IncomingChatSectionState = {
  messages: BaseChatMessageUnion[];
  waitingForResponse: boolean;
  toolCallArguments: Record<string, string>;
};

function mergeChatSectionState(
  currentState: ChatSectionState,
  incoming: IncomingChatSectionState,
  preserveWaitingForResponse: boolean,
): ChatSectionState {
  const mergedMessages = reconcileHydratedChatMessages({
    backendMessages: incoming.messages ?? [],
    localMessages: currentState.messages ?? [],
    // Preserve local-only activity rows so thought/tool sequencing is not
    // flattened by a hydration refresh while the local stream is still active.
    preserveLocalOnlyMessages: preserveWaitingForResponse,
  });
  const nextWaitingForResponse = preserveWaitingForResponse
    ? Boolean(incoming.waitingForResponse || currentState.waitingForResponse)
    : Boolean(incoming.waitingForResponse);
  const nextToolCallArguments = preserveWaitingForResponse
    ? {
        ...(currentState.toolCallArguments ?? {}),
        ...(incoming.toolCallArguments ?? {}),
      }
    : { ...(incoming.toolCallArguments ?? {}) };
  return {
    messages: mergedMessages,
    inputText: currentState.inputText ?? "",
    waitingForResponse: nextWaitingForResponse,
    toolCallArguments: nextToolCallArguments,
    activeBranchId: currentState.activeBranchId ?? null,
    branches: { ...(currentState.branches ?? {}) },
  };
}

function applyChatDetailsToSectionState({
  sectionId,
  messages,
  waitingForResponse,
  toolCallArguments,
}: {
  sectionId: string;
  messages: BaseChatMessageUnion[];
  waitingForResponse: boolean;
  toolCallArguments: Record<string, string>;
}): ChatSectionState | null {
  let nextState: ChatSectionState | null = null;
  useProjectState.setState((state) => {
    const currentState = getChatSectionStateFromStore(state, sectionId);
    if (!currentState) {
      return;
    }
    const preserveWaitingForResponse = isSectionStreamActive(sectionId);
    nextState = mergeChatSectionState(
      currentState,
      {
        messages,
        waitingForResponse,
        toolCallArguments,
      },
      preserveWaitingForResponse,
    );
    setCurrEffectiveSectionImplValue<"ChatSection">(state, sectionId, {
      messages: nextState.messages,
      waitingForResponse: nextState.waitingForResponse,
      toolCallArguments: nextState.toolCallArguments,
      inputText: nextState.inputText,
      activeBranchId: nextState.activeBranchId,
      branches: nextState.branches,
    });
  });
  return nextState;
}

export function applyLLMChatHydrationSuccess({
  chatId,
  sectionId,
  projectConfigId,
  payload,
}: {
  chatId: string;
  sectionId?: string;
  projectConfigId: string;
  payload: LLMChatHydrationPayload;
}): void {
  const {
    messages,
    waitingForResponse,
    llmConfig,
    contextUsage,
    appGenerationByMessageId,
  } = payload;
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
    return {
      chatDetails: {
        ...state.chatDetails,
        [chatId]: {
          ...getDefaultChatDetails(),
          ...(existingDetails ?? {}),
          messages: nextMessages,
          waitingForResponse: nextWaitingForResponse,
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
  if (sectionId) {
    const nextState = applyChatDetailsToSectionState({
      sectionId,
      messages,
      waitingForResponse,
      toolCallArguments: {},
    });
    persistChatSectionState({
      projectConfigId,
      sectionId,
      nextState,
      reason: "hydrate-llm-chat",
    });
  }
  if (!nextWaitingForResponse) {
    clearStopEligibleAssistantMessageId(chatId);
    clearAIFollowToolArgumentsForChat(projectConfigId, chatId);
  }
}

export function applyExternalChatHydrationSuccess({
  chatId,
  projectConfigId,
  sectionId,
  payload,
}: {
  chatId: string;
  projectConfigId: string | null;
  sectionId?: string;
  payload: ExternalAgentChatHydrationPayload;
}): void {
  const {
    messages,
    waitingForResponse,
    toolCallArguments,
    contextUsage,
    appGenerationByMessageId,
  } = payload;
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
    return {
      chatDetails: {
        ...state.chatDetails,
        [chatId]: {
          ...getDefaultChatDetails(),
          ...(existingDetails ?? {}),
          messages: nextMessages,
          waitingForResponse: nextWaitingForResponse,
          toolCallArguments,
          llmConfig: null,
          contextUsage: contextUsage ?? null,
        },
      },
      chatAppGenerationDetailsByChatId: {
        ...state.chatAppGenerationDetailsByChatId,
        [chatId]: nextAppGenerationDetails,
      },
    };
  });
  if (sectionId) {
    const nextState = applyChatDetailsToSectionState({
      sectionId,
      messages,
      waitingForResponse,
      toolCallArguments,
    });
    const resolvedProjectConfigId = projectConfigId ?? getCurrProjectConfigId();
    persistChatSectionState({
      projectConfigId: resolvedProjectConfigId,
      sectionId,
      nextState,
      reason: "hydrate-external-chat",
    });
  }
  if (!nextWaitingForResponse) {
    clearStopEligibleAssistantMessageId(chatId);
    clearAIFollowToolArgumentsForChat(
      projectConfigId ?? getCurrProjectConfigId(),
      chatId,
    );
  }
}
