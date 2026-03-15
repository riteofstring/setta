import {
  createManagedExecutionControlHandlers,
  executeManagedChatSlashCommand,
  type ChatPermissionModeValue,
  type ManagedChatExecutionSettings,
} from "components/Chat/chatComposerControls";
import { getChatEditDisabledReason } from "components/Chat/chatEditUtils";
import { ChatInput } from "components/Chat/ChatInput";
import {
  resolveSlashCommandRequest,
  type ChatSlashCommand,
  type ChatSlashCommandResult,
  type ChatSubmitOptions,
} from "components/Chat/chatInputSubmission";
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
import { loadAgentRuns } from "state/actions/aiAgentRuns";
import { buildMessageBranchInfo } from "state/actions/aiBranches";
import { stopProjectChatResponse } from "state/actions/aiChatControls";
import { getDefaultChatDetails } from "state/actions/aiChatDetails";
import { submitEditedMessage } from "state/actions/aiChatSubmissionEdits";
import { submitMessage } from "state/actions/aiChatSubmissionMessages";
import {
  clearPendingChatDetails,
  finalizePendingChatDetails,
  initializePendingChatDetails,
} from "state/actions/aiPendingChatMessageState";
import { transcribeChatAudioWithProfile } from "state/actions/aiTranscriptionUpload";
import type { ChatHistoryCompatibility } from "state/actions/chatHistoryTypes";
import {
  useAIStore,
  useProjectState,
  type ProjectChatCustomSlashCommand,
} from "state/definitions";
import { useChatBranchIndex } from "state/hooks/useChatBranchIndex";
import { useLocalStorage } from "state/stores/uiPreferenceStores";
import {
  getDefaultChatAppGenerationDetails,
  resolveChatAppGenerationContextFromMessageState,
} from "state/utils/chatAppGenerationDetails";
import { hasPendingToolInteraction } from "utils/claudeTools";
import { tokenizeConversationSearchQuery } from "utils/conversationSearch";
import {
  AgentRun,
  ChatFileAttachment,
  ChatRoleEnum,
  EngineTypeEnum,
} from "utils/generatedTypes";
import { shallow } from "zustand/shallow";
import {
  buildProjectChatSubmittedMessageHistory,
  extractProjectChatUserPromptText,
  filterProjectConversationMessagesBySearch,
  findBranchSourceUserMessage,
  getProjectChatMessageAttachments,
  hasRetainedImageAttachmentFromImageModeThread,
  resolveProjectChatContextTelemetry,
  resolveProjectChatRuntimeActivityDetails,
  toSortedProjectHistoryEntries,
} from "./projectChatConversationModel";
import { ProjectChatEmptyState } from "./projectChatEmptyState";
import {
  buildProjectChatSubmitReadinessKey,
  getDefaultProjectChatPermissionMode,
  getProjectChatBlockedReasonMessage,
  resolveProjectChatProviderDictationTranscribeEnabled,
  resolveProjectChatSubmitAppGeneration,
  resolveProjectChatSubmitPreflightResult,
  type ProjectChatBlockedErrorCode,
} from "./projectChatExecutionSettings";
import {
  resolveProjectChatRunTypeForEngine,
  type ProjectChatHydrationAuthority,
} from "./projectChatHydrationAuthority";
import {
  buildProjectChatHydrationCacheKey,
  clearProjectChatHydrationCacheEntriesForChat,
  hydrateProjectChatFromRuntime,
  resolveProjectChatHydrationRetryDecision,
  shouldSkipProjectChatHydration,
  touchProjectChatHydrationCacheEntry,
  trimProjectChatHydrationCache,
  type ProjectChatHydrationRetryEntry,
} from "./projectChatHydrationRuntime";
import {
  isAgentRunsAuthorityReady,
  type AgentRunsAuthorityState,
} from "./projectChatSkillsMcpViewerUtils";
import {
  CUSTOM_SLASH_COMMAND_AUTHORITY_LOADING_FEEDBACK,
  NATIVE_SLASH_COMMANDS_RELOAD_FEEDBACK,
  resolveProjectChatComposerExecutableNativeSlashCommandTokens,
  resolveProjectChatComposerNativeSlashCommandTokens,
  resolveProjectChatComposerSlashCommandSets,
  resolveProjectChatRuntimeNativeSlashCommandTokens,
} from "./projectChatSlashCommandAuthority";
import { selectCustomProjectChatSlashCommands } from "./projectChatSlashCommandSelectors";

