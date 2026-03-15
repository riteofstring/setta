import { ChatBranchInfo } from "state/stores/aiStores";
import { ChatSectionBranch } from "utils/generatedTypes";

import {
  buildChatBranchIndexFromInfos,
  type ChatBranchIndex,
} from "./chatBranchIndex";

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
