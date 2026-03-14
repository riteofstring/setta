import {
  CHAT_STARTER_PROMPTS,
  createManagedExecutionControlHandlers,
  executeManagedChatSlashCommand,
  type ChatPermissionModeValue,
  type ChatStarterPrompt,
  type ManagedChatExecutionSettings,
} from "components/Chat/chatComposerControls";
import {
  ChatInput,
  resolveSlashCommandRequest,
  type ChatSlashCommand,
  type ChatSlashCommandResult,
} from "components/Chat/ChatInput";
import { ChatMessageList } from "components/Chat/ChatMessages";
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
import { loadAgentRuns } from "state/actions/ai/agentRuns";
import { getDefaultChatDetails } from "state/actions/ai/chatRuntime";
import { buildMessageBranchInfo } from "state/actions/aiBranches";
import { type ChatHistoryCompatibility } from "state/actions/chatHistory";
import {
  useAIStore,
  useLocalStorage,
  useProjectState,
  type ProjectChatCustomSlashCommand,
} from "state/definitions";
import { useChatBranchIndex } from "state/hooks/useChatBranchIndex";
import type { AppGenerationMode } from "state/types/appGenerationMode";
import { tokenizeConversationSearchQuery } from "utils/conversationSearch";
import {
  route_get_file_browser_root,
  route_get_folder_contents,
} from "utils/generatedEndpoints";
import {
  AgentRun,
  ChatFileAttachment,
  ChatRoleEnum,
  EngineTypeEnum,
} from "utils/generatedTypes";
import { shallow } from "zustand/shallow";
import {
  editProjectChatComposerMessage,
  redoProjectChatComposerMessage,
  stopProjectChatComposerResponse,
  submitProjectChatComposerMessage,
  transcribeProjectChatComposerAudio,
} from "./projectChatComposerRuntime";
import { resolveProjectChatComposerDerivedState } from "./projectChatComposerState";
import {
  buildProjectChatSubmittedMessageHistory,
  filterProjectConversationMessagesBySearch,
} from "./projectChatHistoryUtils";
import {
  resolveProjectChatRunTypeForEngine,
  type ProjectChatHydrationAuthority,
} from "./projectChatHydrationAuthority";
import {
  buildProjectChatHydrationCacheKey,
  clearProjectChatHydrationCacheEntriesForChat,
  getDefaultProjectChatPermissionMode,
  getProjectChatBlockedReasonMessage,
  hydrateProjectChatFromRuntime,
  resolveProjectChatComposerExecutableNativeSlashCommandTokens,
  resolveProjectChatComposerNativeSlashCommandTokens,
  resolveProjectChatComposerSlashCommandSets,
  resolveProjectChatContextTelemetry,
  resolveProjectChatHydrationRetryDecision,
  resolveProjectChatRuntimeNativeSlashCommandTokens,
  resolveWorkspaceRootPollDelayMs,
  shouldSkipProjectChatHydration,
  touchProjectChatHydrationRetryEntry,
  trimProjectChatHydrationCache,
  type ProjectChatBlockedErrorCode,
  type ProjectChatHydrationRetryEntry,
} from "./projectChatRuntimeUtils";
import {
  isAgentRunsAuthorityReady,
  type AgentRunsAuthorityState,
} from "./projectChatSkillsMcpViewerUtils";
import { selectCustomProjectChatSlashCommands } from "./projectChatSlashCommandSelectors";
import { buildCreateProjectStarterPrompt } from "./projectChatStarterPrompts";
import {
  resumeLatestProjectChat,
  selectProjectChatThread,
  settleProjectChatThreadStart,
  startProjectChatThread,
} from "./projectChatThreadController";
import {
  getCachedWorkspacePythonSignal,
  hasPythonSignalsInRoot,
  setCachedWorkspacePythonSignal,
  type WorkspacePythonSignalCache,
} from "./workspacePythonSignals";

