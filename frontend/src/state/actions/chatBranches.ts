import { ChatBranchInfo } from "state/definitions";
import {
  BaseChatMessageUnion,
  ChatSectionBranch,
  ChatSectionState,
} from "utils/generatedTypes";
import { createNewId } from "utils/idNameCreation";
import { ChatBranchIndex } from "./aiBranches";
import {
  getMessageCompletenessScore,
  mergeChatMessages,
} from "./chatMergeUtils";

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
      const mergedMessages = mergeChatMessages(
        activeMessages,
        incomingMessages,
      );
      const nextBranch: ChatSectionBranch = {
        ...activeBranch,
        messages: mergedMessages,
      };
      return {
        nextState: {
          ...state,
          messages: [...mergedMessages],
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
    return incomingMessages.length > 0;
  }
  const branchById = new Map<string, BaseChatMessageUnion>();
  for (const message of branchMessages) {
    branchById.set(message.id, message);
  }
  for (const message of incomingMessages) {
    const existing = branchById.get(message.id);
    if (!existing) {
      return true;
    }
    if (
      getMessageCompletenessScore(message) >
      getMessageCompletenessScore(existing)
    ) {
      return true;
    }
  }
  return false;
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
  const branchInfoByChatId: Record<string, ChatBranchInfo> = {};
  for (const [branchId, branch] of Object.entries(branches)) {
    if (!branch.parentBranchId || !branch.branchFromMessageId) {
      continue;
    }
    branchInfoByChatId[branchId] = {
      chatId: branchId,
      branchParentChatId: branch.parentBranchId,
      branchFromMessageId: branch.branchFromMessageId,
      branchRootChatId: null,
      branchCreatedAt: branch.createdAt ?? null,
    };
  }
  return { branchInfoByChatId };
}
