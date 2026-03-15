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
} from "state/utils/chatAppGeneration";
import { getErrorCode, res200 } from "utils/endpointUtils";
import {
  route_get_external_agent_chat,
  route_get_llm_chat,
} from "utils/generatedEndpoints";
import {
  type BaseChatMessageUnion,
  type ChatSectionState,
} from "utils/generatedTypes";
import { getDefaultChatDetails } from "./aiChatDetails";
import {
  getChatSectionStateFromStore,
  persistChatSectionState,
} from "./aiChatSectionState";
import { clearStopEligibleAssistantMessageId } from "./aiStopEligibleAssistantMessages";
import { reconcileHydratedChatMessages } from "./chatMergeUtils";

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

export type ChatHydrationOutcomeType =
  | "success"
  | "transient_failure"
  | "terminal_failure";

export type ChatHydrationErrorCode =
  | "llm_disallowed"
  | "chat_not_found"
  | "chat_runtime_ambiguous"
  | "terminal_hydration_failure";

export type ChatHydrationOutcome = {
  outcome: ChatHydrationOutcomeType;
  status: number | undefined;
  errorCode: ChatHydrationErrorCode | null;
};

function parseChatHydrationErrorCode(
  value: string | null,
): ChatHydrationErrorCode | null {
  if (value === "llm_disallowed") {
    return "llm_disallowed";
  }
  if (value === "chat_not_found") {
    return "chat_not_found";
  }
  if (value === "chat_runtime_ambiguous") {
    return "chat_runtime_ambiguous";
  }
  return null;
}

function classifyChatHydrationOutcomeType(
  status: number | undefined,
): ChatHydrationOutcomeType {
  if (status === 403 || status === 404 || status === 409) {
    return "terminal_failure";
  }
  return "transient_failure";
}

function buildChatHydrationFailureOutcome(response: {
  status: number | undefined;
  data: unknown;
}): ChatHydrationOutcome {
  const outcome = classifyChatHydrationOutcomeType(response.status);
  const parsedErrorCode = parseChatHydrationErrorCode(
    getErrorCode(response.data),
  );
  return {
    outcome,
    status: response.status,
    errorCode:
      outcome === "terminal_failure"
        ? parsedErrorCode ??
          (response.status === 403
            ? "llm_disallowed"
            : "terminal_hydration_failure")
        : parsedErrorCode,
  };
}

type ChatHydrationProbeResult<TPayload> =
  | {
      outcome: "success";
      status: number | undefined;
      errorCode: null;
      payload: TPayload;
    }
  | {
      outcome: ChatHydrationOutcomeType;
      status: number | undefined;
      errorCode: ChatHydrationErrorCode | null;
      payload: null;
    };

async function probeLLMChatHydration(
  chatId: string,
  projectConfigId: string,
): Promise<
  ChatHydrationProbeResult<
    NonNullable<Awaited<ReturnType<typeof route_get_llm_chat>>["data"]>
  >
> {
  const response = await route_get_llm_chat({ chatId, projectConfigId });
  if (!res200(response)) {
    return {
      ...buildChatHydrationFailureOutcome(response),
      payload: null,
    };
  }
  return {
    outcome: "success",
    status: response.status,
    errorCode: null,
    payload: response.data,
  };
}

async function probeExternalAgentChatHydration(
  chatId: string,
  projectConfigId: string | null,
): Promise<
  ChatHydrationProbeResult<
    NonNullable<
      Awaited<ReturnType<typeof route_get_external_agent_chat>>["data"]
    >
  >
> {
  const response = await route_get_external_agent_chat({
    chatId,
    projectConfigId,
  });
  if (!res200(response)) {
    return {
      ...buildChatHydrationFailureOutcome(response),
      payload: null,
    };
  }
  return {
    outcome: "success",
    status: response.status,
    errorCode: null,
    payload: response.data,
  };
}

function applyLLMChatHydrationSuccess({
  chatId,
  sectionId,
  projectConfigId,
  payload,
}: {
  chatId: string;
  sectionId?: string;
  projectConfigId: string;
  payload: NonNullable<Awaited<ReturnType<typeof route_get_llm_chat>>["data"]>;
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

function applyExternalChatHydrationSuccess({
  chatId,
  projectConfigId,
  sectionId,
  payload,
}: {
  chatId: string;
  projectConfigId: string | null;
  sectionId?: string;
  payload: NonNullable<
    Awaited<ReturnType<typeof route_get_external_agent_chat>>["data"]
  >;
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

export async function getLLMChatHydrationOutcome(
  chatId: string,
  sectionId?: string,
): Promise<ChatHydrationOutcome> {
  const projectConfigId = getCurrProjectConfigId();
  const outcome = await probeLLMChatHydration(chatId, projectConfigId);
  if (outcome.outcome === "success") {
    applyLLMChatHydrationSuccess({
      chatId,
      sectionId,
      projectConfigId,
      payload: outcome.payload,
    });
    return {
      outcome: "success",
      status: outcome.status,
      errorCode: null,
    };
  }
  return {
    outcome: outcome.outcome,
    status: outcome.status,
    errorCode: outcome.errorCode,
  };
}

export async function getLLMChat(
  chatId: string,
  sectionId?: string,
): Promise<boolean> {
  const outcome = await getLLMChatHydrationOutcome(chatId, sectionId);
  return outcome.outcome === "success";
}

export async function getExternalAgentChatHydrationOutcome(
  chatId: string,
  projectConfigId: string | null,
  sectionId?: string,
): Promise<ChatHydrationOutcome> {
  const outcome = await probeExternalAgentChatHydration(
    chatId,
    projectConfigId,
  );
  if (outcome.outcome === "success") {
    applyExternalChatHydrationSuccess({
      chatId,
      projectConfigId,
      sectionId,
      payload: outcome.payload,
    });
    return {
      outcome: "success",
      status: outcome.status,
      errorCode: null,
    };
  }
  return {
    outcome: outcome.outcome,
    status: outcome.status,
    errorCode: outcome.errorCode,
  };
}

export async function getExternalAgentChat(
  chatId: string,
  projectConfigId: string | null,
  sectionId?: string,
): Promise<boolean> {
  const outcome = await getExternalAgentChatHydrationOutcome(
    chatId,
    projectConfigId,
    sectionId,
  );
  return outcome.outcome === "success";
}
