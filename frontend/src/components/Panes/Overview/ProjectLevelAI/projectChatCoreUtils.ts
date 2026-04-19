import {
  buildChatSlashCommands,
  buildCustomPromptSlashCommandDefinitions,
  type ChatPermissionModeValue,
  type ChatSlashCommandDefinition,
} from "components/Chat/chatComposerControls";
import {
  type ChatRuntimeActivityDetails,
  type ChatSubmitDispatchResult,
  type ChatSubmitOptions,
} from "components/Chat/ChatInput";
import {
  resolveAuthoritativeContextTelemetry,
  type ChatContextTelemetry,
} from "components/Chat/contextTelemetry";
import {
  getRunInputString,
  getRunLastUpdatedMs,
} from "state/actions/agentRunUtils";
import {
  getDefaultChatDetails,
  getExternalAgentChatHydrationOutcome,
  getLLMChatHydrationOutcome,
  type ChatHydrationErrorCode,
  type ChatHydrationOutcome,
  type ChatHydrationOutcomeType,
} from "state/actions/ai";
import {
  buildChatHistoryEntries,
  type ChatHistoryCompatibility,
  type ChatRunType,
} from "state/actions/chatHistory";
import { type ProjectChatCustomSlashCommand } from "state/definitions";
import {
  type ChatAppGenerationContext,
  type ChatAppGenerationMessageState,
} from "state/utils/chatAppGeneration";
import { isImageAttachment } from "utils/attachmentPreview";
import { normalizeToolName } from "utils/claudeTools";
import {
  buildSearchableTextForMessage,
  matchesConversationSearchText,
} from "utils/conversationSearch";
import {
  AgentRun,
  AppGenerationModeEnum,
  BaseChatMessageUnion,
  ChatFileAttachment,
  ChatRoleEnum,
  EngineTypeEnum,
  type ToolCall,
} from "utils/generatedTypes";
import { type ProjectChatThreadBlockedErrorCode } from "./projectChatHydrationAuthority";
import {
  buildReservedSlashCommandTokens,
  collectAgentNativeSlashCommandTokensFromEntries,
  isAgentRunsAuthorityReady,
  reconcileCustomSlashCommands,
  resolveAgentNativeSlashCommandsByEngineId,
  type AgentRunsAuthorityState,
} from "./projectChatSkillsMcpViewerUtils";

export const CUSTOM_SLASH_COMMAND_AUTHORITY_LOADING_FEEDBACK =
  "Custom slash commands are unavailable until native command authority is loaded for this project.";
export const NATIVE_SLASH_COMMANDS_RELOAD_FEEDBACK =
  "Native slash commands are unavailable until agent metadata reloads.";

export type ProjectChatBlockedErrorCode =
  | ChatHydrationErrorCode
  | ProjectChatThreadBlockedErrorCode;

type ProjectChatHistoryEntry = ReturnType<
  typeof buildChatHistoryEntries
