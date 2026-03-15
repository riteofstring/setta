import { type ChatRuntimeActivityDetails } from "components/Chat/ChatInput";
import {
  resolveAuthoritativeContextTelemetry,
  type ChatContextTelemetry,
} from "components/Chat/contextTelemetry";
import {
  getRunInputString,
  getRunLastUpdatedMs,
} from "state/actions/agentRunUtils";
import { buildChatHistoryEntries } from "state/actions/chatHistoryEntries";
import type { ChatHistoryCompatibility } from "state/actions/chatHistoryTypes";
import type { ChatAppGenerationMessageState } from "state/utils/chatAppGenerationDetails";
import { isImageAttachment } from "utils/attachmentPreview";
import { normalizeToolName } from "utils/claudeTools";
import {
  buildSearchableTextForMessage,
  matchesConversationSearchText,
} from "utils/conversationSearch";
import {
  AgentRun,
  BaseChatMessageUnion,
  ChatFileAttachment,
  ChatRoleEnum,
  type ToolCall,
} from "utils/generatedTypes";

type ProjectChatContextUsage = ReturnType<
  typeof import("state/actions/aiChatDetails").getDefaultChatDetails
>["contextUsage"];

export type ProjectChatContextTelemetry = ChatContextTelemetry;

export function resolveProjectChatContextTelemetry(
  contextUsage: ProjectChatContextUsage,
): ProjectChatContextTelemetry {
  return resolveAuthoritativeContextTelemetry(contextUsage);
}

type ProjectChatRuntimeActivityEntry =
  ChatRuntimeActivityDetails["activeBackgroundTerminals"][number];

type ProjectChatRuntimeActivityDetails = ChatRuntimeActivityDetails;

const EMPTY_PROJECT_CHAT_RUNTIME_ACTIVITY_DETAILS: ProjectChatRuntimeActivityDetails =
  {
    activeBackgroundTerminals: [],
    activeSubagents: [],
  };
const ACTIVE_BACKGROUND_TERMINAL_TOOL_IDS = new Set<string>([
  "command_execution",
]);
const ACTIVE_SUBAGENT_TOOL_IDS = new Set<string>([
  "setta__run_agent_profile",
  "run_agent_profile",
]);

function resolveToolRuntimeCategory(
  toolName: string,
): "background_terminal" | "subagent" | null {
  const normalizedToolName = normalizeToolName(toolName);
  if (!normalizedToolName) {
    return null;
  }
  const lowerCaseToolName = normalizedToolName.toLowerCase();
  if (ACTIVE_BACKGROUND_TERMINAL_TOOL_IDS.has(lowerCaseToolName)) {
    return "background_terminal";
  }
  if (ACTIVE_SUBAGENT_TOOL_IDS.has(lowerCaseToolName)) {
    return "subagent";
  }
  return null;
}

function resolveStreamingAssistantMessage(
  messages: Array<BaseChatMessageUnion>,
): Extract<BaseChatMessageUnion, { role: ChatRoleEnum.assistant }> | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === ChatRoleEnum.assistant) {
      return message;
    }
  }
  return null;
}

function resolveRuntimeActivityEntryLabel(
  toolCall: ToolCall,
  normalizedToolName: string,
): string {
  const normalizedName = normalizedToolName.toLowerCase();
  const argumentsByName = toolCall.function.arguments;
  if (normalizedName === "command_execution") {
    const commandValue = argumentsByName?.command;
    if (typeof commandValue === "string" && commandValue.trim().length > 0) {
      return commandValue.trim();
    }
  }
  if (ACTIVE_SUBAGENT_TOOL_IDS.has(normalizedName)) {
    const profileIdValue = argumentsByName?.profileId;
    if (
      typeof profileIdValue === "string" &&
      profileIdValue.trim().length > 0
    ) {
      return profileIdValue.trim();
    }
  }
  return `${normalizedToolName} (${toolCall.id})`;
}

function resolveProjectChatRuntimeActivityEntry(toolCall: ToolCall): {
  category: "background_terminal" | "subagent";
  entry: ProjectChatRuntimeActivityEntry;
} | null {
  const normalizedToolName = normalizeToolName(toolCall.function?.name ?? "");
  const category = resolveToolRuntimeCategory(normalizedToolName);
  if (!category || !normalizedToolName) {
    return null;
  }
  return {
    category,
    entry: {
      id: toolCall.id,
      label: resolveRuntimeActivityEntryLabel(toolCall, normalizedToolName),
      toolName: normalizedToolName,
    },
  };
}

