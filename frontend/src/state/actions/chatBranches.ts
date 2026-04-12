import _ from "lodash";
import { ChatBranchInfo } from "state/definitions";
import {
  BaseChatMessageUnion,
  ChatSectionBranch,
  ChatSectionState,
} from "utils/generatedTypes";
import { createNewId } from "utils/idNameCreation";
import {
  buildChatBranchIndexFromInfos,
  type ChatBranchIndex,
} from "./chatBranchIndex";
import { reconcileHydratedChatMessages } from "./chatMergeUtils";

type BranchInitializationResult = {
  nextState: ChatSectionState;
  didInitialize: boolean;
};

export function ensureChatBranchState(
  state: ChatSectionState,
): BranchInitializationResult {
  const branches = state.branches ?? {};
  const branchIds = Object.keys(branches);
  if (branchIds.length === 0) {
    const rootBranchId = createNewId();
    const rootBranch: ChatSectionBranch = {
      messages: [...(state.messages ?? [])],
      createdAt: Date.now(),
      parentBranchId: null,
      branchFromMessageId: null,
    };
    return {
      nextState: {
        ...state,
        branches: { [rootBranchId]: rootBranch },
        activeBranchId: rootBranchId,
        messages: [...(state.messages ?? [])],
      },
      didInitialize: true,
    };
  }
  const activeBranchId = state.activeBranchId;
  if (activeBranchId && branches[activeBranchId]) {
    const activeBranch = branches[activeBranchId];
    const activeMessages = activeBranch?.messages ?? [];
    const incomingMessages = state.messages ?? [];
    if (shouldSyncBranchMessages(activeMessages, incomingMessages)) {
      const syncedMessages = reconcileHydratedChatMessages({
        // The active branch is the visible source for this section chat. When
        // the source messages change, the branch must mirror that authoritative
        // list and only preserve local createdAt metadata for stable UI order.
        backendMessages: incomingMessages,
        localMessages: activeMessages,
      });
      const nextBranch: ChatSectionBranch = {
        ...activeBranch,
        messages: syncedMessages,
      };
      return {
        nextState: {
          ...state,
          messages: [...syncedMessages],
          branches: {
            ...branches,
            [activeBranchId]: nextBranch,
          },
        },
        didInitialize: true,
      };
    }
    return {
      nextState: {
        ...state,
        messages: [...activeMessages],
      },
      didInitialize: false,
    };
  }
  const sortedBranchId = [...branchIds].sort((left, right) => {
    const leftCreated = branches[left]?.createdAt ?? 0;
    const rightCreated = branches[right]?.createdAt ?? 0;
    if (leftCreated === rightCreated) {
      return left.localeCompare(right);
    }
    return leftCreated - rightCreated;
  })[0];
  if (!sortedBranchId) {
    return { nextState: state, didInitialize: false };
  }
  const activeMessages = branches[sortedBranchId]?.messages ?? [];
  return {
    nextState: {
      ...state,
      activeBranchId: sortedBranchId,
      messages: [...activeMessages],
    },
    didInitialize: true,
  };
}

function shouldSyncBranchMessages(
  branchMessages: Array<BaseChatMessageUnion>,
  incomingMessages: Array<BaseChatMessageUnion>,
): boolean {
  if (incomingMessages.length === 0) {
    return false;
  }
  if (branchMessages.length === 0) {
    return true;
  }
  if (branchMessages.length !== incomingMessages.length) {
    return true;
  }
  for (let index = 0; index < incomingMessages.length; index += 1) {
    if (branchMessages[index]?.id !== incomingMessages[index]?.id) {
      return true;
    }
  }
  return !_.isEqual(
    branchMessages.map(stripMessageCreatedAt),
    incomingMessages.map(stripMessageCreatedAt),
  );
}

function stripMessageCreatedAt(
  message: BaseChatMessageUnion,
): BaseChatMessageUnion {
  const { createdAt: _createdAt, ...rest } = message as BaseChatMessageUnion & {
    createdAt?: unknown;
  };
  return rest as BaseChatMessageUnion;
}

export function buildEditedMessageHistory(
  messages: Array<BaseChatMessageUnion>,
  editedMessage: BaseChatMessageUnion,
): Array<BaseChatMessageUnion> | null {
  const targetIndex = messages.findIndex(
    (message) => message.id === editedMessage.id,
  );
  if (targetIndex < 0) {
    return null;
  }
  return [...messages.slice(0, targetIndex), editedMessage];
}

export function buildBranchFromEdit({
  state,
  editedMessage,
  branchFromMessageId,
  branchId,
  createdAt,
}: {
  state: ChatSectionState;
  editedMessage: BaseChatMessageUnion;
  branchFromMessageId: string;
  branchId?: string;
  createdAt?: number;
}): { nextState: ChatSectionState; newBranchId: string } | null {
  const parentBranchId = state.activeBranchId;
  if (!parentBranchId) {
    return null;
  }
  const branches = state.branches ?? {};
  const parentBranch = branches[parentBranchId];
  if (!parentBranch) {
    return null;
  }
  const nextMessages = buildEditedMessageHistory(
    parentBranch.messages ?? [],
    editedMessage,
  );
  if (!nextMessages) {
    return null;
  }
  const resolvedBranchId = branchId ?? createNewId();
  const branchCreatedAt = createdAt ?? Date.now();
  const nextBranch: ChatSectionBranch = {
    messages: nextMessages,
    createdAt: branchCreatedAt,
    parentBranchId,
    branchFromMessageId,
  };
  return {
    nextState: {
      ...state,
      branches: {
        ...branches,
        [resolvedBranchId]: nextBranch,
      },
      activeBranchId: resolvedBranchId,
      messages: nextMessages,
    },
    newBranchId: resolvedBranchId,
  };
}

export function buildBranchIndexFromBranches(
  branches: Record<string, ChatSectionBranch>,
): ChatBranchIndex {
  const infos: ChatBranchInfo[] = [];
  for (const [branchId, branch] of Object.entries(branches)) {
    if (!branch.parentBranchId || !branch.branchFromMessageId) {
      continue;
    }
    const branchRootChatId = resolveBranchRootChatId(
      branchId,
      branch.branchFromMessageId,
      branches,
    );
    infos.push({
      chatId: branchId,
      branchParentChatId: branch.parentBranchId,
      branchFromMessageId: branch.branchFromMessageId,
      branchRootChatId,
      branchCreatedAt: branch.createdAt ?? null,
    });
  }
  return buildChatBranchIndexFromInfos(infos);
}

function resolveBranchRootChatId(
  branchId: string,
  branchFromMessageId: string,
  branches: Record<string, ChatSectionBranch>,
): string | null {
  let currentId: string | null = branchId;
  let rootCandidate: string | null = branchId;
  const seen = new Set<string>();
  while (currentId && !seen.has(currentId)) {
    seen.add(currentId);
    const parentId = branches[currentId]?.parentBranchId ?? null;
    if (!parentId) {
      return rootCandidate;
    }
    const parentBranch = branches[parentId];
    if (!branchHasMessage(parentBranch, branchFromMessageId)) {
      return rootCandidate;
    }
    rootCandidate = parentId;
    currentId = parentId;
  }
  return rootCandidate;
}

function branchHasMessage(
  branch: ChatSectionBranch | undefined,
  messageId: string,
): boolean {
  if (!branch) {
    return false;
  }
  return (branch.messages ?? []).some((message) => message.id === messageId);
}
