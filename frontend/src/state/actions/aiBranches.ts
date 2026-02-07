import { ChatBranchInfo } from "state/definitions";
import {
  AgentRun,
  BaseChatMessageUnion,
  ChatRoleEnum,
} from "utils/generatedTypes";

export type ChatBranchIndex = {
  branchInfoByChatId: Record<string, ChatBranchInfo>;
};

export type ChatMessageBranchInfo = {
  messageId: string;
  branchChatIds: Array<string>;
  activeIndex: number;
};

type BranchMetadata = {
  branchParentChatId: string | null;
  branchFromMessageId: string | null;
  branchRootChatId: string | null;
  branchCreatedAt: number | null;
};

export function buildChatBranchIndex(runs: Array<AgentRun>): ChatBranchIndex {
  const branchInfoByChatId: Record<string, ChatBranchInfo> = {};

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
    const existing = branchInfoByChatId[chatId];
    if (existing && existing.branchCreatedAt !== null) {
      if (branchCreatedAt <= existing.branchCreatedAt) {
        continue;
      }
    }
    branchInfoByChatId[chatId] = {
      chatId,
      branchParentChatId: branchMetadata.branchParentChatId,
      branchFromMessageId: branchMetadata.branchFromMessageId,
      branchRootChatId: branchMetadata.branchRootChatId,
      branchCreatedAt,
    };
  }

  return { branchInfoByChatId };
}

export function buildMessageBranchInfo({
  chatId,
  messages,
  branchIndex,
}: {
  chatId: string;
  messages: Array<BaseChatMessageUnion>;
  branchIndex: ChatBranchIndex;
}): Record<string, ChatMessageBranchInfo> {
  const info: Record<string, ChatMessageBranchInfo> = {};
  const branchFamilies = buildBranchFamilies(branchIndex);
  const ancestorChain = buildBranchAncestorChain(chatId, branchIndex);

  for (const message of messages) {
    if (!message || message.role === ChatRoleEnum.tool) {
      continue;
    }
    const switcher = resolveBranchSwitcher({
      messageId: message.id,
      branchFamilies,
      ancestorChain,
    });
    if (!switcher) {
      continue;
    }
    info[message.id] = switcher;
  }
  return info;
}

function resolveBranchSwitcher({
  messageId,
  branchFamilies,
  ancestorChain,
}: {
  messageId: string;
  branchFamilies: Record<string, Array<string>>;
  ancestorChain: Array<string>;
}): ChatMessageBranchInfo | null {
  const family = resolveBranchFamily(messageId, branchFamilies, ancestorChain);
  if (!family) {
    return null;
  }
  const branchChatIds = [family.rootChatId, ...family.children];
  const activeIndex = resolveActiveBranchIndex(branchChatIds, ancestorChain);
  if (branchChatIds.length <= 1 || activeIndex === -1) {
    return null;
  }
  return {
    messageId,
    branchChatIds,
    activeIndex,
  };
}

function sortBranchChildren(
  children: Array<string>,
  branchIndex: ChatBranchIndex,
): Array<string> {
  return [...children].sort((left, right) => {
    const leftInfo = branchIndex.branchInfoByChatId[left];
    const rightInfo = branchIndex.branchInfoByChatId[right];
    const leftTimestamp = leftInfo?.branchCreatedAt ?? 0;
    const rightTimestamp = rightInfo?.branchCreatedAt ?? 0;
    if (leftTimestamp === rightTimestamp) {
      return left.localeCompare(right);
    }
    return leftTimestamp - rightTimestamp;
  });
}

function buildBranchFamilyKey(rootChatId: string, messageId: string): string {
  return `${rootChatId}::${messageId}`;
}

