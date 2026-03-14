import {
  buildChatSlashCommands,
  buildCustomPromptSlashCommandDefinitions,
  type ChatPermissionModeValue,
  type ChatSlashCommandDefinition,
} from "components/Chat/chatComposerControls";
import { type ChatRuntimeActivityDetails } from "components/Chat/ChatInput";
import {
  resolveAuthoritativeContextTelemetry,
  type ChatContextTelemetry,
} from "components/Chat/contextTelemetry";
import {
  getDefaultChatDetails,
  getExternalAgentChatHydrationOutcome,
  getLLMChatHydrationOutcome,
  getProjectChatHydrationOutcomeWithFallback,
  type ChatHydrationErrorCode,
  type ChatHydrationOutcome,
  type ChatHydrationOutcomeType,
} from "state/actions/ai/chatRuntime";
import type { ChatRunType } from "state/actions/chatHistory";
import type { ProjectChatCustomSlashCommand } from "state/definitions";
import { normalizeToolName } from "utils/claudeTools";
import {
  AgentRun,
  BaseChatMessageUnion,
  ChatRoleEnum,
  EngineTypeEnum,
  type ToolCall,
} from "utils/generatedTypes";
import type { ProjectChatThreadBlockedErrorCode } from "./projectChatHydrationAuthority";
import {
  buildReservedSlashCommandTokens,
  collectAgentNativeSlashCommandTokensFromEntries,
  isAgentRunsAuthorityReady,
  reconcileCustomSlashCommands,
  resolveAgentNativeSlashCommandsByEngineId,
  type AgentRunsAuthorityState,
} from "./projectChatSkillsMcpViewerUtils";

export type ProjectChatBlockedErrorCode =
  | ChatHydrationErrorCode
  | ProjectChatThreadBlockedErrorCode;

export function getDefaultProjectChatPermissionMode(
  engineType: EngineTypeEnum | null,
): ChatPermissionModeValue {
  if (engineType === EngineTypeEnum.external_agent) {
    return "config_toml_custom";
  }
  return "minimal";
}

export function getProjectChatBlockedReasonMessage(
  errorCode: ProjectChatBlockedErrorCode,
): string {
  if (errorCode === "llm_disallowed") {
    return "This deployment no longer allows LLM access for managed chat, so this thread cannot hydrate here.";
  }
  if (errorCode === "chat_not_found") {
    return "This thread was not found during hydration. You can still continue chatting from here.";
  }
  if (errorCode === "chat_provenance_missing") {
    return "This thread is missing provenance metadata. You can continue chatting, but prior hydration may be incomplete.";
  }
  if (errorCode === "chat_runtime_ambiguous") {
    return "This thread matches multiple chat runtimes, so hydration stopped before mixing state. Start a new thread or resolve the duplicate runtime data.";
  }
  if (errorCode === "engine_config_missing") {
    return "This thread's saved engine config is no longer available. You can continue chatting with the currently selected engine.";
  }
  if (errorCode === "engine_type_mismatch") {
    return "This thread's saved engine type no longer matches its provenance. You can continue chatting with the currently selected engine.";
  }
  if (errorCode === "llm_config_missing") {
    return "This thread's saved LLM config is unavailable. You can continue chatting after choosing any valid model.";
  }
  return "This thread hit a terminal hydration error. You can still continue chatting from the current state.";
}

export function buildProjectChatHydrationCacheKey({
  projectConfigId,
  chatId,
  hydrationRunType,
  hydrationMetadataRevision,
}: {
  projectConfigId: string;
  chatId: string | null | undefined;
  hydrationRunType: ChatRunType | null;
  hydrationMetadataRevision: string;
}): string | null {
  const normalizedProjectConfigId = projectConfigId.trim();
  const normalizedChatId = chatId?.trim() ?? "";
  if (!normalizedProjectConfigId || !normalizedChatId || !hydrationRunType) {
    return null;
  }
  const normalizedRevision = hydrationMetadataRevision.trim();
  if (!normalizedRevision) {
    return null;
  }
  return `${normalizedProjectConfigId}:${normalizedChatId}:${hydrationRunType}:${normalizedRevision}`;
}