const DEFAULT_CHAT_APP_GENERATION_DETAILS =
  getDefaultChatAppGenerationDetails();

type ChatExecutionSettings = ManagedChatExecutionSettings;

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
  engineType: EngineTypeEnum | null;
  hasLLMConfig: boolean;
  externalEngineAvailable: boolean;
  noLLMConfigsAvailable: boolean;
  transcriptionProfileId: string | null;
  dictationMode: "auto" | "browser" | "provider";
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
  } = useAIStore((state) => {
    const appGenerationDetails =
      chatId === null
        ? state.pendingChatAppGenerationDetailsBySurfaceId[surfaceId] ??
          DEFAULT_CHAT_APP_GENERATION_DETAILS
        : typeof chatId === "string"
          ? state.chatAppGenerationDetailsByChatId[chatId] ??
            DEFAULT_CHAT_APP_GENERATION_DETAILS
          : DEFAULT_CHAT_APP_GENERATION_DETAILS;
    if (chatId === null) {
      return {
        ...(state.pendingChatDetailsBySurfaceId[surfaceId] ??
          getDefaultChatDetails()),
        ...appGenerationDetails,
      };
    }
    if (typeof chatId !== "string") {
      return {
        ...getDefaultChatDetails(),
        ...appGenerationDetails,
      };
    }
    return {
      ...(state.chatDetails[chatId] ?? getDefaultChatDetails()),
      ...appGenerationDetails,
    };
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
    touchProjectChatHydrationCacheEntry(
      hydrationStatusByKeyRef.current,
      cacheKey,
    );
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
      touchProjectChatHydrationCacheEntry(
        hydrationStatusByKeyRef.current,
        cacheKey,
      );
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
      touchProjectChatHydrationCacheEntry(
        hydrationStatusByKeyRef.current,
        cacheKey,
      );
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
        touchProjectChatHydrationCacheEntry(
          hydrationStatusByKeyRef.current,
          cacheKey,
        );
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
        touchProjectChatHydrationCacheEntry(
          hydrationStatusByKeyRef.current,
          cacheKey,
        );
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
        touchProjectChatHydrationCacheEntry(
          hydrationStatusByKeyRef.current,
          cacheKey,
        );
        trimProjectChatHydrationCache({
          cache: hydrationStatusByKeyRef.current,
        });
        return;
      }
      state.status = "retry_scheduled";
      touchProjectChatHydrationCacheEntry(
        hydrationStatusByKeyRef.current,
        cacheKey,
      );
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
        touchProjectChatHydrationCacheEntry(
          hydrationStatusByKeyRef.current,
          cacheKey,
        );
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
        touchProjectChatHydrationCacheEntry(
          hydrationStatusByKeyRef.current,
          cacheKey,
        );
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
    if (onStartNewChat) {
      onStartNewChat();
      return;
    }
    onDraftThreadStart?.();
    if (chatId === null) {
      return;
    }
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
      if (isFirstDraftSubmit) {
        handleNewChatStart();
      }

      let submittedChatId: string | null = null;
      let succeeded = false;
      const resolvedAppGeneration = resolveProjectChatSubmitAppGeneration({
        activeAppGeneration,
        options,
      });
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
      thinking,
      engineConfigId,
      handleNewChatSettled,
      handleNewChatStart,
      isExternalEngine,
      externalEngineAvailable,
      hasLLMConfig,
      newThreadSeedChatId,
      requiresNewThreadContinuation,
      activeAppGeneration,
      executionSettings.permissionMode,
      executionSettings.searchEnabled,
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
      const sourceText =
        extractProjectChatUserPromptText(sourceUserMessage) ?? "";
      const sourceAttachments =
        getProjectChatMessageAttachments(sourceUserMessage);
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
      requiresNewThreadContinuation,
      setChatId,
      surfaceId,
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
          <ProjectChatEmptyState
            projectConfigId={projectConfigId}
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
          contextUsageUnavailable={
            showEmptyState ? false : contextUsageUnavailable
          }
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