function buildBranchFamilies(
  branchIndex: ChatBranchIndex,
): Record<string, Array<string>> {
  const families: Record<string, Array<string>> = {};
  for (const info of Object.values(branchIndex.branchInfoByChatId)) {
    const rootChatId = info.branchRootChatId ?? info.branchParentChatId;
    if (!rootChatId || !info.branchFromMessageId) {
      continue;
    }
    const key = buildBranchFamilyKey(rootChatId, info.branchFromMessageId);
    const existing = families[key] ?? [];
    families[key] = [...existing, info.chatId];
  }
  for (const [key, children] of Object.entries(families)) {
    families[key] = sortBranchChildren(children, branchIndex);
  }
  return families;
}

function buildBranchAncestorChain(
  chatId: string,
  branchIndex: ChatBranchIndex,
): Array<string> {
  const chain: Array<string> = [];
  let current: string | null = chatId;
  const seen = new Set<string>();
  while (current && !seen.has(current)) {
    seen.add(current);
    chain.push(current);
    const info = branchIndex.branchInfoByChatId[current];
    current = info?.branchParentChatId ?? null;
  }
  return chain;
}

function resolveBranchFamily(
  messageId: string,
  branchFamilies: Record<string, Array<string>>,
  ancestorChain: Array<string>,
): { rootChatId: string; children: Array<string> } | null {
  for (const ancestorId of ancestorChain) {
    const key = buildBranchFamilyKey(ancestorId, messageId);
    const children = branchFamilies[key];
    if (children && children.length > 0) {
      return { rootChatId: ancestorId, children };
    }
  }
  return null;
}

function resolveActiveBranchIndex(
  branchChatIds: Array<string>,
  ancestorChain: Array<string>,
): number {
  for (const ancestorId of ancestorChain) {
    const index = branchChatIds.indexOf(ancestorId);
    if (index !== -1) {
      return index;
    }
  }
  return -1;
}

function getBranchMetadata(run: AgentRun): BranchMetadata {
  const inputs = getRunInputs(run);
  const branchParentChatId = getStringInput(inputs, "branchParentChatId");
  const branchFromMessageId = getStringInput(inputs, "branchFromMessageId");
  const branchRootChatId = getStringInput(inputs, "branchRootChatId");
  const branchCreatedAt = getNumberInput(inputs, "branchCreatedAt");
  return {
    branchParentChatId,
    branchFromMessageId,
    branchRootChatId,
    branchCreatedAt,
  };
}

function getRunInputs(run: AgentRun): Record<string, unknown> | null {
  if (!run.inputs || typeof run.inputs !== "object") {
    return null;
  }
  if (Array.isArray(run.inputs)) {
    return null;
  }
  return run.inputs as Record<string, unknown>;
}

function getRunChatId(run: AgentRun): string | null {
  const inputs = getRunInputs(run);
  const chatId = getStringInput(inputs, "chatId");
  if (chatId && chatId.trim()) {
    return chatId;
  }
  return null;
}

function getStringInput(
  inputs: Record<string, unknown> | null,
  key: string,
): string | null {
  if (!inputs) {
    return null;
  }
  const raw = inputs[key];
  if (typeof raw === "string" && raw.trim()) {
    return raw;
  }
  return null;
}

function getNumberInput(
  inputs: Record<string, unknown> | null,
  key: string,
): number | null {
  if (!inputs) {
    return null;
  }
  const raw = inputs[key];
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw;
  }
  return null;
}

function getRunLastUpdatedMs(run: AgentRun): number {
  const eventTimestamps = (run.events ?? [])
    .map((event) => Date.parse(event.timestamp))
    .filter((value) => !Number.isNaN(value));
  if (eventTimestamps.length > 0) {
    return Math.max(...eventTimestamps);
  }
  const finishedAt = Date.parse(run.finishedAt ?? "");
  if (!Number.isNaN(finishedAt)) {
    return finishedAt;
  }
  const startedAt = Date.parse(run.startedAt ?? "");
  if (!Number.isNaN(startedAt)) {
    return startedAt;
  }
  return 0;
}
