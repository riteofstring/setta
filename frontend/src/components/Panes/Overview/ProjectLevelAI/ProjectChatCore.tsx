import {
  CHAT_STARTER_PROMPTS,
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
  type ChatSubmitOptions,
} from "components/Chat/ChatInput";
import { resolveSlashCommandRequest } from "components/Chat/chatInputHelpers";
import { ChatMessageList } from "components/Chat/ChatMessages";
import {
  resolveEffectiveThinking,
  supportsThinkingExecutionControl,
} from "components/Chat/engineUtils";
import { getFileBrowserRoot } from "openapi/http";
import { callOpenAPI } from "openapi/http/result";
import {
  useAppSubsystemFrontendStatus,
  useAppSubsystemSlashCommands,
  useAppSubsystemSupportedAppGenerationModes,
} from "plugins/appSubsystem";
import {
  Dispatch,
  memo,
  SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  clearPendingChatDetails,
  finalizePendingChatDetails,
  getDefaultChatDetails,
  initializePendingChatDetails,
  loadAgentRuns,
  stopProjectChatResponse,
  submitEditedMessage,
  submitMessage,
  transcribeChatAudioWithProfile,
} from "state/actions/ai";
import { buildMessageBranchInfo } from "state/actions/aiBranches";
import { type ChatHistoryCompatibility } from "state/actions/chatHistory";
import { addTemporaryNotification } from "state/actions/notifications";
import {
  useAIStore,
  useLocalStorage,
  useProjectState,
  type ProjectChatCustomSlashCommand,
} from "state/definitions";
import { useChatBranchIndex } from "state/hooks/useChatBranchIndex";
import {
  getDefaultChatAppGenerationDetails,
  resolveChatAppGenerationContextFromMessageState,
} from "state/utils/chatAppGeneration";
import { hasPendingToolInteraction } from "utils/claudeTools";
import { tokenizeConversationSearchQuery } from "utils/conversationSearch";
import { res200 } from "utils/endpointUtils";
import {
  AgentRun,
  ChatFileAttachment,
  ChatRoleEnum,
  EngineConfig,
  EngineTypeEnum,
  NotificationTypeEnum,
  type ChatDictationMode,
} from "utils/generatedTypes";
import { shallow } from "zustand/shallow";
import {
  buildProjectChatHydrationCacheKey,
  buildProjectChatSubmitReadinessKey,
  buildProjectChatSubmittedMessageHistory,
  clearProjectChatHydrationCacheEntriesForChat,
  CUSTOM_SLASH_COMMAND_AUTHORITY_LOADING_FEEDBACK,
  extractUserPromptText,
  filterProjectConversationMessagesBySearch,
  findBranchSourceUserMessage,
  getDefaultProjectChatPermissionMode,
  getHistoricalAppGenerationEditReplayBlockedReason,
  getMessageAttachments,
  getProjectChatBlockedReasonMessage,
  hasRetainedImageAttachmentFromImageModeThread,
  hydrateProjectChatFromRuntime,
  NATIVE_SLASH_COMMANDS_RELOAD_FEEDBACK,
  resolveProjectChatComposerExecutableNativeSlashCommandTokens,
  resolveProjectChatComposerNativeSlashCommandTokens,
  resolveProjectChatComposerSlashCommandSets,
  resolveProjectChatContextTelemetry,
  resolveProjectChatHydrationRetryDecision,
  resolveProjectChatProviderDictationTranscribeEnabled,
  resolveProjectChatRedoTarget,
  resolveProjectChatRuntimeActivityDetails,
  resolveProjectChatRuntimeNativeSlashCommandTokens,
  resolveProjectChatSubmitAppGeneration,
  resolveProjectChatSubmitPreflightResult,
  shouldSkipProjectChatHydration,
  toSortedProjectHistoryEntries,
  touchProjectChatHydrationRetryEntry,
  trimProjectChatHydrationCache,
  type ProjectChatBlockedErrorCode,
  type ProjectChatHydrationRetryEntry,
} from "./projectChatCoreUtils";
import {
  resolveProjectChatRunTypeForEngine,
  type ProjectChatHydrationAuthority,
} from "./projectChatHydrationAuthority";
import {
  isAgentRunsAuthorityReady,
  type AgentRunsAuthorityState,
} from "./projectChatSkillsMcpViewerUtils";
import { selectCustomProjectChatSlashCommands } from "./projectChatSlashCommandSelectors";
import { buildCreateProjectStarterPrompt } from "./projectChatStarterPrompts";
import {
  loadWorkspacePythonSignal,
  type WorkspacePythonSignalCache,
} from "./workspacePythonSignals";

