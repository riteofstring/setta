import { appSubsystemModeRequiresImageAttachment } from "plugins/appSubsystem";

import {
  getRunInputString,
  getRunLastUpdatedMs,
} from "state/actions/agentRunUtils";

import { type ChatAppGenerationMessageState } from "state/utils/chatAppGeneration";

import { isImageAttachment } from "utils/attachmentPreview";

import {
  buildSearchableTextForMessage,
  matchesConversationSearchText,
} from "utils/conversationSearch";

import {
  AgentRun,
  BaseChatMessageUnion,
  ChatFileAttachment,
  ChatRoleEnum,
} from "utils/generatedTypes";

import {
  LatestRunByChat,
  extractUserPromptText,
  getRunMessages,
  isProjectChatRunType,
} from "./composerCommands";

export function getMessageAttachments(
  message: BaseChatMessageUnion,
): Array<ChatFileAttachment> {
  if ("attachments" in message && Array.isArray(message.attachments)) {
    return message.attachments;
  }
  return [];
}

export function hasRetainedImageAttachmentFromImageModeThread(
  messages: Array<BaseChatMessageUnion>,
  appGenerationByMessageId: Record<string, ChatAppGenerationMessageState>,
): boolean {
  return messages.some((message) => {
    if (message.role !== ChatRoleEnum.user) {
      return false;
    }
    if (
      !appSubsystemModeRequiresImageAttachment(
        appGenerationByMessageId[message.id]?.mode,
      )
    ) {
      return false;
    }
    return getMessageAttachments(message).some((attachment) =>
      isImageAttachment(attachment),
    );
  });
}

export function findBranchSourceUserMessage(
  messages: Array<BaseChatMessageUnion>,
  assistantMessageId: string,
): BaseChatMessageUnion | null {
  const assistantIndex = messages.findIndex(
    (message) =>
      message.id === assistantMessageId &&
      message.role === ChatRoleEnum.assistant,
  );
  if (assistantIndex < 0) {
    return null;
  }
  for (let index = assistantIndex - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || message.role !== ChatRoleEnum.user) {
      continue;
    }
    return message;
  }
  return null;
}

export function collectUserPrompts(
  messages: Array<BaseChatMessageUnion>,
): Array<string> {
  const prompts: string[] = [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message) {
      continue;
    }
    const prompt = extractUserPromptText(message);
    if (!prompt) {
      continue;
    }
    prompts.push(prompt);
  }
  return prompts;
}

export function filterProjectConversationMessagesBySearch({
  messages,
  normalizedSearchTerms,
}: {
  messages: Array<BaseChatMessageUnion>;
  normalizedSearchTerms: Array<string>;
}): Array<BaseChatMessageUnion> {
  if (normalizedSearchTerms.length === 0) {
    return messages;
  }
  return messages.filter((message) =>
    matchesConversationSearchText(
      buildSearchableTextForMessage(message),
      normalizedSearchTerms,
    ),
  );
}

export function appendUniquePrompts(
  prompts: Array<string>,
  seen: Set<string>,
  incoming: Array<string>,
): void {
  for (const prompt of incoming) {
    const trimmed = prompt.trim();
    if (!trimmed) {
      continue;
    }
    if (seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    prompts.push(trimmed);
  }
}

export function buildProjectChatSubmittedMessageHistory({
  runs,
  projectConfigId,
  activeMessages,
}: {
  runs: Array<AgentRun>;
  projectConfigId: string;
  activeMessages: Array<BaseChatMessageUnion>;
}): Array<string> {
  const candidateRuns = runs.filter(
    (run) => getRunInputString(run, "projectConfigId") === projectConfigId,
  );
  const latestRunByChatId = new Map<string, LatestRunByChat>();

  for (const run of candidateRuns) {
    const runType = getRunInputString(run, "runType");
    if (!isProjectChatRunType(runType)) {
      continue;
    }
    if (getRunInputString(run, "sectionId") !== null) {
      continue;
    }
    const runChatId = getRunInputString(run, "chatId");
    if (!runChatId) {
      continue;
    }
    const lastUpdatedMs = getRunLastUpdatedMs(run);
    const existing = latestRunByChatId.get(runChatId);
    if (!existing || lastUpdatedMs > existing.lastUpdatedMs) {
      latestRunByChatId.set(runChatId, { run, lastUpdatedMs });
    }
  }

  const sortedRuns = [...latestRunByChatId.values()]
    .sort((left, right) => right.lastUpdatedMs - left.lastUpdatedMs)
    .map((entry) => entry.run);
  const prompts: string[] = [];
  const seenPrompts = new Set<string>();

  appendUniquePrompts(prompts, seenPrompts, collectUserPrompts(activeMessages));
  for (const run of sortedRuns) {
    appendUniquePrompts(
      prompts,
      seenPrompts,
      collectUserPrompts(getRunMessages(run)),
    );
  }

  return prompts;
}
