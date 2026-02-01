import {
  BaseChatMessageUnion,
  ChatSectionBranch,
  ChatSectionState,
} from "utils/generatedTypes";
import { createNewId } from "utils/idNameCreation";
import { ChatBranchInfo } from "state/definitions";
import { ChatBranchIndex } from "./aiBranches";

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
    const activeMessages = branches[activeBranchId]?.messages ?? [];
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
  const branchChildrenByChatId: Record<
    string,
    Record<string, Array<string>>
  > = {};
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
  for (const info of Object.values(branchInfoByChatId)) {
    if (!info.branchParentChatId || !info.branchFromMessageId) {
      continue;
    }
    const parentEntry =
      branchChildrenByChatId[info.branchParentChatId] ?? {};
    const messageChildren = parentEntry[info.branchFromMessageId] ?? [];
    parentEntry[info.branchFromMessageId] = [...messageChildren, info.chatId];
    branchChildrenByChatId[info.branchParentChatId] = parentEntry;
  }
  return { branchInfoByChatId, branchChildrenByChatId };
}
