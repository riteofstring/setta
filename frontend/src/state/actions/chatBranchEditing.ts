import {
  BaseChatMessageUnion,
  ChatSectionBranch,
  ChatSectionState,
} from "utils/generatedTypes";
import { createNewId } from "utils/idNameCreation";

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