export async function hydrateProjectChatFromRuntime({
  chatId,
  projectConfigId,
  hydrationRunType,
  shouldProbeMissingProvenance,
}: {
  chatId: string;
  projectConfigId: string;
  hydrationRunType: ChatRunType | null;
  shouldProbeMissingProvenance: boolean;
}): Promise<ChatHydrationOutcome> {
  const preferredHydrationRunType =
    hydrationRunType === "llm_chat" || hydrationRunType === "external_agent"
      ? hydrationRunType
      : null;
  if (shouldProbeMissingProvenance) {
    return getProjectChatHydrationOutcomeWithFallback(
      chatId,
      projectConfigId,
      preferredHydrationRunType,
    );
  }
  if (hydrationRunType === "external_agent") {
    return getExternalAgentChatHydrationOutcome(chatId, projectConfigId);
  }
  return getLLMChatHydrationOutcome(chatId);
}

export function resolveProjectChatComposerNativeSlashCommandTokens({
  runtimeNativeSlashCommandTokens,
  agentRunsAuthorityState,
}: {
  runtimeNativeSlashCommandTokens: string[];
  agentRunsAuthorityState: AgentRunsAuthorityState;
}): string[] {
  if (isAgentRunsAuthorityReady(agentRunsAuthorityState)) {
    return runtimeNativeSlashCommandTokens;
  }
  return [];
}

export function resolveProjectChatComposerExecutableNativeSlashCommandTokens({
  runtimeNativeSlashCommandTokens,
  agentRunsAuthorityState,
}: {
  runtimeNativeSlashCommandTokens: string[];
  agentRunsAuthorityState: AgentRunsAuthorityState;
}): string[] {
  if (!isAgentRunsAuthorityReady(agentRunsAuthorityState)) {
    return [];
  }
  return runtimeNativeSlashCommandTokens;
}

export function resolveProjectChatRuntimeNativeSlashCommandTokens({
  runs,
  projectConfigId,
  engineConfigId,
  engineType,
}: {
  runs: AgentRun[];
  projectConfigId: string;
  engineConfigId: string | null;
  engineType: EngineTypeEnum | null;
}): string[] {
  if (
    engineType !== EngineTypeEnum.external_agent ||
    typeof engineConfigId !== "string" ||
    engineConfigId.trim() === ""
  ) {
    return [];
  }
  return collectAgentNativeSlashCommandTokensFromEntries(
    resolveAgentNativeSlashCommandsByEngineId({
      runs,
      projectConfigId,
      engineConfigIds: [engineConfigId],
    }),
  );
}

export function resolveProjectChatComposerSlashCommandSets({
  customProjectChatSlashCommands,
  discoveredAgentNativeSlashCommands,
  executableAgentNativeSlashCommands = discoveredAgentNativeSlashCommands,
  customCommandsExecutable = true,
  customCommandUnavailableFeedback = null,
  showPermissionExecutionControl,
  showSearchExecutionControl,
}: {
  customProjectChatSlashCommands: ProjectChatCustomSlashCommand[];
  discoveredAgentNativeSlashCommands: string[];
  executableAgentNativeSlashCommands?: string[];
  customCommandsExecutable?: boolean;
  customCommandUnavailableFeedback?: string | null;
  showPermissionExecutionControl: boolean;
  showSearchExecutionControl: boolean;
}): {
  slashCommands: ChatSlashCommandDefinition[];
  recognizedSlashCommands: ChatSlashCommandDefinition[];
} {
  const managedCommands = buildChatSlashCommands({
    model: true,
    permissions: showPermissionExecutionControl,
    search: showSearchExecutionControl,
    appGenerationModes: true,
  });
  const globallyReservedManagedCommands = buildChatSlashCommands({
    model: true,
    permissions: true,
    search: true,
    appGenerationModes: true,
  });
  const customCommandDefinitions = buildCustomPromptSlashCommandDefinitions(
    customProjectChatSlashCommands,
  );
  const reservedCommandSet = buildReservedSlashCommandTokens({
    managedCommands: globallyReservedManagedCommands,
    engineCommandGroups: [],
    discoveredNativeSlashCommands: discoveredAgentNativeSlashCommands,
  });
  const { executableCommands: customCommands } = reconcileCustomSlashCommands({
    customCommands: customCommandDefinitions,
    reservedTokens: reservedCommandSet,
  });
  const nativeCommands: ChatSlashCommandDefinition[] = [];
  const recognizedCommands: ChatSlashCommandDefinition[] = [
    ...globallyReservedManagedCommands,
  ];
  const recognizedCustomCommands = customCommandsExecutable
    ? customCommandDefinitions
    : customCommandDefinitions.map((command) => ({
        ...command,
        unavailableFeedback:
          customCommandUnavailableFeedback ??
          `${command.command} is unavailable in the current context. Use /help.`,
      }));
  const globallyReservedManagedCommandTokens = new Set(
    globallyReservedManagedCommands.map((entry) => entry.command),
  );
  const nativeCommandTokens = new Set<string>();
  const recognizedCommandTokens = new Set(
    recognizedCommands.map((entry) => entry.command),
  );
  for (const token of discoveredAgentNativeSlashCommands) {
    if (recognizedCommandTokens.has(token)) {
      continue;
    }
    recognizedCommandTokens.add(token);
    recognizedCommands.push({
      command: token,
      action: "native_prompt",
      summary: "Submit this native external-agent command verbatim.",
    });
  }
  for (const token of executableAgentNativeSlashCommands) {
    if (
      nativeCommandTokens.has(token) ||
      globallyReservedManagedCommandTokens.has(token)
    ) {
      continue;
    }
    nativeCommandTokens.add(token);
    nativeCommands.push({
      command: token,
      action: "native_prompt",
      summary: "Submit this native external-agent command verbatim.",
    });
  }
  for (const customCommand of recognizedCustomCommands) {
    if (recognizedCommandTokens.has(customCommand.command)) {
      continue;
    }
    recognizedCommandTokens.add(customCommand.command);
    recognizedCommands.push(customCommand);
  }
  return {
    slashCommands: [
      ...managedCommands,
      ...nativeCommands,
      ...(customCommandsExecutable ? customCommands : []),
    ],
    recognizedSlashCommands: recognizedCommands,
  };
}

