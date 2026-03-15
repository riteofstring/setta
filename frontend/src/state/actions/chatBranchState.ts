import {
  BaseChatMessageUnion,
  ChatSectionBranch,
  ChatSectionState,
} from "utils/generatedTypes";
import { createNewId } from "utils/idNameCreation";

import {
  getMessageCompletenessScore,
  mergeChatMessages,
} from "./chatMessageMerge";

export type BranchInitializationResult = {
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
