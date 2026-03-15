import { setCurrEffectiveSectionImplValue } from "state/actions/sectionEffectiveImplMutations";
import { getCurrProjectConfigId } from "state/actions/sectionEffectiveImplSelectors";
import { isSectionStreamActive } from "state/aiStreamingTracker";
import { useProjectState } from "state/definitions";
import {
  type BaseChatMessageUnion,
  type ChatSectionState,
} from "utils/generatedTypes";

import {
  getChatSectionStateFromStore,
  persistChatSectionState,
} from "./aiChatSectionState";
import {
  type ExternalAgentChatHydrationPayload,
  type LLMChatHydrationPayload,
} from "./aiHydrationOutcome";
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

export function applyHydratedChatDetailsToSectionState({
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

export function syncLLMHydratedChatToSectionState({
  projectConfigId,
  sectionId,
  payload,
}: {
  projectConfigId: string;
  sectionId: string;
  payload: LLMChatHydrationPayload;
}): void {
  const nextState = applyHydratedChatDetailsToSectionState({
    sectionId,
    messages: payload.messages,
    waitingForResponse: payload.waitingForResponse,
    toolCallArguments: {},
  });
  persistChatSectionState({
    projectConfigId,
    sectionId,
    nextState,
    reason: "hydrate-llm-chat",
  });
}

export function syncExternalHydratedChatToSectionState({
  projectConfigId,
  sectionId,
  payload,
}: {
  projectConfigId: string | null;
  sectionId: string;
  payload: ExternalAgentChatHydrationPayload;
}): void {
  const nextState = applyHydratedChatDetailsToSectionState({
    sectionId,
    messages: payload.messages,
    waitingForResponse: payload.waitingForResponse,
    toolCallArguments: payload.toolCallArguments,
  });
  persistChatSectionState({
    projectConfigId: projectConfigId ?? getCurrProjectConfigId(),
    sectionId,
    nextState,
    reason: "hydrate-external-chat",
  });
}