export type ProjectChatHydrationRetryStatus =
  | "in_flight"
  | "succeeded"
  | "failed"
  | "retry_scheduled"
  | "terminal_failure";

export type ProjectChatHydrationRetryEntry = {
  status: ProjectChatHydrationRetryStatus;
  timerId: ReturnType<typeof setTimeout> | null;
  attempt: number;
  lastTouchedAt: number;
};

const PROJECT_CHAT_HYDRATION_RETRY_BASE_DELAY_MS = 1000;
const PROJECT_CHAT_HYDRATION_RETRY_MAX_DELAY_MS = 30000;
export const PROJECT_CHAT_HYDRATION_MAX_ATTEMPTS = 6;
const PROJECT_CHAT_HYDRATION_MAX_CACHE_ENTRIES = 300;

type ProjectChatHydrationRetryDecision =
  | { type: "success" }
  | { type: "terminal_failure" }
  | {
      type: "transient_retry";
      nextAttempt: number;
      delayMs: number;
    }
  | {
      type: "transient_exhausted";
      nextAttempt: number;
    };

export function resolveProjectChatHydrationRetryDelayMs(
  attempt: number,
): number {
  const normalizedAttempt = Math.max(1, attempt);
  const exponentialDelayMs =
    PROJECT_CHAT_HYDRATION_RETRY_BASE_DELAY_MS * 2 ** (normalizedAttempt - 1);
  return Math.min(
    PROJECT_CHAT_HYDRATION_RETRY_MAX_DELAY_MS,
    exponentialDelayMs,
  );
}

export function resolveProjectChatHydrationRetryDecision({
  outcomeType,
  attempt,
}: {
  outcomeType: ChatHydrationOutcomeType;
  attempt: number;
}): ProjectChatHydrationRetryDecision {
  if (outcomeType === "success") {
    return { type: "success" };
  }
  if (outcomeType === "terminal_failure") {
    return { type: "terminal_failure" };
  }
  const nextAttempt = attempt + 1;
  if (nextAttempt > PROJECT_CHAT_HYDRATION_MAX_ATTEMPTS) {
    return {
      type: "transient_exhausted",
      nextAttempt,
    };
  }
  return {
    type: "transient_retry",
    nextAttempt,
    delayMs: resolveProjectChatHydrationRetryDelayMs(nextAttempt),
  };
}