const hasPythonInWorkspaceRootCache: WorkspacePythonSignalCache = new Map();
const WORKSPACE_PYTHON_SIGNAL_REVALIDATE_MS = 5000;
const CUSTOM_SLASH_COMMAND_AUTHORITY_LOADING_FEEDBACK =
  "Custom slash commands are unavailable until native command authority is loaded for this project.";
const NATIVE_SLASH_COMMANDS_RELOAD_FEEDBACK =
  "Native slash commands are unavailable until agent metadata reloads.";

type ChatExecutionSettings = ManagedChatExecutionSettings;

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
  surfaceId,
  chatId,
  draftMessage,
  setDraftMessage,
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
  onBlockedErrorCodeChange,
}: {
  surfaceId: string;
  chatId: string | null | undefined;
  draftMessage: string;
  setDraftMessage: Dispatch<SetStateAction<string>>;
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
  onBlockedErrorCodeChange?: (
    errorCode: ProjectChatBlockedErrorCode | null,
  ) => void;
}) {
  const { messages, toolCallArguments, waitingForResponse, contextUsage } =
    useAIStore((state) => {
      if (chatId === null) {
        return (
          state.pendingChatDetailsBySurfaceId[surfaceId] ??
          getDefaultChatDetails()
        );
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
  const [hydrationBlockedErrorCode, setHydrationBlockedErrorCode] =
    useState<ProjectChatBlockedErrorCode | null>(null);
  const [executionSettings, setExecutionSettings] =
    useState<ChatExecutionSettings>(() => ({
      permissionMode: getDefaultProjectChatPermissionMode(engineType),
      searchEnabled: true,
    }));
  const showEmptyState =
    typeof chatId === "undefined" || (chatId === null && messages.length === 0);
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
  const appGenerationMode = useLocalStorage((state) => state.appGenerationMode);
  const customProjectChatSlashCommands = useLocalStorage(
    (state): ProjectChatCustomSlashCommand[] =>
      selectCustomProjectChatSlashCommands(
        state.customProjectChatSlashCommandsByProjectConfigId,
        projectConfigId,
      ),
  );
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
    hydrationBlockedErrorCode ?? hydrationAuthority.blockedErrorCode;
  const blockedReason = blockedErrorCode
    ? getProjectChatBlockedReasonMessage(blockedErrorCode)
    : null;
  useEffect(() => {
    onBlockedErrorCodeChange?.(blockedErrorCode);
  }, [blockedErrorCode, onBlockedErrorCodeChange]);
  const canConfigureExecutionSettings =
    Boolean(engineConfigId) &&
    (isExternalEngine ? externalEngineAvailable : hasLLMConfig);
  const showPermissionExecutionControl = canConfigureExecutionSettings;
  const showSearchExecutionControl = false;
  const runtimeAgentNativeSlashCommandTokens = useMemo(() => {
    return resolveProjectChatRuntimeNativeSlashCommandTokens({
      runs: agentRuns,
      projectConfigId,
      engineConfigId,
      engineType,
    });
  }, [agentRuns, engineConfigId, engineType, projectConfigId]);
  const agentRunsAuthorityState = useAIStore(
    (state) => state.agentRunsAuthorityState,
  );
  const customCommandsExecutable =
    !isExternalEngine || isAgentRunsAuthorityReady(agentRunsAuthorityState);
  const { slashCommands, recognizedSlashCommands } = useMemo(() => {
    const discoveredAgentNativeSlashCommands =
      resolveProjectChatComposerNativeSlashCommandTokens({
        runtimeNativeSlashCommandTokens: runtimeAgentNativeSlashCommandTokens,
        agentRunsAuthorityState,
      });
    const executableAgentNativeSlashCommands =
      resolveProjectChatComposerExecutableNativeSlashCommandTokens({
        runtimeNativeSlashCommandTokens: runtimeAgentNativeSlashCommandTokens,
        agentRunsAuthorityState,
      });
    return resolveProjectChatComposerSlashCommandSets({
      customProjectChatSlashCommands,
      discoveredAgentNativeSlashCommands,
      executableAgentNativeSlashCommands,
      customCommandsExecutable,
      customCommandUnavailableFeedback: customCommandsExecutable
        ? null
        : CUSTOM_SLASH_COMMAND_AUTHORITY_LOADING_FEEDBACK,
      showPermissionExecutionControl,
      showSearchExecutionControl,
    });
  }, [
    agentRunsAuthorityState,
    customCommandsExecutable,
    customProjectChatSlashCommands,
    runtimeAgentNativeSlashCommandTokens,
    showPermissionExecutionControl,
    showSearchExecutionControl,
  ]);
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
  }, [chatId, hydrationMetadataRevision, hydrationRunType, projectConfigId]);

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
    const shouldProbeMissingProvenance =
      hydrationAuthority.blockedErrorCode === "chat_provenance_missing";
    if (hydrationRunType === null && !shouldProbeMissingProvenance) {
      return;
    }
    if (waitingForResponse) {
      return;
    }
    const cacheKey = shouldProbeMissingProvenance
      ? `${projectConfigId}:${chatId}:chat_provenance_probe:${hydrationMetadataRevision}`
      : buildProjectChatHydrationCacheKey({
          projectConfigId,
          chatId,
          hydrationRunType,
          hydrationMetadataRevision,
        });
    if (!cacheKey) {
      return;
    }
    const staleCacheKeys = clearProjectChatHydrationCacheEntriesForChat({
      cache: hydrationStatusByKeyRef.current,
      projectConfigId,
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
      const hydrationOutcome = await hydrateProjectChatFromRuntime({
        chatId,
        projectConfigId,
        hydrationRunType,
        shouldProbeMissingProvenance,
      });
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
    hydrationAuthority.blockedErrorCode,
    hydrationMetadataRevision,
    hydrationRunType,
    projectConfigId,
    waitingForResponse,
  ]);

  const handleNewChatStart = useCallback(() => {
    startProjectChatThread({
      chatId,
      surfaceId,
      onStartNewChat,
      onDraftThreadStart,
      setChatId,
    });
  }, [chatId, onDraftThreadStart, onStartNewChat, setChatId, surfaceId]);

  const handleNewChatSettled = useCallback(
    (newChatId: string | null, succeeded: boolean) => {
      settleProjectChatThreadStart({
        newChatId,
        succeeded,
        surfaceId,
        onDraftThreadSettled,
        setChatId,
      });
    },
    [onDraftThreadSettled, setChatId, surfaceId],
  );

  const executionControlHandlers = useMemo(
    () => createManagedExecutionControlHandlers(setExecutionSettings),
    [setExecutionSettings],
  );
  const handleSetAppGenerationMode = useCallback(
    (nextMode: AppGenerationMode) => {
      useLocalStorage.setState({
        appGenerationMode: nextMode,
      });
    },
    [],
  );

  const handleResumeLatestChat = useCallback(async (): Promise<boolean> => {
    return resumeLatestProjectChat({
      chatId: typeof chatId === "string" ? chatId : null,
      projectConfigId,
      historyCompatibility,
      agentRuns: useAIStore.getState().agentRuns,
      setChatId,
    });
  }, [chatId, historyCompatibility, projectConfigId, setChatId]);

  const resolveRefreshedSlashCommandSets = useCallback(
    (refreshedState: {
      agentRuns: AgentRun[];
      agentRunsAuthorityState: AgentRunsAuthorityState;
    }) => {
      const refreshedRuntimeNativeSlashCommandTokens =
        resolveProjectChatRuntimeNativeSlashCommandTokens({
          runs: refreshedState.agentRuns,
          projectConfigId,
          engineConfigId,
          engineType,
        });
      const refreshedDiscoveredAgentNativeSlashCommands =
        resolveProjectChatComposerNativeSlashCommandTokens({
          runtimeNativeSlashCommandTokens:
            refreshedRuntimeNativeSlashCommandTokens,
          agentRunsAuthorityState: refreshedState.agentRunsAuthorityState,
        });
      const refreshedExecutableAgentNativeSlashCommands =
        resolveProjectChatComposerExecutableNativeSlashCommandTokens({
          runtimeNativeSlashCommandTokens:
            refreshedRuntimeNativeSlashCommandTokens,
          agentRunsAuthorityState: refreshedState.agentRunsAuthorityState,
        });
      const refreshedCustomCommandsExecutable =
        !isExternalEngine ||
        isAgentRunsAuthorityReady(refreshedState.agentRunsAuthorityState);
      return resolveProjectChatComposerSlashCommandSets({
        customProjectChatSlashCommands,
        discoveredAgentNativeSlashCommands:
          refreshedDiscoveredAgentNativeSlashCommands,
        executableAgentNativeSlashCommands:
          refreshedExecutableAgentNativeSlashCommands,
        customCommandsExecutable: refreshedCustomCommandsExecutable,
        customCommandUnavailableFeedback: refreshedCustomCommandsExecutable
          ? null
          : CUSTOM_SLASH_COMMAND_AUTHORITY_LOADING_FEEDBACK,
        showPermissionExecutionControl,
        showSearchExecutionControl,
      });
    },
    [
      customProjectChatSlashCommands,
      engineConfigId,
      engineType,
      isExternalEngine,
      projectConfigId,
      showPermissionExecutionControl,
      showSearchExecutionControl,
    ],
  );

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
        appGenerationMode,
        onSetAppGenerationMode: handleSetAppGenerationMode,
      });
    },
    [
      appGenerationMode,
      executionSettings.searchEnabled,
      executionControlHandlers.onPermissionModeChange,
      executionControlHandlers.onSearchEnabledChange,
      handleSetAppGenerationMode,
      handleNewChatStart,
      handleResumeLatestChat,
      slashCommands,
    ],
  );

  const handleUnknownSlashCommand = useCallback(
    async (message: string): Promise<ChatSlashCommandResult> => {
      if (
        !isExternalEngine ||
        isAgentRunsAuthorityReady(agentRunsAuthorityState)
      ) {
        return false;
      }
      await loadAgentRuns();
      const refreshedState = useAIStore.getState();
      const refreshedSlashCommandSets =
        resolveRefreshedSlashCommandSets(refreshedState);
      const refreshedRequest = resolveSlashCommandRequest({
        message,
        slashCommands: refreshedSlashCommandSets.slashCommands,
        recognizedSlashCommands:
          refreshedSlashCommandSets.recognizedSlashCommands,
      });
      if (!isAgentRunsAuthorityReady(refreshedState.agentRunsAuthorityState)) {
        return {
          handled: true,
          feedback: NATIVE_SLASH_COMMANDS_RELOAD_FEEDBACK,
          keepInput: true,
        };
      }
      if (refreshedRequest.parsed) {
        return {
          refreshedSlashCommands: refreshedSlashCommandSets.slashCommands,
          refreshedRecognizedSlashCommands:
            refreshedSlashCommandSets.recognizedSlashCommands,
        };
      }
      return false;
    },
    [
      agentRunsAuthorityState,
      isExternalEngine,
      resolveRefreshedSlashCommandSets,
    ],
  );

  const handleSubmit = useCallback(
    (message: string, attachments: ChatFileAttachment[]) =>
      submitProjectChatComposerMessage({
        message,
        attachments,
        chatId,
        thinking,
        engineConfigId,
        isExternalEngine,
        externalEngineAvailable,
        hasLLMConfig,
        requiresNewThreadContinuation,
        newThreadSeedChatId,
        surfaceId,
        executionSettings,
        onStartNewChat: handleNewChatStart,
        onSettleNewChat: handleNewChatSettled,
      }),
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

  const handleStop = useCallback(
    () =>
      stopProjectChatComposerResponse({
        chatId,
        isExternalEngine,
        surfaceId,
      }),
    [chatId, isExternalEngine, surfaceId],
  );

  const handleEditMessage = useCallback(
    (messageId: string, text: string, attachments: ChatFileAttachment[]) =>
      editProjectChatComposerMessage({
        resolvedChatId:
          typeof chatId === "string" ? chatId : lastChatIdRef.current,
        messageId,
        text,
        attachments,
        requiresNewThreadContinuation,
        isExternalEngine,
        externalEngineAvailable,
        messages,
        thinking,
        engineConfigId,
        surfaceId,
        executionSettings,
        onSelectChatId: setChatId,
      }),
    [
      chatId,
      engineConfigId,
      externalEngineAvailable,
      isExternalEngine,
      messages,
      requiresNewThreadContinuation,
      setChatId,
      surfaceId,
      thinking,
      executionSettings.permissionMode,
      executionSettings.searchEnabled,
    ],
  );

  const handleBranchSwitch = useCallback(
    (nextChatId: string) => {
      selectProjectChatThread({
        nextChatId,
        chatId,
        setChatId,
      });
    },
    [chatId, setChatId],
  );

  const handleRedoMessage = useCallback(
    (assistantMessageId: string) =>
      redoProjectChatComposerMessage({
        assistantMessageId,
        resolvedChatId:
          typeof chatId === "string" ? chatId : lastChatIdRef.current,
        waitingForResponse,
        requiresNewThreadContinuation,
        engineConfigId,
        isExternalEngine,
        externalEngineAvailable,
        hasLLMConfig,
        messages,
        thinking,
        surfaceId,
        executionSettings,
        onSelectChatId: setChatId,
      }),
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
      setChatId,
      surfaceId,
      thinking,
      waitingForResponse,
    ],
  );

  const {
    isDisabled,
    editDisabledReason,
    submitDisabled,
    runtimeActivityDetails,
    runtimeActivityCounts,
    executionControls,
    providerDictationTranscribeEnabled,
    showConversationSearchEmptyState,
    chatInputContextUsageUnavailable,
  } = useMemo(
    () =>
      resolveProjectChatComposerDerivedState({
        requiresNewThreadContinuation,
        engineConfigId,
        hasLLMConfig,
        isExternalEngine,
        externalEngineAvailable,
        noLLMConfigsAvailable,
        newThreadContinuationRequiredReason,
        messages,
        waitingForResponse,
        engineType,
        thinking,
        onThinkingChange,
        executionSettings,
        executionControlHandlers,
        normalizedConversationSearchTerms,
        hasVisibleConversationMatches,
        providerDictationAvailable,
        showEmptyState,
        contextUsageUnavailable,
      }),
    [
      contextUsageUnavailable,
      engineConfigId,
      engineType,
      executionControlHandlers.onPermissionModeChange,
      executionControlHandlers.onSearchEnabledChange,
      executionSettings.permissionMode,
      executionSettings.searchEnabled,
      externalEngineAvailable,
      hasLLMConfig,
      hasVisibleConversationMatches,
      isExternalEngine,
      messages,
      newThreadContinuationRequiredReason,
      noLLMConfigsAvailable,
      normalizedConversationSearchTerms,
      onThinkingChange,
      providerDictationAvailable,
      requiresNewThreadContinuation,
      showEmptyState,
      thinking,
      waitingForResponse,
    ],
  );
  const handleProviderDictationTranscribe = useCallback(
    (audioBlob: Blob) =>
      transcribeProjectChatComposerAudio({
        transcriptionProfileId,
        audioBlob,
      }),
    [transcriptionProfileId],
  );
  const chatWidthShellClassName = "mx-auto w-full min-w-0 max-w-[72rem] px-2";

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden">
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
          recognizedSlashCommands={recognizedSlashCommands}
          onSlashCommand={handleSlashCommand}
          onUnknownSlashCommand={handleUnknownSlashCommand}
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
          contextUsageUnavailable={chatInputContextUsageUnavailable}
          submittedMessageHistory={submittedMessageHistory}
          runtimeActivityCounts={runtimeActivityCounts}
          runtimeActivityDetails={runtimeActivityDetails}
          onProviderDictationTranscribe={
            !providerDictationTranscribeEnabled
              ? undefined
              : handleProviderDictationTranscribe
          }
        />
      </div>
    </div>
  );
});