const hasPythonInWorkspaceRootCache: WorkspacePythonSignalCache = new Map();
const WORKSPACE_PYTHON_SIGNAL_REVALIDATE_MS = 5000;
const DEFAULT_CHAT_APP_GENERATION_DETAILS =
  getDefaultChatAppGenerationDetails();

type ChatExecutionSettings = ManagedChatExecutionSettings;
type AIStoreState = ReturnType<typeof useAIStore.getState>;

// eslint-disable-next-line complexity
function selectProjectChatCoreState(
  state: AIStoreState,
  surfaceId: string,
  chatId: string | null | undefined,
) {
  const pendingDetails = state.pendingChatDetailsBySurfaceId[surfaceId] ?? null;
  const appGenerationDetails =
    chatId === null || (typeof chatId !== "string" && pendingDetails !== null)
      ? state.pendingChatAppGenerationDetailsBySurfaceId[surfaceId] ??
        DEFAULT_CHAT_APP_GENERATION_DETAILS
      : typeof chatId === "string"
        ? state.chatAppGenerationDetailsByChatId[chatId] ??
          DEFAULT_CHAT_APP_GENERATION_DETAILS
        : DEFAULT_CHAT_APP_GENERATION_DETAILS;
  const shouldUsePendingDraftDetails =
    chatId === null || (typeof chatId !== "string" && pendingDetails !== null);
  if (shouldUsePendingDraftDetails) {
    return {
      ...(pendingDetails ?? getDefaultChatDetails()),
      ...appGenerationDetails,
      usingPendingDraftDetails: pendingDetails !== null,
    };
  }
  if (typeof chatId !== "string") {
    return {
      ...getDefaultChatDetails(),
      ...appGenerationDetails,
      usingPendingDraftDetails: false,
    };
  }
  return {
    ...(state.chatDetails[chatId] ?? getDefaultChatDetails()),
    ...appGenerationDetails,
    usingPendingDraftDetails: false,
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
    void (async () => {
      const rootResponse = await callOpenAPI(getFileBrowserRoot());
      if (cancelled || !res200(rootResponse) || !rootResponse.data) {
        return;
      }
      const rootPath = rootResponse.data.rootPath.trim();
      setWorkspaceRootIdentity(rootPath || null);
    })();

    return () => {
      cancelled = true;
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
      // This stays as visible-page polling because the backend does not keep a
      // websocket-backed watcher for arbitrary workspace-root Python presence.
      // Revalidation is intentionally scoped to the active page instead of
      // pretending there is an authoritative push source for this filesystem probe.
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
      const hasPythonSignals = await loadWorkspacePythonSignal({
        cache: hasPythonInWorkspaceRootCache,
        rootPath,
        revalidate: revalidationTick !== 0,
      });
      if (cancelled) {
        return;
      }
      if (hasPythonSignals === null) {
        if (!cancelled) {
          setHasPython(false);
        }
        return;
      }
      setHasPython(hasPythonSignals);
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

// eslint-disable-next-line complexity
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
  activeConversationSearchMatchIndex = null,
  hydrationAuthority,
  hydrationMetadataRevision,
  thinking,
  engineConfigId,
  engineConfig,
  engineType,
  hasLLMConfig,
  externalEngineAvailable,
  noLLMConfigsAvailable,
  transcriptionProfileId,
  dictationMode,
  providerDictationAvailable,
  providerDictationLikelySupported,
  setChatId,
  onConversationSearchMatchCountChange,
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
  activeConversationSearchMatchIndex?: number | null;
  hydrationAuthority: ProjectChatHydrationAuthority;
  hydrationMetadataRevision: string;
  thinking: boolean;
  engineConfigId: string | null;
  engineConfig: EngineConfig | null;
  engineType: EngineTypeEnum | null;
  hasLLMConfig: boolean;
  externalEngineAvailable: boolean;
  noLLMConfigsAvailable: boolean;
  transcriptionProfileId: string | null;
  dictationMode: ChatDictationMode;
  providerDictationAvailable: boolean;
  providerDictationLikelySupported: boolean;
  setChatId: Dispatch<SetStateAction<string | null | undefined>>;
  onConversationSearchMatchCountChange?: (count: number) => void;
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
  const {
    messages,
    toolCallArguments,
    waitingForResponse,
    contextUsage,
    activeAppGeneration,
    appGenerationByMessageId,
    usingPendingDraftDetails,
  } = useAIStore(
    (state) => selectProjectChatCoreState(state, surfaceId, chatId),
    shallow,
  );
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
    (typeof chatId === "undefined" && !usingPendingDraftDetails) ||
    ((chatId === null || usingPendingDraftDetails) &&
      messages.length === 0 &&
      !waitingForResponse);
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
  const showThinkingExecutionControl =
    supportsThinkingExecutionControl(engineConfig);
  const effectiveThinking = resolveEffectiveThinking({
    engineConfig,
    requestedThinking: thinking,
  });
  const hydrationRunType = hydrationAuthority.hydrationRunType;
  const { contextWindowTokens, contextUsedTokens, contextUsageIsEstimated } =
    useMemo(
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
  const appGenerationSlashCommands = useAppSubsystemSlashCommands();
  const supportedAppGenerationModes =
    useAppSubsystemSupportedAppGenerationModes();
  const appSubsystemFrontendStatus = useAppSubsystemFrontendStatus();
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
      appGenerationSlashCommands,
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
    appGenerationSlashCommands,
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

  // eslint-disable-next-line complexity
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
    const cacheKey = buildProjectChatHydrationCacheKey({
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
    if (chatId === null) {
      return;
    }
    if (onStartNewChat) {
      onStartNewChat();
      return;
    }
    onDraftThreadStart?.();
    initializePendingChatDetails(surfaceId);
    setChatId(null);
  }, [chatId, onDraftThreadStart, onStartNewChat, setChatId, surfaceId]);

  const handleNewChatSettled = useCallback(
    (newChatId: string | null, succeeded: boolean) => {
      onDraftThreadSettled?.(newChatId, succeeded);
      if (!succeeded || !newChatId) {
        clearPendingChatDetails(surfaceId);
        setChatId((currentChatId) => {
          if (currentChatId !== null) {
            return currentChatId;
          }
          return undefined;
        });
        return;
      }
      setChatId(newChatId);
      finalizePendingChatDetails(newChatId, surfaceId);
    },
    [onDraftThreadSettled, setChatId, surfaceId],
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
        appGenerationSlashCommands,
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
      appGenerationSlashCommands,
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
          retryLater: true,
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

  const historicalAppGenerationRegistryPending =
    appSubsystemFrontendStatus === "idle" ||
    appSubsystemFrontendStatus === "loading";
  const getHistoricalAppGenerationBlockedReason = useCallback(
    (mode: string | null | undefined): string | null =>
      getHistoricalAppGenerationEditReplayBlockedReason({
        mode,
        replaySupported:
          appGenerationSlashCommands.length > 0 ||
          historicalAppGenerationRegistryPending,
        modeRegistryResolved: !historicalAppGenerationRegistryPending,
        supportedAppGenerationModes,
      }),
    [
      appGenerationSlashCommands.length,
      historicalAppGenerationRegistryPending,
      supportedAppGenerationModes,
    ],
  );
  const notifyHistoricalAppGenerationBlocked = useCallback(
    (mode: string | null | undefined): boolean => {
      const blockedReason = getHistoricalAppGenerationBlockedReason(mode);
      if (!blockedReason) {
        return false;
      }
      addTemporaryNotification(blockedReason, NotificationTypeEnum.warning);
      return true;
    },
    [getHistoricalAppGenerationBlockedReason],
  );

  const submitProjectChatMessage = useCallback(
    async ({
      attachments,
      isFirstDraftSubmit,
      message,
      resolvedAppGeneration,
    }: {
      attachments: ChatFileAttachment[];
      isFirstDraftSubmit: boolean;
      message: string;
      resolvedAppGeneration: ReturnType<
        typeof resolveProjectChatSubmitAppGeneration
      >;
    }) => {
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
          effectiveThinking,
          engineConfigId,
          isExternalEngine,
          {
            continueFromChatId: isFirstDraftSubmit ? newThreadSeedChatId : null,
            pendingSurfaceId: surfaceId,
            appGeneration: resolvedAppGeneration,
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
      return succeeded ? "submitted" : "retry_later";
    },
    [
      chatId,
      engineConfigId,
      executionSettings.permissionMode,
      executionSettings.searchEnabled,
      effectiveThinking,
      handleNewChatSettled,
      handleNewChatStart,
      isExternalEngine,
      newThreadSeedChatId,
      surfaceId,
    ],
  );

  const handleSubmit = useCallback(
    async (
      message: string,
      attachments: ChatFileAttachment[],
      options?: ChatSubmitOptions,
    ) => {
      const preflightResult = resolveProjectChatSubmitPreflightResult({
        message,
        attachments,
        requiresNewThreadContinuation,
        engineConfigId,
        isExternalEngine,
        hasLLMConfig,
        externalEngineAvailable,
      });
      if (preflightResult) {
        return preflightResult;
      }
      const isFirstDraftSubmit = chatId === undefined || chatId === null;
      const resolvedAppGeneration = resolveProjectChatSubmitAppGeneration({
        activeAppGeneration,
        options,
      });
      if (notifyHistoricalAppGenerationBlocked(resolvedAppGeneration?.mode)) {
        return "retry_later";
      }
      return submitProjectChatMessage({
        attachments,
        isFirstDraftSubmit,
        message,
        resolvedAppGeneration,
      });
    },
    [
      chatId,
      engineConfigId,
      externalEngineAvailable,
      hasLLMConfig,
      notifyHistoricalAppGenerationBlocked,
      requiresNewThreadContinuation,
      activeAppGeneration,
      submitProjectChatMessage,
    ],
  );

  const handleStop = useCallback(async () => {
    await stopProjectChatResponse(chatId, isExternalEngine, surfaceId);
  }, [chatId, isExternalEngine, surfaceId]);

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
      if (
        notifyHistoricalAppGenerationBlocked(
          appGenerationByMessageId[messageId]?.mode,
        )
      ) {
        return false;
      }
      const nextChatId = await submitEditedMessage({
        parentChatId: resolvedChatId,
        messages,
        messageId,
        message: text,
        attachments,
        thinking: effectiveThinking,
        engineConfigId,
        isExternalEngine,
        agentProfileId: null,
        sectionId: null,
        pendingSurfaceId: surfaceId,
        appGeneration: resolveChatAppGenerationContextFromMessageState(
          appGenerationByMessageId[messageId],
        ),
        executionSettings: {
          permissionMode: executionSettings.permissionMode,
          searchEnabled: executionSettings.searchEnabled,
        },
      });
      if (nextChatId) {
        setChatId(nextChatId);
      }
      return Boolean(nextChatId);
    },
    [
      chatId,
      engineConfigId,
      externalEngineAvailable,
      isExternalEngine,
      appGenerationByMessageId,
      messages,
      notifyHistoricalAppGenerationBlocked,
      requiresNewThreadContinuation,
      setChatId,
      surfaceId,
      executionSettings.permissionMode,
      executionSettings.searchEnabled,
      effectiveThinking,
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
      const redoTarget = resolveProjectChatRedoTarget({
        chatId,
        lastChatId: lastChatIdRef.current,
        waitingForResponse,
        requiresNewThreadContinuation,
        engineConfigId,
        isExternalEngine,
        hasLLMConfig,
        externalEngineAvailable,
      });
      if (!redoTarget) {
        return false;
      }
      const sourceUserMessage = findBranchSourceUserMessage(
        messages,
        assistantMessageId,
      );
      if (!sourceUserMessage) {
        return false;
      }
      if (
        notifyHistoricalAppGenerationBlocked(
          appGenerationByMessageId[sourceUserMessage.id]?.mode,
        )
      ) {
        return false;
      }
      const sourceText = extractUserPromptText(sourceUserMessage) ?? "";
      const sourceAttachments = getMessageAttachments(sourceUserMessage);
      const nextChatId = await submitEditedMessage({
        parentChatId: redoTarget.resolvedChatId,
        messages,
        messageId: sourceUserMessage.id,
        message: sourceText,
        attachments: sourceAttachments,
        thinking: effectiveThinking,
        engineConfigId,
        isExternalEngine,
        agentProfileId: null,
        sectionId: null,
        pendingSurfaceId: surfaceId,
        appGeneration: resolveChatAppGenerationContextFromMessageState(
          appGenerationByMessageId[sourceUserMessage.id],
        ),
        executionSettings: {
          permissionMode: executionSettings.permissionMode,
          searchEnabled: executionSettings.searchEnabled,
        },
      });
      if (nextChatId) {
        setChatId(nextChatId);
      }
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
      appGenerationByMessageId,
      messages,
      notifyHistoricalAppGenerationBlocked,
      requiresNewThreadContinuation,
      setChatId,
      surfaceId,
      waitingForResponse,
      effectiveThinking,
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
  const submitReadinessKey = useMemo(
    () =>
      buildProjectChatSubmitReadinessKey({
        requiresNewThreadContinuation,
        engineConfigId: engineConfigId ?? null,
        hasLLMConfig,
        isExternalEngine,
        externalEngineAvailable,
      }),
    [
      engineConfigId,
      externalEngineAvailable,
      hasLLMConfig,
      isExternalEngine,
      requiresNewThreadContinuation,
    ],
  );
  const runtimeActivityDetails = useMemo(
    () =>
      resolveProjectChatRuntimeActivityDetails({
        messages,
        waitingForResponse,
      }),
    [messages, waitingForResponse],
  );
  const runtimeActivityCounts = useMemo(
    () => ({
      activeBackgroundTerminals:
        runtimeActivityDetails.activeBackgroundTerminals.length,
      activeSubagents: runtimeActivityDetails.activeSubagents.length,
    }),
    [runtimeActivityDetails],
  );
  const hasRetainedImageAttachmentForImageMode = useMemo(
    () =>
      hasRetainedImageAttachmentFromImageModeThread(
        messages,
        appGenerationByMessageId,
      ),
    [appGenerationByMessageId, messages],
  );
  const executionControls = useMemo(
    () => ({
      thinkingEnabled: effectiveThinking,
      onThinkingEnabledChange: showThinkingExecutionControl
        ? onThinkingChange
        : undefined,
      permissionMode: executionSettings.permissionMode,
      searchEnabled: executionSettings.searchEnabled,
      onPermissionModeChange: executionControlHandlers.onPermissionModeChange,
      onSearchEnabledChange: executionControlHandlers.onSearchEnabledChange,
    }),
    [
      effectiveThinking,
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
      if (!transcriptionProfileId) {
        throw new Error("Provider dictation is not configured.");
      }
      return transcribeChatAudioWithProfile(transcriptionProfileId, audioBlob);
    },
    [transcriptionProfileId],
  );
  const chatWidthShellClassName = "mx-auto w-full min-w-0 max-w-[72rem] px-2";
  const showConversationSearchEmptyState =
    normalizedConversationSearchTerms.length > 0 &&
    !hasVisibleConversationMatches &&
    !waitingForResponse;

  useEffect(() => {
    if (!showEmptyState && !showConversationSearchEmptyState) {
      return;
    }
    onConversationSearchMatchCountChange?.(0);
  }, [
    onConversationSearchMatchCountChange,
    showConversationSearchEmptyState,
    showEmptyState,
  ]);

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
          activeSearchMatchIndex={activeConversationSearchMatchIndex}
          conversationSearchTerms={normalizedConversationSearchTerms}
          editDisabledReason={editDisabledReason}
          onConversationSearchMatchCountChange={
            onConversationSearchMatchCountChange
          }
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
          submitReadinessKey={submitReadinessKey}
          disabled={isDisabled}
          hasRetainedImageAttachmentForImageMode={
            hasRetainedImageAttachmentForImageMode
          }
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
          submittedMessageHistory={submittedMessageHistory}
          runtimeActivityCounts={runtimeActivityCounts}
          runtimeActivityDetails={runtimeActivityDetails}
          onProviderDictationTranscribe={
            !resolveProjectChatProviderDictationTranscribeEnabled({
              providerDictationAvailable,
            })
              ? undefined
              : handleProviderDictationTranscribe
          }
        />
      </div>
    </div>
  );
});