export function shouldSkipProjectChatHydration(
  state: {
    status: ProjectChatHydrationRetryStatus;
    hasLiveRetryTimer: boolean;
  } | null,
): boolean {
  if (!state) {
    return false;
  }
  if (state.status === "in_flight" || state.status === "succeeded") {
    return true;
  }
  if (state.status === "terminal_failure") {
    return true;
  }
  return state.status === "retry_scheduled" && state.hasLiveRetryTimer;
}

function buildProjectChatHydrationRouteKeyPrefix({
  projectConfigId,
  chatId,
}: {
  projectConfigId: string;
  chatId: string;
}): string | null {
  const normalizedProjectConfigId = projectConfigId.trim();
  const normalizedChatId = chatId.trim();
  if (!normalizedProjectConfigId || !normalizedChatId) {
    return null;
  }
  return `${normalizedProjectConfigId}:${normalizedChatId}:`;
}

export function clearProjectChatHydrationCacheEntriesForChat({
  cache,
  projectConfigId,
  chatId,
  keepCacheKey,
}: {
  cache: Record<string, ProjectChatHydrationRetryEntry>;
  projectConfigId: string;
  chatId: string;
  keepCacheKey: string | null;
}): string[] {
  const keyPrefix = buildProjectChatHydrationRouteKeyPrefix({
    projectConfigId,
    chatId,
  });
  if (!keyPrefix) {
    return [];
  }
  const removedCacheKeys: string[] = [];
  for (const cacheKey of Object.keys(cache)) {
    if (!cacheKey.startsWith(keyPrefix)) {
      continue;
    }
    if (keepCacheKey !== null && cacheKey === keepCacheKey) {
      continue;
    }
    removedCacheKeys.push(cacheKey);
  }
  return removedCacheKeys;
}

export function touchProjectChatHydrationRetryEntry(
  entry: ProjectChatHydrationRetryEntry,
): void {
  entry.lastTouchedAt = Date.now();
}

export function trimProjectChatHydrationCache({
  cache,
  maxEntries = PROJECT_CHAT_HYDRATION_MAX_CACHE_ENTRIES,
}: {
  cache: Record<string, ProjectChatHydrationRetryEntry>;
  maxEntries?: number;
}): string[] {
  const cacheKeys = Object.keys(cache);
  if (cacheKeys.length <= maxEntries) {
    return [];
  }
  const removableEntries = cacheKeys
    .filter((cacheKey) => cache[cacheKey]?.timerId === null)
    .sort((leftKey, rightKey) => {
      const leftEntry = cache[leftKey];
      const rightEntry = cache[rightKey];
      const leftLastTouchedAt = leftEntry?.lastTouchedAt ?? 0;
      const rightLastTouchedAt = rightEntry?.lastTouchedAt ?? 0;
      return leftLastTouchedAt - rightLastTouchedAt;
    });
  const overflowCount = cacheKeys.length - maxEntries;
  const removedCacheKeys: string[] = [];
  for (let index = 0; index < removableEntries.length; index += 1) {
    if (removedCacheKeys.length >= overflowCount) {
      break;
    }
    const cacheKey = removableEntries[index];
    if (cache[cacheKey] === undefined) {
      continue;
    }
    delete cache[cacheKey];
    removedCacheKeys.push(cacheKey);
  }
  return removedCacheKeys;
}

type ProjectChatContextUsage = ReturnType<
  typeof getDefaultChatDetails
>["contextUsage"];

type ProjectChatContextTelemetry = ChatContextTelemetry;

export function resolveProjectChatContextTelemetry(
  contextUsage: ProjectChatContextUsage,
): ProjectChatContextTelemetry {
  return resolveAuthoritativeContextTelemetry(contextUsage);
}

const WORKSPACE_ROOT_FAST_POLL_MS = 5000;
const WORKSPACE_ROOT_BACKOFF_POLL_MS = 30000;
const WORKSPACE_ROOT_STABLE_POLLS_BEFORE_BACKOFF = 2;

export function resolveWorkspaceRootPollDelayMs(
  stablePollCount: number,
): number {
  if (stablePollCount >= WORKSPACE_ROOT_STABLE_POLLS_BEFORE_BACKOFF) {
    return WORKSPACE_ROOT_BACKOFF_POLL_MS;
  }
  return WORKSPACE_ROOT_FAST_POLL_MS;
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

export function resolveProjectChatProviderDictationTranscribeEnabled({
  providerDictationAvailable,
}: {
  providerDictationAvailable: boolean;
}): boolean {
  return providerDictationAvailable;
}