export function resolveProjectChatRuntimeActivityDetails({
  messages,
  waitingForResponse,
}: {
  messages: Array<BaseChatMessageUnion>;
  waitingForResponse: boolean;
}): ProjectChatRuntimeActivityDetails {
  if (!waitingForResponse) {
    return EMPTY_PROJECT_CHAT_RUNTIME_ACTIVITY_DETAILS;
  }
  const streamingAssistantMessage = resolveStreamingAssistantMessage(messages);
  if (!streamingAssistantMessage) {
    return EMPTY_PROJECT_CHAT_RUNTIME_ACTIVITY_DETAILS;
  }
  const completedToolCallIds = new Set<string>();
  for (const message of messages) {
    if (message.role !== ChatRoleEnum.tool) {
      continue;
    }
    const toolCallId = message.tool_call_id;
    if (!toolCallId) {
      continue;
    }
    completedToolCallIds.add(toolCallId);
  }
  const activeBackgroundTerminals: Array<ProjectChatRuntimeActivityEntry> = [];
  const activeSubagents: Array<ProjectChatRuntimeActivityEntry> = [];
  const toolCalls = streamingAssistantMessage.tool_calls ?? [];
  for (const toolCall of toolCalls) {
    if (completedToolCallIds.has(toolCall.id)) {
      continue;
    }
    const runtimeActivityEntry =
      resolveProjectChatRuntimeActivityEntry(toolCall);
    if (!runtimeActivityEntry) {
      continue;
    }
    if (runtimeActivityEntry.category === "background_terminal") {
      activeBackgroundTerminals.push(runtimeActivityEntry.entry);
      continue;
    }
    if (runtimeActivityEntry.category === "subagent") {
      activeSubagents.push(runtimeActivityEntry.entry);
    }
  }
  return {
    activeBackgroundTerminals,
    activeSubagents,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getRunMessages(run: AgentRun): Array<BaseChatMessageUnion> {
  const outputs = isRecord(run.outputs) ? run.outputs : null;
  const outputMessages = outputs ? outputs.messages : null;
  if (Array.isArray(outputMessages)) {
    return outputMessages as Array<BaseChatMessageUnion>;
  }
  const inputs = isRecord(run.inputs) ? run.inputs : null;
  const inputMessages = inputs ? inputs.messages : null;
  if (Array.isArray(inputMessages)) {
    return inputMessages as Array<BaseChatMessageUnion>;
  }
  return [];
}

function extractUserPromptText(message: BaseChatMessageUnion): string | null {
  if (message.role !== ChatRoleEnum.user) {
    return null;
  }
  if (!Array.isArray(message.content)) {
    return null;
  }
  const textParts: string[] = [];
  for (const block of message.content) {
    if (!isRecord(block)) {
      continue;
    }
    if (block.type !== "text") {
      continue;
    }
    const text = block.text;
    if (typeof text !== "string") {
      continue;
    }
    const trimmed = text.trim();
    if (!trimmed) {
      continue;
    }
    textParts.push(trimmed);
  }
  if (textParts.length === 0) {
    return null;
  }
  return textParts.join("\n");
}

function getMessageAttachments(
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
      appGenerationByMessageId[message.id]?.mode !== "json_render_with_image"
    ) {
      return false;
    }
    return getMessageAttachments(message).some((attachment) =>
      isImageAttachment(attachment),
    );
  });
}

function isProjectChatRunType(runType: string | null): boolean {
  return (
    runType === "llm_chat" ||
    runType === "external_agent" ||
    runType === "scriptable_chat"
  );
}

type LatestRunByChat = {
  run: AgentRun;
  lastUpdatedMs: number;
};

function collectUserPrompts(
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

function appendUniquePrompts(
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

type ProjectChatHistoryEntry = ReturnType<
  typeof buildChatHistoryEntries
>[number];

export function toSortedProjectHistoryEntries(
  runs: Array<AgentRun>,
  projectConfigId: string,
  compatibility: ChatHistoryCompatibility | null,
): Array<ProjectChatHistoryEntry> {
  return buildChatHistoryEntries(runs, {
    projectConfigId,
    unscopedOnly: true,
    compatibility,
  }).sort((left, right) => right.lastUpdatedMs - left.lastUpdatedMs);
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

export function getProjectChatMessageAttachments(
  message: BaseChatMessageUnion,
): Array<ChatFileAttachment> {
  return getMessageAttachments(message);
}

export function extractProjectChatUserPromptText(
  message: BaseChatMessageUnion,
): string | null {
  return extractUserPromptText(message);
}
