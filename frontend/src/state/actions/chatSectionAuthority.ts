import { setChatSectionState } from "openapi/http";
import { callOpenAPI } from "openapi/http/result";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrEffectiveSectionImplIfPresent,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionInfos";
import { isSectionStreamActive } from "state/aiStreamingTracker";
import { useProjectState, type ZustandProjectState } from "state/definitions";
import {
  BaseChatMessageUnion,
  ChatSectionBranch,
  ChatSectionImpl,
  ChatSectionState,
  SectionTypeEnum,
} from "utils/generatedTypes";
import { resolveHydratedToolCallArguments } from "./chatHydrationOverlays";
import { reconcileHydratedChatMessages } from "./chatMergeUtils";

type HydratedChatIncoming = {
  messages: Array<BaseChatMessageUnion>;
  waitingForResponse: boolean;
  toolCallArguments: Record<string, string>;
};

type ChatSectionStateSnapshot = Pick<
  ChatSectionState,
  | "messages"
  | "inputText"
  | "waitingForResponse"
  | "toolCallArguments"
  | "activeBranchId"
  | "branches"
>;

function cloneChatBranches(
  branches: Record<string, ChatSectionBranch> | undefined,
): Record<string, ChatSectionBranch> {
  if (!branches) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(branches).map(([branchId, branch]) => [
      branchId,
      {
        ...branch,
        messages: [...(branch.messages ?? [])],
      },
    ]),
  );
}

function cloneChatSectionStateSnapshot(
  state: Partial<ChatSectionStateSnapshot>,
): ChatSectionState {
  return {
    messages: [...(state.messages ?? [])],
    inputText: state.inputText ?? "",
    waitingForResponse: Boolean(state.waitingForResponse),
    toolCallArguments: { ...(state.toolCallArguments ?? {}) },
    activeBranchId: state.activeBranchId ?? null,
    branches: cloneChatBranches(state.branches),
  };
}

function normalizeHydratedChatIncoming(
  incoming: HydratedChatIncoming,
): HydratedChatIncoming {
  return {
    messages: [...(incoming.messages ?? [])],
    waitingForResponse: Boolean(incoming.waitingForResponse),
    toolCallArguments: { ...(incoming.toolCallArguments ?? {}) },
  };
}

function resolveHydratedWaitingForResponse({
  preserveWaitingForResponse,
  incomingWaitingForResponse,
  currentWaitingForResponse,
}: {
  preserveWaitingForResponse: boolean;
  incomingWaitingForResponse: boolean;
  currentWaitingForResponse: boolean;
}): boolean {
  if (!preserveWaitingForResponse) {
    return incomingWaitingForResponse;
  }
  return incomingWaitingForResponse || currentWaitingForResponse;
}

function isChatSectionImpl(
  value: ReturnType<typeof getCurrEffectiveSectionImplIfPresent>,
): value is ChatSectionImpl {
  return value?.type === SectionTypeEnum.Chat;
}

function mergeHydratedChatSectionState(
  currentState: ChatSectionState,
  incoming: HydratedChatIncoming,
  preserveWaitingForResponse: boolean,
): ChatSectionState {
  const currentSnapshot = cloneChatSectionStateSnapshot(currentState);
  const normalizedIncoming = normalizeHydratedChatIncoming(incoming);
  // Section chat state is a projection of backend-authored managed chat
  // messages plus narrow local UI overlays. Hydration replaces message rows
  // authoritatively and preserves only the section draft input plus
  // stream-owned waiting/tool-call overlays while a local stream is active.
  const mergedMessages = reconcileHydratedChatMessages({
    backendMessages: normalizedIncoming.messages,
    localMessages: currentSnapshot.messages,
  });
  const nextBranches = syncHydratedActiveBranchMessages({
    branches: currentSnapshot.branches,
    activeBranchId: currentSnapshot.activeBranchId,
    messages: mergedMessages,
  });
  return {
    ...currentSnapshot,
    messages: mergedMessages,
    waitingForResponse: resolveHydratedWaitingForResponse({
      preserveWaitingForResponse,
      incomingWaitingForResponse: normalizedIncoming.waitingForResponse,
      currentWaitingForResponse: currentSnapshot.waitingForResponse,
    }),
    toolCallArguments: resolveHydratedToolCallArguments({
      backendToolCallArguments: normalizedIncoming.toolCallArguments,
      localToolCallArguments: currentSnapshot.toolCallArguments,
      preserveLocalOverlay: preserveWaitingForResponse,
    }),
    branches: nextBranches,
  };
}
function syncHydratedActiveBranchMessages({
  branches,
  activeBranchId,
  messages,
}: {
  branches: Record<string, ChatSectionBranch>;
  activeBranchId: string | null;
  messages: Array<BaseChatMessageUnion>;
}): Record<string, ChatSectionBranch> {
  if (!activeBranchId) {
    return { ...branches };
  }
  const activeBranch = branches[activeBranchId];
  if (!activeBranch) {
    return { ...branches };
  }
  return {
    ...branches,
    [activeBranchId]: {
      ...activeBranch,
      // The active section branch is the visible projection of the
      // authoritative managed-chat history and must track hydrated messages.
      messages: [...messages],
    },
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
      callOpenAPI(
        setChatSectionState({
          body: {
            projectConfigId,
            sectionId,
            state: nextState,
            frontendOpId,
          },
        } as Parameters<typeof setChatSectionState>[0]),
      ),
  });
}
export function getChatSectionStateFromStore(
  state: ZustandProjectState,
  sectionId: string,
): ChatSectionState | null {
  const effective = getCurrEffectiveSectionImplIfPresent(state, sectionId);
  if (!isChatSectionImpl(effective)) {
    return null;
  }
  return cloneChatSectionStateSnapshot(effective);
}
