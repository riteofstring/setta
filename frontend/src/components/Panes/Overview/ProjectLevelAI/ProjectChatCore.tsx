import {
  CHAT_STARTER_PROMPTS,
  buildChatSlashCommands,
  createManagedExecutionControlHandlers,
  executeManagedChatSlashCommand,
  type ChatPermissionModeValue,
  type ChatStarterPrompt,
  type ManagedChatExecutionSettings,
} from "components/Chat/chatComposerControls";
import { getChatEditDisabledReason } from "components/Chat/chatEditUtils";
import {
  ChatInput,
  type ChatSlashCommand,
  type ChatSlashCommandResult,
} from "components/Chat/ChatInput";
import { ChatMessageList } from "components/Chat/ChatMessages";
import {
  resolveAuthoritativeContextTelemetry,
  type ChatContextTelemetry,
} from "components/Chat/contextTelemetry";
import {
  Dispatch,
  SetStateAction,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  getRunInputString,
  getRunLastUpdatedMs,
} from "state/actions/agentRunUtils";
import {
  clearPendingChatDetails,
  finalizePendingChatDetails,
  getDefaultChatDetails,
  getExternalAgentChatHydrationOutcome,
  getLLMChatHydrationOutcome,
  initializePendingChatDetails,
  loadAgentRuns,
  stopProjectChatResponse,
  submitEditedMessage,
  submitMessage,
  transcribeChatAudioWithProfile,
  type ChatHydrationErrorCode,
  type ChatHydrationOutcomeType,
} from "state/actions/ai";
import { buildMessageBranchInfo } from "state/actions/aiBranches";
import {
  buildChatHistoryEntries,
  type ChatHistoryCompatibility,
  type ChatRunType,
} from "state/actions/chatHistory";
import { useAIStore, useProjectState } from "state/definitions";
import { useChatBranchIndex } from "state/hooks/useChatBranchIndex";
import {
  hasPendingToolInteraction,
  normalizeToolName,
} from "utils/claudeTools";
import {
  buildSearchableTextForMessage,
  matchesConversationSearchText,
  tokenizeConversationSearchQuery,
} from "utils/conversationSearch";
import {
  route_get_file_browser_root,
  route_get_folder_contents,
} from "utils/generatedEndpoints";
import {
  AgentRun,
  BaseChatMessageUnion,
  ChatFileAttachment,
  ChatRoleEnum,
  EngineTypeEnum,
} from "utils/generatedTypes";
import { shallow } from "zustand/shallow";
import {
  resolveProjectChatRunTypeForEngine,
  type ProjectChatHydrationAuthority,
  type ProjectChatThreadBlockedErrorCode,
} from "./projectChatHydrationAuthority";
import { buildCreateProjectStarterPrompt } from "./projectChatStarterPrompts";
import {
  getCachedWorkspacePythonSignal,
  hasPythonSignalsInRoot,
  setCachedWorkspacePythonSignal,
  type WorkspacePythonSignalCache,
} from "./workspacePythonSignals";

const hasPythonInWorkspaceRootCache: WorkspacePythonSignalCache = new Map();
const WORKSPACE_ROOT_FAST_POLL_MS = 5000;
const WORKSPACE_ROOT_BACKOFF_POLL_MS = 30000;
const WORKSPACE_ROOT_STABLE_POLLS_BEFORE_BACKOFF = 2;
const WORKSPACE_PYTHON_SIGNAL_REVALIDATE_MS = 5000;

type ChatExecutionSettings = ManagedChatExecutionSettings;
type ProjectChatBlockedErrorCode =
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
  if (errorCode === "chat_not_found") {
    return "This thread was not found during hydration. You can still continue chatting from here.";
  }
  if (errorCode === "chat_provenance_missing") {
    return "This thread is missing provenance metadata. You can continue chatting, but prior hydration may be incomplete.";
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
  chatId,
  hydrationRunType,
  hydrationMetadataRevision,
}: {
  chatId: string | null | undefined;
  hydrationRunType: ChatRunType | null;
  hydrationMetadataRevision: string;
}): string | null {
  const normalizedChatId = chatId?.trim() ?? "";
  if (!normalizedChatId || !hydrationRunType) {
    return null;
  }
  const normalizedRevision = hydrationMetadataRevision.trim();
  if (!normalizedRevision) {
    return null;
  }
  return `${normalizedChatId}:${hydrationRunType}:${normalizedRevision}`;
}

type ProjectChatHydrationRetryStatus =
  | "in_flight"
  | "succeeded"
  | "failed"
  | "retry_scheduled"
  | "terminal_failure";

