import {
  createManagedExecutionControlHandlers,
  executeManagedChatSlashCommand,
  type ManagedChatExecutionSettings,
} from "components/Chat/chatComposerControls";
import { getChatEditDisabledReason } from "components/Chat/chatEditUtils";
import { ChatInput } from "components/Chat/ChatInput";
import {
  type ChatSlashCommand,
  type ChatSlashCommandResult,
  type ChatSubmitOptions,
} from "components/Chat/ChatInput/shared";
import {
  resolveSlashCommandRequest,
  type ChatExecutionControls,
} from "components/Chat/chatInputHelpers";
import { ChatMessageList } from "components/Chat/ChatMessages";
import {
  resolveEffectiveThinking,
  supportsThinkingExecutionControl,
} from "components/Chat/engineUtils";
import { useAppSubsystemSlashCommands } from "plugins/appSubsystem";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  clearPendingChatDetails,
  finalizePendingChatDetails,
  initializePendingChatDetails,
  loadAgentRuns,
  stopProjectChatResponse,
  submitEditedMessage,
  submitMessage,
  transcribeChatAudioWithProfile,
} from "state/actions/ai";
import { buildMessageBranchInfo } from "state/actions/aiBranches";
import {
  useAIStore,
  useLocalStorage,
  useProjectState,
  type ProjectChatCustomSlashCommand,
} from "state/definitions";
import { useChatBranchIndex } from "state/hooks/useChatBranchIndex";
import { resolveChatAppGenerationContextFromMessageState } from "state/utils/chatAppGeneration";
import { hasPendingToolInteraction } from "utils/claudeTools";
import { tokenizeConversationSearchQuery } from "utils/conversationSearch";
import {
  AgentRun,
  ChatFileAttachment,
  ChatRoleEnum,
  EngineTypeEnum,
} from "utils/generatedTypes";
import { shallow } from "zustand/shallow";
import { useProjectChatHydrationRetry } from "./ProjectChatCore/hydration";
import { useProjectChatSearchEmptyMatchCountReset } from "./ProjectChatCore/searchEmptyState";
import { useProjectChatSlashCommandSets } from "./ProjectChatCore/slashCommandSets";
import { useProjectChatStarterPrompts } from "./ProjectChatCore/starterPrompts";
import { type ProjectChatCoreProps } from "./ProjectChatCore/types";
import {
  EmptyChatState,
  selectProjectChatCoreState,
  useHasPythonInWorkspaceRoot,
  useWorkspaceRootIdentity,
} from "./ProjectChatCore/workspaceState";
import {
  buildProjectChatSubmitReadinessKey,
  buildProjectChatSubmittedMessageHistory,
  CUSTOM_SLASH_COMMAND_AUTHORITY_LOADING_FEEDBACK,
  extractUserPromptText,
  filterProjectConversationMessagesBySearch,
  findBranchSourceUserMessage,
  getDefaultProjectChatPermissionMode,
  getMessageAttachments,
  getProjectChatBlockedReasonMessage,
  hasRetainedImageAttachmentFromImageModeThread,
  NATIVE_SLASH_COMMANDS_RELOAD_FEEDBACK,
  resolveProjectChatComposerExecutableNativeSlashCommandTokens,
  resolveProjectChatComposerNativeSlashCommandTokens,
  resolveProjectChatComposerSlashCommandSets,
  resolveProjectChatContextTelemetry,
  resolveProjectChatProviderDictationTranscribeEnabled,
  resolveProjectChatRedoTarget,
  resolveProjectChatRuntimeActivityDetails,
  resolveProjectChatRuntimeNativeSlashCommandTokens,
  resolveProjectChatSubmitAppGeneration,
  resolveProjectChatSubmitPreflightResult,
  toSortedProjectHistoryEntries,
} from "./projectChatCoreUtils";
import {
  isAgentRunsAuthorityReady,
  type AgentRunsAuthorityState,
} from "./projectChatSkillsMcpViewerUtils";
import { selectCustomProjectChatSlashCommands } from "./projectChatSlashCommandSelectors";
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
}: ProjectChatCoreProps) {
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
  const agentRunsAuthorityState = useAIStore(
    (state) => state.agentRunsAuthorityState,
  );
  const agentRunsInitialLoadComplete = useAIStore(
    (state) => state.agentRunsInitialLoadComplete,
  );
  const interruptedAssistantMessageIds = useAIStore((state) => {
    if (typeof chatId !== "string") {
      return {};
    }
    return state.interruptedAssistantMessageIdsByChatId[chatId] ?? {};
  }, shallow);
  const [executionSettings, setExecutionSettings] =
    useState<ManagedChatExecutionSettings>(() => ({
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
  const appGenerationSlashCommands = useAppSubsystemSlashCommands();
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
  const customCommandsExecutable =
    !isExternalEngine || isAgentRunsAuthorityReady(agentRunsAuthorityState);
  const showThinkingExecutionControl =
    supportsThinkingExecutionControl(engineConfig);
  const effectiveThinking = resolveEffectiveThinking({
    engineConfig,
    requestedThinking: thinking,
  });
  const hydrationRunType = hydrationAuthority.hydrationRunType;
  const hydrationBlockedErrorCode = useProjectChatHydrationRetry({
    chatId,
    hydrationAuthority,
    hydrationMetadataRevision,
    hydrationRunType,
    projectConfigId,
    waitingForResponse,
  });
  const { contextWindowTokens, contextUsedTokens, contextUsageIsEstimated } =
    useMemo(
      () => resolveProjectChatContextTelemetry(contextUsage),
      [contextUsage],
    );
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
  const { slashCommands, recognizedSlashCommands } =
    useProjectChatSlashCommandSets({
      agentRuns,
      projectConfigId,
      engineConfigId,
      engineType,
      agentRunsAuthorityState,
      customProjectChatSlashCommands,
      appGenerationSlashCommands,
      customCommandsExecutable,
      showPermissionExecutionControl,
      showSearchExecutionControl,
    });
  const lastChatIdRef = useRef<string | null>(null);
  const visibleStarterPrompts = useProjectChatStarterPrompts(
    hasPythonInWorkspaceRoot,
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
    if (!pendingPrompt) {
      return;
    }
    setDraftMessage((current) => (current.trim() ? current : pendingPrompt));
    useAIStore.setState({ pendingProjectChatPrompt: null });
  }, [pendingPrompt]);

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
    ).find((entry) => entry.chatId !== currentChatId);
    if (!latestEntry) {
      return false;
    }
    setChatId(latestEntry.chatId);
    return true;
  }, [chatId, projectConfigId, setChatId]);

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
      if (!engineConfigId) {
        return "retry_later";
      }
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
  const executionControls = useMemo<ChatExecutionControls>(() => {
    const controls: ChatExecutionControls = {
      thinkingEnabled: effectiveThinking,
      permissionMode: executionSettings.permissionMode,
      searchEnabled: executionSettings.searchEnabled,
      onPermissionModeChange: executionControlHandlers.onPermissionModeChange,
      onSearchEnabledChange: executionControlHandlers.onSearchEnabledChange,
    };
    if (showThinkingExecutionControl && onThinkingChange) {
      controls.onThinkingEnabledChange = onThinkingChange;
    }
    return controls;
  }, [
    effectiveThinking,
    onThinkingChange,
    showThinkingExecutionControl,
    executionSettings.permissionMode,
    executionSettings.searchEnabled,
    executionControlHandlers.onPermissionModeChange,
    executionControlHandlers.onSearchEnabledChange,
  ]);
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

  useProjectChatSearchEmptyMatchCountReset({
    ...(onConversationSearchMatchCountChange
      ? { onConversationSearchMatchCountChange }
      : {}),
    showConversationSearchEmptyState,
    showEmptyState,
  });

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
          onRedoMessage={handleRedoMessage}
          onEditMessage={handleEditMessage}
          onBranchSwitch={handleBranchSwitch}
          branchInfoByMessage={branchInfoByMessage}
          contentClassName={chatWidthShellClassName}
          {...(onConversationSearchMatchCountChange
            ? { onConversationSearchMatchCountChange }
            : {})}
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
          {...(resolveProjectChatProviderDictationTranscribeEnabled({
            providerDictationAvailable,
          })
            ? {
                onProviderDictationTranscribe:
                  handleProviderDictationTranscribe,
              }
            : {})}
        />
      </div>
    </div>
  );
});