>[number];

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
}: {
  chatId: string;
  projectConfigId: string;
  hydrationRunType: ChatRunType | null;
}): Promise<ChatHydrationOutcome> {
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

function buildProjectChatNativePromptSlashCommand(
  command: string,
): ChatSlashCommandDefinition {
  return {
    command,
    action: "native_prompt",
    appGenerationMode: null,
    summary: "Submit this native external-agent command verbatim.",
  };
}

function resolveProjectChatRecognizedCustomSlashCommands({
  customCommandDefinitions,
  customCommandsExecutable,
  customCommandUnavailableFeedback,
}: {
  customCommandDefinitions: ChatSlashCommandDefinition[];
  customCommandsExecutable: boolean;
  customCommandUnavailableFeedback: string | null;
}): ChatSlashCommandDefinition[] {
  if (customCommandsExecutable) {
    return customCommandDefinitions;
  }
  return customCommandDefinitions.map((command) => ({
    ...command,
    unavailableFeedback:
      customCommandUnavailableFeedback ??
      `${command.command} is unavailable in the current context. Use /help.`,
  }));
}

function appendUniqueSlashCommands({
  target,
  seenCommandTokens,
  commands,
}: {
  target: ChatSlashCommandDefinition[];
  seenCommandTokens: Set<string>;
  commands: ChatSlashCommandDefinition[];
}): void {
  for (const command of commands) {
    if (seenCommandTokens.has(command.command)) {
      continue;
    }
    seenCommandTokens.add(command.command);
    target.push(command);
  }
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
  const recognizedCommands: ChatSlashCommandDefinition[] = [
    ...globallyReservedManagedCommands,
  ];
  const recognizedCommandTokens = new Set(
    recognizedCommands.map((entry) => entry.command),
  );
  appendUniqueSlashCommands({
    target: recognizedCommands,
    seenCommandTokens: recognizedCommandTokens,
    commands: discoveredAgentNativeSlashCommands.map(
      buildProjectChatNativePromptSlashCommand,
    ),
  });
  appendUniqueSlashCommands({
    target: recognizedCommands,
    seenCommandTokens: recognizedCommandTokens,
    commands: resolveProjectChatRecognizedCustomSlashCommands({
      customCommandDefinitions,
      customCommandsExecutable,
      customCommandUnavailableFeedback,
    }),
  });
  const nativeCommands: ChatSlashCommandDefinition[] = [];
  const executableCommandTokens = new Set(
    globallyReservedManagedCommands.map((entry) => entry.command),
  );
  appendUniqueSlashCommands({
    target: nativeCommands,
    seenCommandTokens: executableCommandTokens,
    commands: executableAgentNativeSlashCommands.map(
      buildProjectChatNativePromptSlashCommand,
    ),
  });
  return {
    slashCommands: [
      ...managedCommands,
      ...nativeCommands,
      ...(customCommandsExecutable ? customCommands : []),
    ],
    recognizedSlashCommands: recognizedCommands,
  };
}

type ProjectChatHydrationRetryStatus =
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
const PROJECT_CHAT_HYDRATION_MAX_ATTEMPTS = 6;
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

function resolveProjectChatHydrationRetryDelayMs(attempt: number): number {
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

export function resolveProjectChatSubmitAppGeneration({
  activeAppGeneration,
  options,
}: {
  activeAppGeneration: ChatAppGenerationContext | null;
  options?: ChatSubmitOptions;
}): ChatAppGenerationContext | null {
  if (
    !options ||
    !Object.prototype.hasOwnProperty.call(options, "appGeneration")
  ) {
    return activeAppGeneration;
  }
  return options.appGeneration ?? null;
}

export function buildProjectChatSubmitReadinessKey({
  engineConfigId,
  externalEngineAvailable,
  hasLLMConfig,
  isExternalEngine,
  requiresNewThreadContinuation,
}: {
  engineConfigId: string | null;
  externalEngineAvailable: boolean;
  hasLLMConfig: boolean;
  isExternalEngine: boolean;
  requiresNewThreadContinuation: boolean;
}): string {
  return JSON.stringify({
    engineConfigId: engineConfigId?.trim() || null,
    externalEngineAvailable,
    hasLLMConfig,
    isExternalEngine,
    requiresNewThreadContinuation,
  });
}

type ProjectChatEngineAvailabilityInput = {
  engineConfigId: string | null;
  externalEngineAvailable: boolean;
  hasLLMConfig: boolean;
  isExternalEngine: boolean;
};

function isProjectChatEngineAvailable({
  engineConfigId,
  externalEngineAvailable,
  hasLLMConfig,
  isExternalEngine,
}: ProjectChatEngineAvailabilityInput): boolean {
  if (!engineConfigId) {
    return false;
  }
  return isExternalEngine ? externalEngineAvailable : hasLLMConfig;
}

type ResolveProjectChatRedoTargetInput = ProjectChatEngineAvailabilityInput & {
  chatId: string | null | undefined;
  lastChatId: string | null;
  waitingForResponse: boolean;
  requiresNewThreadContinuation: boolean;
};

export function resolveProjectChatRedoTarget({
  chatId,
  lastChatId,
  waitingForResponse,
  requiresNewThreadContinuation,
  ...engineAvailability
}: ResolveProjectChatRedoTargetInput): { resolvedChatId: string } | null {
  const resolvedChatId = typeof chatId === "string" ? chatId : lastChatId;
  if (!resolvedChatId || waitingForResponse || requiresNewThreadContinuation) {
    return null;
  }
  return isProjectChatEngineAvailable(engineAvailability)
    ? { resolvedChatId }
    : null;
}

export function resolveProjectChatSubmitPreflightResult({
  attachments,
  engineConfigId,
  externalEngineAvailable,
  hasLLMConfig,
  isExternalEngine,
  message,
  requiresNewThreadContinuation,
}: {
  attachments: ChatFileAttachment[];
  engineConfigId: string | null;
  externalEngineAvailable: boolean;
  hasLLMConfig: boolean;
  isExternalEngine: boolean;
  message: string;
  requiresNewThreadContinuation: boolean;
}): ChatSubmitDispatchResult | null {
  const trimmed = message.trim();
  if (!trimmed && attachments.length === 0) {
    return "failed";
  }
  if (requiresNewThreadContinuation) {
    return "failed";
  }
  if (
    !isProjectChatEngineAvailable({
      engineConfigId,
      externalEngineAvailable,
      hasLLMConfig,
      isExternalEngine,
    })
  ) {
    return "retry_later";
  }
  return null;
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

function collectCompletedProjectChatToolCallIds(
  messages: Array<BaseChatMessageUnion>,
): Set<string> {
  const completedToolCallIds = new Set<string>();
  for (const message of messages) {
    if (message.role === ChatRoleEnum.tool && message.tool_call_id) {
      completedToolCallIds.add(message.tool_call_id);
    }
  }
  return completedToolCallIds;
}

function collectActiveProjectChatRuntimeActivityDetails({
  toolCalls,
  completedToolCallIds,
}: {
  toolCalls: ToolCall[];
  completedToolCallIds: Set<string>;
}): ProjectChatRuntimeActivityDetails {
  const details: ProjectChatRuntimeActivityDetails = {
    activeBackgroundTerminals: [],
    activeSubagents: [],
  };
  for (const toolCall of toolCalls) {
    if (completedToolCallIds.has(toolCall.id)) {
      continue;
    }
    const runtimeActivityEntry =
      resolveProjectChatRuntimeActivityEntry(toolCall);
    if (!runtimeActivityEntry) {
      continue;
    }
    const targetEntries =
      runtimeActivityEntry.category === "background_terminal"
        ? details.activeBackgroundTerminals
        : details.activeSubagents;
    targetEntries.push(runtimeActivityEntry.entry);
  }
  return details;
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
  return collectActiveProjectChatRuntimeActivityDetails({
    toolCalls: streamingAssistantMessage.tool_calls ?? [],
    completedToolCallIds: collectCompletedProjectChatToolCallIds(messages),
  });
}

export function resolveProjectChatProviderDictationTranscribeEnabled({
  providerDictationAvailable,
}: {
  providerDictationAvailable: boolean;
}): boolean {
  return providerDictationAvailable;
}

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

type LatestRunByChat = {
  run: AgentRun;
  lastUpdatedMs: number;
};

function isProjectChatRunType(runType: string | null): boolean {
  return (
    runType === "llm_chat" ||
    runType === "external_agent" ||
    runType === "scriptable_chat"
  );
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

export function extractUserPromptText(
  message: BaseChatMessageUnion,
): string | null {
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
      appGenerationByMessageId[message.id]?.mode !==
      AppGenerationModeEnum.json_render_with_image
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