type ProjectChatHydrationRetryEntry = {
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

function buildProjectChatHydrationChatKeyPrefix(chatId: string): string {
  return `${chatId.trim()}:`;
}

export function clearProjectChatHydrationCacheEntriesForChat({
  cache,
  chatId,
  keepCacheKey,
}: {
  cache: Record<string, ProjectChatHydrationRetryEntry>;
  chatId: string;
  keepCacheKey: string | null;
}): string[] {
  const normalizedChatId = chatId.trim();
  if (!normalizedChatId) {
    return [];
  }
  const keyPrefix = buildProjectChatHydrationChatKeyPrefix(normalizedChatId);
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

function touchProjectChatHydrationRetryEntry(
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

export function resolveWorkspaceRootPollDelayMs(
  stablePollCount: number,
): number {
  if (stablePollCount >= WORKSPACE_ROOT_STABLE_POLLS_BEFORE_BACKOFF) {
    return WORKSPACE_ROOT_BACKOFF_POLL_MS;
  }
  return WORKSPACE_ROOT_FAST_POLL_MS;
}

type ProjectChatRuntimeActivityCounts = {
  activeBackgroundTerminals: number;
  activeSubagents: number;
};

const EMPTY_PROJECT_CHAT_RUNTIME_ACTIVITY_COUNTS: ProjectChatRuntimeActivityCounts =
  {
    activeBackgroundTerminals: 0,
    activeSubagents: 0,
  };
const ACTIVE_BACKGROUND_TERMINAL_TOOL_IDS = new Set<string>([
  "command_execution",
]);
const ACTIVE_SUBAGENT_TOOL_IDS = new Set<string>([
  "setta__run_agent_profile",
  "setta__run_sub_agent",
  "run_agent_profile",
  "run_sub_agent",
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

export function resolveProjectChatRuntimeActivityCounts({
  messages,
  waitingForResponse,
}: {
  messages: Array<BaseChatMessageUnion>;
  waitingForResponse: boolean;
}): ProjectChatRuntimeActivityCounts {
  if (!waitingForResponse) {
    return EMPTY_PROJECT_CHAT_RUNTIME_ACTIVITY_COUNTS;
  }
  const streamingAssistantMessage = resolveStreamingAssistantMessage(messages);
  if (!streamingAssistantMessage) {
    return EMPTY_PROJECT_CHAT_RUNTIME_ACTIVITY_COUNTS;
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
  let activeBackgroundTerminals = 0;
  let activeSubagents = 0;
  const toolCalls = streamingAssistantMessage.tool_calls ?? [];
  for (const toolCall of toolCalls) {
    if (completedToolCallIds.has(toolCall.id)) {
      continue;
    }
    const category = resolveToolRuntimeCategory(toolCall.function?.name ?? "");
    if (!category) {
      continue;
    }
    if (category === "background_terminal") {
      activeBackgroundTerminals += 1;
      continue;
    }
    if (category === "subagent") {
      activeSubagents += 1;
    }
  }
  return {
    activeBackgroundTerminals,
    activeSubagents,
  };
}

function useWorkspaceRootIdentity(
  enabled: boolean,
  projectConfigId: string,
): string | null {
  const [workspaceRootIdentity, setWorkspaceRootIdentity] = useState<
    string | null
  >(null);

  useEffect(() => {
    if (!enabled) {
      setWorkspaceRootIdentity(null);
      return;
    }
    setWorkspaceRootIdentity(null);
    let cancelled = false;
    let inFlight = false;
    let stablePollCount = 0;
    let lastResolvedRoot: string | null = null;
    let timeoutId: number | null = null;

    const clearScheduledPoll = () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
        timeoutId = null;
      }
    };

    const scheduleNextPoll = () => {
      if (cancelled || document.visibilityState !== "visible") {
        return;
      }
      const delay = resolveWorkspaceRootPollDelayMs(stablePollCount);
      clearScheduledPoll();
      timeoutId = window.setTimeout(() => {
        void refreshRootIdentity();
      }, delay);
    };

    const refreshRootIdentity = async () => {
      if (cancelled || inFlight) {
        return;
      }
      inFlight = true;
      try {
        const rootResponse = await route_get_file_browser_root();
        if (cancelled) {
          return;
        }
        if (
          !rootResponse ||
          rootResponse.status !== 200 ||
          !rootResponse.data
        ) {
          stablePollCount = 0;
          return;
        }
        let nextRoot: string | null = null;
        const rootPath = rootResponse.data.rootPath.trim();
        if (rootPath) {
          nextRoot = rootPath;
        }
        if (nextRoot === lastResolvedRoot) {
          stablePollCount += 1;
        } else {
          lastResolvedRoot = nextRoot;
          stablePollCount = 0;
        }
        setWorkspaceRootIdentity((current) => {
          if (current === nextRoot) {
            return current;
          }
          return nextRoot;
        });
      } catch {
        stablePollCount = 0;
      } finally {
        inFlight = false;
        scheduleNextPoll();
      }
    };

    const handleVisibilityChange = () => {
      if (cancelled) {
        return;
      }
      if (document.visibilityState !== "visible") {
        clearScheduledPoll();
        return;
      }
      void refreshRootIdentity();
    };

    void refreshRootIdentity();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      cancelled = true;
      clearScheduledPoll();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [enabled, projectConfigId]);

  return workspaceRootIdentity;
}

function useHasPythonInWorkspaceRoot(
  enabled: boolean,
  workspaceRootIdentity: string | null,
): boolean {
  const [hasPython, setHasPython] = useState(false);
  const [revalidationTick, setRevalidationTick] = useState(0);
  const previousRootRef = useRef<string | null>(null);
  const inFlightRootScanRef = useRef<Promise<void> | null>(null);
  const pendingRootIdentityRef = useRef<string | null>(null);

  useEffect(() => {
    if (workspaceRootIdentity === previousRootRef.current) {
      return;
    }
    previousRootRef.current = workspaceRootIdentity;
    setHasPython(false);
  }, [workspaceRootIdentity]);

  useEffect(() => {
    if (!enabled || !workspaceRootIdentity) {
      return;
    }
    let intervalId: number | null = null;

    const clearRevalidationInterval = () => {
      if (intervalId === null) {
        return;
      }
      window.clearInterval(intervalId);
      intervalId = null;
    };

    const startRevalidationInterval = () => {
      clearRevalidationInterval();
      if (document.visibilityState !== "visible") {
        return;
      }
      intervalId = window.setInterval(() => {
        setRevalidationTick((current) => current + 1);
      }, WORKSPACE_PYTHON_SIGNAL_REVALIDATE_MS);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        clearRevalidationInterval();
        return;
      }
      setRevalidationTick((current) => current + 1);
      startRevalidationInterval();
    };

    startRevalidationInterval();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      clearRevalidationInterval();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [enabled, workspaceRootIdentity]);

  useEffect(() => {
    if (!enabled || !workspaceRootIdentity) {
      pendingRootIdentityRef.current = null;
      setHasPython(false);
      return;
    }
    if (inFlightRootScanRef.current !== null) {
      pendingRootIdentityRef.current = workspaceRootIdentity;
      return;
    }
    let cancelled = false;
    const scannedRootIdentity = workspaceRootIdentity;

    const load = async () => {
      const rootPath = scannedRootIdentity;
      pendingRootIdentityRef.current = null;
      const shouldUseCache = revalidationTick === 0;
      if (shouldUseCache) {
        const cached = getCachedWorkspacePythonSignal(
          hasPythonInWorkspaceRootCache,
          rootPath,
        );
        if (cached !== null) {
          if (cancelled) {
            return;
          }
          setHasPython(cached);
          return;
        }
      }
      try {
        const contentsResponse = await route_get_folder_contents({
          folderPath: rootPath,
          includeHidden: false,
          includeMtime: false,
          includeSize: false,
          maxEntries: 5000,
        });
        if (
          !contentsResponse ||
          contentsResponse.status !== 200 ||
          !Array.isArray(contentsResponse.data)
        ) {
          if (!cancelled) {
            setHasPython(false);
          }
          return;
        }
        if (cancelled) {
          return;
        }
        const hasPythonSignals = hasPythonSignalsInRoot(contentsResponse.data);
        setCachedWorkspacePythonSignal(
          hasPythonInWorkspaceRootCache,
          rootPath,
          hasPythonSignals,
        );
        setHasPython(hasPythonSignals);
      } catch {
        if (!cancelled) {
          setHasPython(false);
        }
      }
    };

    const loadPromise = load().finally(() => {
      if (inFlightRootScanRef.current === loadPromise) {
        inFlightRootScanRef.current = null;
      }
      const pendingRootIdentity = pendingRootIdentityRef.current;
      if (pendingRootIdentity && pendingRootIdentity !== scannedRootIdentity) {
        setRevalidationTick((current) => current + 1);
      }
    });
    inFlightRootScanRef.current = loadPromise;
    void loadPromise;
    return () => {
      cancelled = true;
      pendingRootIdentityRef.current = null;
    };
  }, [enabled, revalidationTick, workspaceRootIdentity]);

  return hasPython;
}

function toSortedProjectHistoryEntries(
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

function findBranchSourceUserMessage(
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

function filterProjectConversationMessagesBySearch({
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

function EmptyChatState({
  starterPrompts,
  disabled,
  onStarterPrompt,
}: {
  starterPrompts: ChatStarterPrompt[];
  disabled: boolean;
  onStarterPrompt: (prompt: string) => void;
}) {
  const starterButtonClassName =
    "cursor-pointer rounded-md border border-setta-200 px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-setta-600 transition-colors hover:border-setta-400 hover:text-setta-800 disabled:cursor-not-allowed disabled:opacity-50 dark:border-setta-700 dark:text-setta-300 dark:hover:border-setta-500 dark:hover:text-setta-100";

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 overflow-y-auto p-3">
      {starterPrompts.map((starterPrompt) => (
        <button
          key={starterPrompt.id}
          type="button"
          className={starterButtonClassName}
          onClick={() => onStarterPrompt(starterPrompt.prompt)}
          disabled={disabled}
        >
          {starterPrompt.label}
        </button>
      ))}
    </div>
  );
}

export const ProjectChatCore = memo(function ProjectChatCore({
  chatId,
  placeholderText,
  conversationFilterText,
  requiresNewThreadContinuation = false,
  newThreadContinuationRequiredReason = null,
  newThreadSeedChatId = null,
  activeConversationSearchMatchMessageId = null,
  hydrationAuthority,
  hydrationMetadataRevision,
  thinking,
  engineConfigId,
  engineType,
  hasLLMConfig,
  externalEngineAvailable,
  noLLMConfigsAvailable,
  transcriptionProfileId,
  dictationMode,
  providerDictationAvailable,
  providerDictationLikelySupported,
  setChatId,
  onStartNewChat,
  onDraftThreadStart,
  onDraftThreadSettled,
  onThinkingChange,
  onPermissionModeChange,
}: {
  chatId: string | null | undefined;
  placeholderText: string;
  conversationFilterText: string;
  requiresNewThreadContinuation?: boolean;
  newThreadContinuationRequiredReason?: string | null;
  newThreadSeedChatId?: string | null;
  activeConversationSearchMatchMessageId?: string | null;
  hydrationAuthority: ProjectChatHydrationAuthority;
  hydrationMetadataRevision: string;
  thinking: boolean;
  engineConfigId: string | null;
  engineType: EngineTypeEnum | null;
  hasLLMConfig: boolean;
  externalEngineAvailable: boolean;
  noLLMConfigsAvailable: boolean;
  transcriptionProfileId: string | null;
  dictationMode: "auto" | "browser" | "provider";
  providerDictationAvailable: boolean;
  providerDictationLikelySupported: boolean;
  setChatId: Dispatch<SetStateAction<string | null | undefined>>;
  onStartNewChat?: () => void;
  onDraftThreadStart?: () => void;
  onDraftThreadSettled?: (
    nextChatId: string | null,
    succeeded: boolean,
  ) => void;
  onThinkingChange?: (nextThinking: boolean) => void;
  onPermissionModeChange?: (
    nextPermissionMode: ChatPermissionModeValue,
  ) => void;
}) {
  const { messages, toolCallArguments, waitingForResponse, contextUsage } =
    useAIStore((state) => {
      if (chatId === null) {
        return state.pendingChatDetails ?? getDefaultChatDetails();
      }
      if (typeof chatId !== "string") {
        return getDefaultChatDetails();
      }
      return state.chatDetails[chatId] ?? getDefaultChatDetails();
    }, shallow);
  const branchIndex = useChatBranchIndex(typeof chatId === "string");
  const branchInfoByMessage = useMemo(() => {
    if (typeof chatId !== "string") {
      return {};
    }
    return buildMessageBranchInfo({
      chatId,
      messages,
      branchIndex,
    });
  }, [branchIndex, chatId, messages]);
  const pendingPrompt = useAIStore((state) => state.pendingProjectChatPrompt);
  const agentRuns = useAIStore((state) => state.agentRuns);
  const agentRunsInitialLoadComplete = useAIStore(
    (state) => state.agentRunsInitialLoadComplete,
  );
  const interruptedAssistantMessageIds = useAIStore((state) => {
    if (typeof chatId !== "string") {
      return {};
    }
    return state.interruptedAssistantMessageIdsByChatId[chatId] ?? {};
  }, shallow);
  const [draftMessage, setDraftMessage] = useState("");
  const [hydrationBlockedErrorCode, setHydrationBlockedErrorCode] =
    useState<ProjectChatBlockedErrorCode | null>(null);
  const [executionSettings, setExecutionSettings] =
    useState<ChatExecutionSettings>(() => ({
      permissionMode: getDefaultProjectChatPermissionMode(engineType),
      searchEnabled: true,
    }));
  const showEmptyState = typeof chatId === "undefined";
  const normalizedConversationSearchTerms = useMemo(
    () => tokenizeConversationSearchQuery(conversationFilterText),
    [conversationFilterText],
  );
  const filteredConversationMessages = useMemo(
    () =>
      filterProjectConversationMessagesBySearch({
        messages,
        normalizedSearchTerms: normalizedConversationSearchTerms,
      }),
    [messages, normalizedConversationSearchTerms],
  );
  const hasVisibleConversationMatches = useMemo(
    () =>
      filteredConversationMessages.some(
        (message) => message.role !== ChatRoleEnum.tool,
      ),
    [filteredConversationMessages],
  );
  const projectConfigId = useProjectState((state) => state.projectConfig.id);
  const submittedMessageHistory = useMemo(
    () =>
      buildProjectChatSubmittedMessageHistory({
        runs: agentRuns,
        projectConfigId,
        activeMessages: messages,
      }),
    [agentRuns, messages, projectConfigId],
  );
  const workspaceRootIdentity = useWorkspaceRootIdentity(
    showEmptyState,
    projectConfigId,
  );
  const hasPythonInWorkspaceRoot = useHasPythonInWorkspaceRoot(
    showEmptyState,
    workspaceRootIdentity,
  );
  const isExternalEngine = engineType === EngineTypeEnum.external_agent;
  const hydrationRunType = hydrationAuthority.hydrationRunType;
  const {
    contextWindowTokens,
    contextUsedTokens,
    contextUsageIsEstimated,
    contextUsageUnavailable,
  } = useMemo(
    () => resolveProjectChatContextTelemetry(contextUsage),
    [contextUsage],
  );
  const historyCompatibility = useMemo<ChatHistoryCompatibility | null>(() => {
    const runType = resolveProjectChatRunTypeForEngine(engineType);
    if (!runType) {
      return null;
    }
    return {
      runType,
      engineConfigId: engineConfigId ?? null,
    };
  }, [engineConfigId, engineType]);
  useEffect(() => {
    if (!isExternalEngine) {
      setExecutionSettings((current) => {
        if (current.permissionMode !== "config_toml_custom") {
          return current;
        }
        return {
          permissionMode: getDefaultProjectChatPermissionMode(
            EngineTypeEnum.setta_llm,
          ),
          searchEnabled: current.searchEnabled,
        };
      });
      return;
    }
    setExecutionSettings((current) => {
      if (current.permissionMode !== "minimal") {
        return current;
      }
      return {
        permissionMode: "config_toml_custom",
        searchEnabled: current.searchEnabled,
      };
    });
  }, [isExternalEngine]);
  useEffect(() => {
    if (!onPermissionModeChange) {
      return;
    }
    onPermissionModeChange(executionSettings.permissionMode);
  }, [executionSettings.permissionMode, onPermissionModeChange]);
  const blockedErrorCode =
    hydrationAuthority.blockedErrorCode ?? hydrationBlockedErrorCode;
  const blockedReason = blockedErrorCode
    ? getProjectChatBlockedReasonMessage(blockedErrorCode)
    : null;
  const canConfigureExecutionSettings =
    Boolean(engineConfigId) &&
    (isExternalEngine ? externalEngineAvailable : hasLLMConfig);
  const showPermissionExecutionControl = canConfigureExecutionSettings;
  const showSearchExecutionControl = false;
  const slashCommands = useMemo(
    () =>
      buildChatSlashCommands({
        model: true,
        permissions: showPermissionExecutionControl,
        search: showSearchExecutionControl,
      }),
    [showPermissionExecutionControl, showSearchExecutionControl],
  );
  const lastChatIdRef = useRef<string | null>(null);
  const hydrationStatusByKeyRef = useRef<
    Record<string, ProjectChatHydrationRetryEntry>
  >({});
  const createProjectStarterPrompt = useMemo(
    () => buildCreateProjectStarterPrompt(hasPythonInWorkspaceRoot),
    [hasPythonInWorkspaceRoot],
  );
  const visibleStarterPrompts = useMemo(
    () =>
      CHAT_STARTER_PROMPTS.filter(
        (starterPrompt) =>
          !starterPrompt.requiresPython || hasPythonInWorkspaceRoot,
      ).map((starterPrompt) => {
        if (starterPrompt.id !== "create-project") {
          return starterPrompt;
        }
        return {
          ...starterPrompt,
          prompt: createProjectStarterPrompt,
        };
      }),
    [createProjectStarterPrompt, hasPythonInWorkspaceRoot],
  );

  useEffect(() => {
    if (!agentRunsInitialLoadComplete) {
      void loadAgentRuns();
    }
  }, [agentRunsInitialLoadComplete]);

  useEffect(() => {
    if (typeof chatId === "string") {
      lastChatIdRef.current = chatId;
    }
  }, [chatId]);

  useEffect(() => {
    setHydrationBlockedErrorCode(null);
  }, [chatId, hydrationMetadataRevision, hydrationRunType]);

  const clearHydrationRetryTimer = useCallback((cacheKey: string) => {
    const state = hydrationStatusByKeyRef.current[cacheKey];
    if (!state || state.timerId === null) {
      return;
    }
    globalThis.clearTimeout(state.timerId);
    state.timerId = null;
    if (state.status === "retry_scheduled") {
      state.status = "failed";
    }
    touchProjectChatHydrationRetryEntry(state);
  }, []);

  const clearAllHydrationRetryTimers = useCallback(() => {
    for (const cacheKey of Object.keys(hydrationStatusByKeyRef.current)) {
      clearHydrationRetryTimer(cacheKey);
    }
  }, [clearHydrationRetryTimer]);

  useEffect(() => {
    return () => {
      clearAllHydrationRetryTimers();
    };
  }, [clearAllHydrationRetryTimers]);

  useEffect(() => {
    if (!pendingPrompt) {
      return;
    }
    setDraftMessage((current) => (current.trim() ? current : pendingPrompt));
    useAIStore.setState({ pendingProjectChatPrompt: null });
  }, [pendingPrompt]);

  useEffect(() => {
    if (typeof chatId !== "string") {
      return;
    }
    if (hydrationAuthority.status !== "ready") {
      return;
    }
    if (hydrationRunType === null) {
      return;
    }
    if (waitingForResponse) {
      return;
    }
    const cacheKey = buildProjectChatHydrationCacheKey({
      chatId,
      hydrationRunType,
      hydrationMetadataRevision,
    });
    if (!cacheKey) {
      return;
    }
    const staleCacheKeys = clearProjectChatHydrationCacheEntriesForChat({
      cache: hydrationStatusByKeyRef.current,
      chatId,
      keepCacheKey: cacheKey,
    });
    for (const staleCacheKey of staleCacheKeys) {
      clearHydrationRetryTimer(staleCacheKey);
      delete hydrationStatusByKeyRef.current[staleCacheKey];
    }
    const retryState = hydrationStatusByKeyRef.current[cacheKey];
    if (retryState) {
      touchProjectChatHydrationRetryEntry(retryState);
    }
    if (
      shouldSkipProjectChatHydration(
        retryState
          ? {
              status: retryState.status,
              hasLiveRetryTimer: retryState.timerId !== null,
            }
          : null,
      )
    ) {
      return;
    }
    if (retryState && retryState.status === "retry_scheduled") {
      retryState.status = "failed";
    }
    let cancelled = false;
    const hydrateChat = async () => {
      const state =
        hydrationStatusByKeyRef.current[cacheKey] ??
        (hydrationStatusByKeyRef.current[cacheKey] = {
          status: "failed",
          timerId: null,
          attempt: 0,
          lastTouchedAt: Date.now(),
        });
      touchProjectChatHydrationRetryEntry(state);
      state.status = "in_flight";
      const hydrationOutcome =
        hydrationRunType === "external_agent"
          ? await getExternalAgentChatHydrationOutcome(chatId, null)
          : await getLLMChatHydrationOutcome(chatId);
      if (cancelled) {
        return;
      }
      const retryDecision = resolveProjectChatHydrationRetryDecision({
        outcomeType: hydrationOutcome.outcome,
        attempt: state.attempt,
      });
      if (retryDecision.type === "success") {
        setHydrationBlockedErrorCode(null);
        state.status = "succeeded";
        touchProjectChatHydrationRetryEntry(state);
        clearHydrationRetryTimer(cacheKey);
        trimProjectChatHydrationCache({
          cache: hydrationStatusByKeyRef.current,
        });
        return;
      }
      if (retryDecision.type === "terminal_failure") {
        setHydrationBlockedErrorCode(hydrationOutcome.errorCode);
        clearHydrationRetryTimer(cacheKey);
        state.status = "terminal_failure";
        touchProjectChatHydrationRetryEntry(state);
        trimProjectChatHydrationCache({
          cache: hydrationStatusByKeyRef.current,
        });
        return;
      }
      setHydrationBlockedErrorCode(null);
      clearHydrationRetryTimer(cacheKey);
      state.attempt = retryDecision.nextAttempt;
      if (retryDecision.type === "transient_exhausted") {
        state.status = "failed";
        touchProjectChatHydrationRetryEntry(state);
        trimProjectChatHydrationCache({
          cache: hydrationStatusByKeyRef.current,
        });
        return;
      }
      state.status = "retry_scheduled";
      touchProjectChatHydrationRetryEntry(state);
      state.timerId = globalThis.setTimeout(() => {
        if (cancelled) {
          return;
        }
        const retryStateForKey = hydrationStatusByKeyRef.current[cacheKey];
        if (!retryStateForKey) {
          return;
        }
        retryStateForKey.timerId = null;
        retryStateForKey.status = "failed";
        touchProjectChatHydrationRetryEntry(retryStateForKey);
        void hydrateChat();
      }, retryDecision.delayMs);
    };
    void hydrateChat();
    return () => {
      cancelled = true;
      clearHydrationRetryTimer(cacheKey);
      const state = hydrationStatusByKeyRef.current[cacheKey];
      if (state?.status === "in_flight") {
        state.status = "failed";
        touchProjectChatHydrationRetryEntry(state);
      }
    };
  }, [
    chatId,
    clearHydrationRetryTimer,
    hydrationAuthority.status,
    hydrationMetadataRevision,
    hydrationRunType,
    waitingForResponse,
  ]);

  const handleNewChatStart = useCallback(() => {
    if (onStartNewChat) {
      onStartNewChat();
      return;
    }
    onDraftThreadStart?.();
    if (chatId === null) {
      return;
    }
    initializePendingChatDetails();
    setChatId(null);
  }, [chatId, onDraftThreadStart, onStartNewChat, setChatId]);

  const handleNewChatSettled = useCallback(
    (newChatId: string | null, succeeded: boolean) => {
      onDraftThreadSettled?.(newChatId, succeeded);
      if (!succeeded || !newChatId) {
        clearPendingChatDetails();
        setChatId((currentChatId) => {
          if (currentChatId !== null) {
            return currentChatId;
          }
          return undefined;
        });
        return;
      }
      finalizePendingChatDetails(newChatId);
    },
    [onDraftThreadSettled, setChatId],
  );

  const executionControlHandlers = useMemo(
    () => createManagedExecutionControlHandlers(setExecutionSettings),
    [setExecutionSettings],
  );

  const handleResumeLatestChat = useCallback(async (): Promise<boolean> => {
    await loadAgentRuns();
    const currentChatId = typeof chatId === "string" ? chatId : null;
    const latestEntry = toSortedProjectHistoryEntries(
      useAIStore.getState().agentRuns,
      projectConfigId,
      historyCompatibility,
    ).find((entry) => entry.chatId !== currentChatId);
    if (!latestEntry) {
      return false;
    }
    setChatId(latestEntry.chatId);
    return true;
  }, [chatId, historyCompatibility, projectConfigId, setChatId]);

  const handleSlashCommand = useCallback(
    async (command: ChatSlashCommand): Promise<ChatSlashCommandResult> => {
      return executeManagedChatSlashCommand({
        command,
        slashCommands,
        onStartNewChat: handleNewChatStart,
        onResumeLatestChat: handleResumeLatestChat,
        resumeFeedback: {
          success: "Resumed the latest project chat.",
          notFound: "No previous project chat found to resume.",
        },
        onSetPermissionMode: executionControlHandlers.onPermissionModeChange,
        modelFeedback: "Use the model selector in the Project AI Chat toolbar.",
        searchEnabled: executionSettings.searchEnabled,
        onSetSearchEnabled: executionControlHandlers.onSearchEnabledChange,
      });
    },
    [
      executionSettings.searchEnabled,
      executionControlHandlers.onPermissionModeChange,
      executionControlHandlers.onSearchEnabledChange,
      handleNewChatStart,
      handleResumeLatestChat,
      slashCommands,
    ],
  );

  const handleSubmit = useCallback(
    async (message: string, attachments: ChatFileAttachment[]) => {
      const trimmed = message.trim();
      if (!trimmed && attachments.length === 0) {
        return false;
      }
      if (requiresNewThreadContinuation) {
        return false;
      }
      if (!engineConfigId) {
        return false;
      }
      if (!isExternalEngine && !hasLLMConfig) {
        return false;
      }
      if (isExternalEngine && !externalEngineAvailable) {
        return false;
      }
      const isFirstDraftSubmit = chatId === undefined || chatId === null;
      if (isFirstDraftSubmit) {
        handleNewChatStart();
      }

      let submittedChatId: string | null = null;
      let succeeded = false;
      try {
        submittedChatId = await submitMessage(
          chatId ?? null,
          message,
          attachments,
          thinking,
          engineConfigId,
          isExternalEngine,
          {
            continueFromChatId: isFirstDraftSubmit ? newThreadSeedChatId : null,
            executionSettings: {
              permissionMode: executionSettings.permissionMode,
              searchEnabled: executionSettings.searchEnabled,
            },
          },
        );
        succeeded = Boolean(submittedChatId);
      } catch (err) {
        console.error("Failed to submit LLM chat message", err);
      } finally {
        if (isFirstDraftSubmit) {
          handleNewChatSettled(submittedChatId, succeeded);
        }
      }
      return succeeded;
    },
    [
      chatId,
      thinking,
      engineConfigId,
      handleNewChatSettled,
      handleNewChatStart,
      isExternalEngine,
      externalEngineAvailable,
      hasLLMConfig,
      newThreadSeedChatId,
      requiresNewThreadContinuation,
      executionSettings.permissionMode,
      executionSettings.searchEnabled,
    ],
  );

  const handleStop = useCallback(async () => {
    await stopProjectChatResponse(chatId, isExternalEngine);
  }, [chatId, isExternalEngine]);

  const handleEditMessage = useCallback(
    async (
      messageId: string,
      text: string,
      attachments: ChatFileAttachment[],
    ) => {
      const resolvedChatId =
        typeof chatId === "string" ? chatId : lastChatIdRef.current;
      if (!resolvedChatId) {
        return false;
      }
      if (requiresNewThreadContinuation) {
        return false;
      }
      if (isExternalEngine && !externalEngineAvailable) {
        return false;
      }
      const nextChatId = await submitEditedMessage({
        parentChatId: resolvedChatId,
        messages,
        messageId,
        message: text,
        attachments,
        thinking,
        engineConfigId,
        isExternalEngine,
        agentProfileId: null,
        sectionId: null,
        executionSettings: {
          permissionMode: executionSettings.permissionMode,
          searchEnabled: executionSettings.searchEnabled,
        },
      });
      return Boolean(nextChatId);
    },
    [
      chatId,
      engineConfigId,
      externalEngineAvailable,
      isExternalEngine,
      messages,
      requiresNewThreadContinuation,
      thinking,
      executionSettings.permissionMode,
      executionSettings.searchEnabled,
    ],
  );

  const handleBranchSwitch = useCallback(
    (nextChatId: string) => {
      if (!nextChatId || nextChatId === chatId) {
        return;
      }
      setChatId(nextChatId);
    },
    [chatId, setChatId],
  );

  const handleRedoMessage = useCallback(
    async (assistantMessageId: string) => {
      const resolvedChatId =
        typeof chatId === "string" ? chatId : lastChatIdRef.current;
      if (!resolvedChatId || waitingForResponse) {
        return false;
      }
      if (requiresNewThreadContinuation) {
        return false;
      }
      if (!engineConfigId) {
        return false;
      }
      if (!isExternalEngine && !hasLLMConfig) {
        return false;
      }
      if (isExternalEngine && !externalEngineAvailable) {
        return false;
      }
      const sourceUserMessage = findBranchSourceUserMessage(
        messages,
        assistantMessageId,
      );
      if (!sourceUserMessage) {
        return false;
      }
      const sourceText = extractUserPromptText(sourceUserMessage) ?? "";
      const sourceAttachments = getMessageAttachments(sourceUserMessage);
      const nextChatId = await submitEditedMessage({
        parentChatId: resolvedChatId,
        messages,
        messageId: sourceUserMessage.id,
        message: sourceText,
        attachments: sourceAttachments,
        thinking,
        engineConfigId,
        isExternalEngine,
        agentProfileId: null,
        sectionId: null,
        executionSettings: {
          permissionMode: executionSettings.permissionMode,
          searchEnabled: executionSettings.searchEnabled,
        },
      });
      return Boolean(nextChatId);
    },
    [
      chatId,
      engineConfigId,
      executionSettings.permissionMode,
      executionSettings.searchEnabled,
      externalEngineAvailable,
      hasLLMConfig,
      isExternalEngine,
      messages,
      requiresNewThreadContinuation,
      thinking,
      waitingForResponse,
    ],
  );

  const isDisabled =
    requiresNewThreadContinuation ||
    !engineConfigId ||
    (!isExternalEngine && !hasLLMConfig) ||
    (isExternalEngine && !externalEngineAvailable);
  const editDisabledReason = useMemo(() => {
    if (newThreadContinuationRequiredReason) {
      return newThreadContinuationRequiredReason;
    }
    return getChatEditDisabledReason({
      hasEngineConfig: Boolean(engineConfigId),
      hasLLMConfig,
      isExternalEngine,
      externalEngineAvailable,
      noLLMConfigsAvailable,
    });
  }, [
    engineConfigId,
    externalEngineAvailable,
    hasLLMConfig,
    isExternalEngine,
    newThreadContinuationRequiredReason,
    noLLMConfigsAvailable,
  ]);
  const submitDisabled = useMemo(
    () =>
      requiresNewThreadContinuation ||
      (!waitingForResponse && hasPendingToolInteraction(messages)),
    [messages, requiresNewThreadContinuation, waitingForResponse],
  );
  const runtimeActivityCounts = useMemo(
    () =>
      resolveProjectChatRuntimeActivityCounts({
        messages,
        waitingForResponse,
      }),
    [messages, waitingForResponse],
  );
  const showThinkingExecutionControl =
    engineType === EngineTypeEnum.setta_llm ||
    engineType === EngineTypeEnum.external_agent;
  const executionControls = useMemo(
    () => ({
      thinkingEnabled: thinking,
      onThinkingEnabledChange: showThinkingExecutionControl
        ? onThinkingChange
        : undefined,
      permissionMode: executionSettings.permissionMode,
      searchEnabled: executionSettings.searchEnabled,
      onPermissionModeChange: executionControlHandlers.onPermissionModeChange,
      onSearchEnabledChange: executionControlHandlers.onSearchEnabledChange,
    }),
    [
      thinking,
      onThinkingChange,
      showThinkingExecutionControl,
      executionSettings.permissionMode,
      executionSettings.searchEnabled,
      executionControlHandlers.onPermissionModeChange,
      executionControlHandlers.onSearchEnabledChange,
    ],
  );
  const handleProviderDictationTranscribe = useCallback(
    async (audioBlob: Blob) => {
      if (isExternalEngine || !transcriptionProfileId) {
        throw new Error("Provider dictation is not configured.");
      }
      return transcribeChatAudioWithProfile(transcriptionProfileId, audioBlob);
    },
    [isExternalEngine, transcriptionProfileId],
  );
  const chatWidthShellClassName = "mx-auto w-full max-w-[72rem] px-2";
  const showConversationSearchEmptyState =
    normalizedConversationSearchTerms.length > 0 &&
    !hasVisibleConversationMatches &&
    !waitingForResponse;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {blockedReason ? (
        <div
          role="alert"
          data-testid="project-chat-thread-blocked-banner"
          className="mx-auto mt-2 w-full max-w-[72rem] rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-600/70 dark:bg-amber-950/40 dark:text-amber-200"
        >
          {blockedReason}
        </div>
      ) : null}
      {showEmptyState ? (
        <div
          className={`${chatWidthShellClassName} flex min-h-0 flex-1 flex-col`}
          data-chat-width-shell="true"
        >
          <EmptyChatState
            starterPrompts={visibleStarterPrompts}
            disabled={isDisabled}
            onStarterPrompt={(prompt) => {
              void handleSubmit(prompt, []);
            }}
          />
        </div>
      ) : showConversationSearchEmptyState ? (
        <div
          className={`${chatWidthShellClassName} flex min-h-0 flex-1 items-center justify-center`}
          data-chat-width-shell="true"
        >
          <p className="text-xs text-setta-500 dark:text-setta-400">
            No messages match this filter.
          </p>
        </div>
      ) : (
        <ChatMessageList
          messages={filteredConversationMessages}
          allMessagesForToolResults={messages}
          waitingForResponse={waitingForResponse}
          toolCallArguments={toolCallArguments}
          interruptedAssistantMessageIds={interruptedAssistantMessageIds}
          activeSearchMessageId={activeConversationSearchMatchMessageId}
          editDisabledReason={editDisabledReason}
          onRedoMessage={handleRedoMessage}
          onEditMessage={handleEditMessage}
          onBranchSwitch={handleBranchSwitch}
          branchInfoByMessage={branchInfoByMessage}
          contentClassName={chatWidthShellClassName}
        />
      )}
      <div className={chatWidthShellClassName} data-chat-width-shell="true">
        <ChatInput
          placeholderText={placeholderText}
          waitingForResponse={waitingForResponse}
          submitDisabled={submitDisabled}
          disabled={isDisabled}
          value={draftMessage}
          onChange={setDraftMessage}
          onSubmit={handleSubmit}
          onStop={handleStop}
          slashCommands={slashCommands}
          onSlashCommand={handleSlashCommand}
          executionControls={executionControls}
          executionControlVisibility={{
            permissionMode: showPermissionExecutionControl,
            search: showSearchExecutionControl,
          }}
          dictationMode={dictationMode}
          dictationEnabledByProvider={providerDictationAvailable}
          providerDictationLikelySupported={providerDictationLikelySupported}
          contextWindowTokens={contextWindowTokens}
          contextUsedTokens={contextUsedTokens}
          contextUsageIsEstimated={contextUsageIsEstimated}
          contextUsageUnavailable={contextUsageUnavailable}
          submittedMessageHistory={submittedMessageHistory}
          runtimeActivityCounts={runtimeActivityCounts}
          onProviderDictationTranscribe={
            isExternalEngine || !providerDictationAvailable
              ? undefined
              : handleProviderDictationTranscribe
          }
        />
      </div>
    </div>
  );
});
