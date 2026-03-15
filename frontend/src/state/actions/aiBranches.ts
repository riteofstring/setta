import { ChatBranchInfo } from "state/definitions";
import { AgentRun } from "utils/generatedTypes";
import {
  getRunInputNumber,
  getRunInputString,
  getRunLastUpdatedMs,
} from "./agentRunUtils";
import {
  buildChatBranchIndexFromInfos,
  buildMessageBranchInfo,
  type ChatBranchIndex,
  type ChatMessageBranchInfo,
} from "./chatBranchIndex";

export { buildMessageBranchInfo };
export type { ChatBranchIndex, ChatMessageBranchInfo };

type BranchMetadata = {
  branchParentChatId: string | null;
  branchFromMessageId: string | null;
  branchRootChatId: string | null;
  branchCreatedAt: number | null;
};

export function buildChatBranchIndex(runs: Array<AgentRun>): ChatBranchIndex {
  const infos: ChatBranchInfo[] = [];

  for (const run of runs) {
    const chatId = getRunChatId(run);
    if (!chatId) {
      continue;
    }
    const branchMetadata = getBranchMetadata(run);
    if (
      !branchMetadata.branchParentChatId ||
      !branchMetadata.branchFromMessageId
    ) {
      continue;
    }
    const fallbackTimestamp = getRunLastUpdatedMs(run);
    const branchCreatedAt = branchMetadata.branchCreatedAt ?? fallbackTimestamp;
    infos.push({
      chatId,
      branchParentChatId: branchMetadata.branchParentChatId,
      branchFromMessageId: branchMetadata.branchFromMessageId,
      branchRootChatId: branchMetadata.branchRootChatId,
      branchCreatedAt,
    });
  }

  return buildChatBranchIndexFromInfos(infos);
}

function getBranchMetadata(run: AgentRun): BranchMetadata {
  const branchParentChatId = getRunInputString(run, "branchParentChatId");
  const branchFromMessageId = getRunInputString(run, "branchFromMessageId");
  const branchRootChatId = getRunInputString(run, "branchRootChatId");
  const branchCreatedAt = getRunInputNumber(run, "branchCreatedAt");
  return {
    branchParentChatId,
    branchFromMessageId,
    branchRootChatId,
    branchCreatedAt,
  };
}

function getRunChatId(run: AgentRun): string | null {
  const chatId = getRunInputString(run, "chatId");
  if (chatId && chatId.trim()) {
    return chatId;
  }
  return null;
}
