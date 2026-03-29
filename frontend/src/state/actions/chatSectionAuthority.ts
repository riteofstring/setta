import {
  dispatchOptimisticProjectStateUpdate,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionInfos";
import { isSectionStreamActive } from "state/aiStreamingTracker";
import { useProjectState, type ZustandProjectState } from "state/definitions";
import { route_set_chat_section_state } from "utils/generatedEndpoints";
import {
  BaseChatMessageUnion,
  ChatSectionBranch,
  ChatSectionState,
  SectionTypeEnum,
} from "utils/generatedTypes";
import { reconcileHydratedChatMessages } from "./chatMergeUtils";

export function resolveHydratedToolCallArguments({
  backendToolCallArguments,
  localToolCallArguments,
  preserveLocalOverlay,
}: {
  backendToolCallArguments: Record<string, string>;
  localToolCallArguments: Record<string, string>;
  preserveLocalOverlay: boolean;
}): Record<string, string> {
  if (!preserveLocalOverlay) {
    return { ...backendToolCallArguments };
  }
  return {
    ...backendToolCallArguments,
    ...localToolCallArguments,
  };
}

function mergeHydratedChatSectionState(
  currentState: ChatSectionState,
  incoming: {
    messages: Array<BaseChatMessageUnion>;
    waitingForResponse: boolean;
    toolCallArguments: Record<string, string>;
  },
  preserveWaitingForResponse: boolean,
): ChatSectionState {
  // Section chat state is a projection of backend-authored managed chat
  // messages plus narrow local UI overlays. Hydration replaces message rows
  // authoritatively and preserves only the section draft input plus
  // stream-owned waiting/tool-call overlays while a local stream is active.
  const mergedMessages = reconcileHydratedChatMessages({
    backendMessages: incoming.messages ?? [],
    localMessages: currentState.messages ?? [],
  });
  const nextWaitingForResponse = preserveWaitingForResponse
    ? Boolean(incoming.waitingForResponse || currentState.waitingForResponse)
    : Boolean(incoming.waitingForResponse);
  const nextToolCallArguments = resolveHydratedToolCallArguments({
    backendToolCallArguments: incoming.toolCallArguments ?? {},
    localToolCallArguments: currentState.toolCallArguments ?? {},
    preserveLocalOverlay: preserveWaitingForResponse,
  });
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
  messages: Array<BaseChatMessageUnion>;
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
    nextState = mergeHydratedChatSectionState(
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

export function persistChatSectionState({
  projectConfigId,
  sectionId,
  nextState,
}: {
  projectConfigId: string;
  sectionId: string;
  nextState: ChatSectionState | null;
  reason: string;
}): void {
  if (!nextState) {
    return;
  }
  dispatchOptimisticProjectStateUpdate({
    apply: (state) => {
      setCurrEffectiveSectionImplValue<"ChatSection">(state, sectionId, {
        messages: nextState.messages,
        inputText: nextState.inputText,
        waitingForResponse: nextState.waitingForResponse,
        toolCallArguments: nextState.toolCallArguments,
        activeBranchId: nextState.activeBranchId,
        branches: nextState.branches,
      });
    },
    send: (frontendOpId) =>
      route_set_chat_section_state({
        projectConfigId,
        sectionId,
        state: nextState,
        frontendOpId,
      }),
  });
}

export function getChatSectionStateFromStore(
  state: ZustandProjectState,
  sectionId: string,
): ChatSectionState | null {
  const variantId = state.projectConfig.sectionVariantMap[sectionId];
  if (!variantId) {
    return null;
  }
  const variant = state.sectionVariants[variantId];
  if (!variant) {
    return null;
  }
  const impl = state.sectionImpls[variant.impl];
  if (!impl) {
    return null;
  }
  const core = state.sections[sectionId];
  if (!core) {
    return null;
  }
  const effective = {
    ...impl,
    ...core.sharedModifier,
    ...variant.modifier,
  };
  if (effective.type !== SectionTypeEnum.Chat) {
    return null;
  }
  const chatImpl = effective as {
    type: SectionTypeEnum.Chat;
    messages: BaseChatMessageUnion[];
    inputText: string;
    waitingForResponse: boolean;
    toolCallArguments: Record<string, string>;
    activeBranchId?: string | null;
    branches?: Record<string, ChatSectionBranch>;
  };
  return {
    messages: [...(chatImpl.messages ?? [])],
    inputText: chatImpl.inputText ?? "",
    waitingForResponse: Boolean(chatImpl.waitingForResponse),
    toolCallArguments: { ...(chatImpl.toolCallArguments ?? {}) },
    activeBranchId: chatImpl.activeBranchId ?? null,
    branches: { ...(chatImpl.branches ?? {}) },
  };
}
