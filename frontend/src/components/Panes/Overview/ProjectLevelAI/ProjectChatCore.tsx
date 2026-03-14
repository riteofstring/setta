import {
  createManagedExecutionControlHandlers,
  type ChatPermissionModeValue,
  type ManagedChatExecutionSettings,
} from "components/Chat/chatComposerControls";
import {
  type ChatSlashCommand,
  type ChatSlashCommandResult,
} from "components/Chat/ChatInput";
import {
  Dispatch,
  SetStateAction,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
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
import { ProjectChatConversationSurface } from "./ProjectChatConversationSurface";
import {
  buildProjectChatSubmittedMessageHistory,
  filterProjectConversationMessagesBySearch,
} from "./projectChatHistoryUtils";
import {
  resolveProjectChatRunTypeForEngine,
  type ProjectChatHydrationAuthority,
} from "./projectChatHydrationAuthority";
import { useProjectChatRuntimeController } from "./projectChatRuntimeController";
import {
  getDefaultProjectChatPermissionMode,
  resolveProjectChatContextTelemetry,
  type ProjectChatBlockedErrorCode,
} from "./projectChatRuntimeUtils";
import { type AgentRunsAuthorityState } from "./projectChatSkillsMcpViewerUtils";
import {
  executeProjectChatSlashCommand,
  handleUnknownProjectChatSlashCommand,
  resolveProjectChatSlashCommandState,
} from "./projectChatSlashCommands";
import { selectCustomProjectChatSlashCommands } from "./projectChatSlashCommandSelectors";
import { useProjectChatStarterPrompts } from "./projectChatStarterPromptState";
import {
  resumeLatestProjectChat,
  selectProjectChatThread,
  settleProjectChatThreadStart,
  startProjectChatThread,
} from "./projectChatThreadController";
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
  const visibleStarterPrompts = useProjectChatStarterPrompts({
    enabled: showEmptyState,
    projectConfigId,
  });
  const isExternalEngine = engineType === EngineTypeEnum.external_agent;
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
  const canConfigureExecutionSettings =
    Boolean(engineConfigId) &&
    (isExternalEngine ? externalEngineAvailable : hasLLMConfig);
  const showPermissionExecutionControl = canConfigureExecutionSettings;
  const showSearchExecutionControl = false;
  const agentRunsAuthorityState = useAIStore(
    (state) => state.agentRunsAuthorityState,
  );
  const resolveSlashCommandState = useCallback(
    (state: {
      agentRuns: AgentRun[];
      agentRunsAuthorityState: AgentRunsAuthorityState;
    }) =>
      resolveProjectChatSlashCommandState({
        agentRuns: state.agentRuns,
        agentRunsAuthorityState: state.agentRunsAuthorityState,
        projectConfigId,
        engineConfigId,
        engineType,
        customProjectChatSlashCommands,
        isExternalEngine,
        showPermissionExecutionControl,
        showSearchExecutionControl,
      }),
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
  const { slashCommands, recognizedSlashCommands } = useMemo(() => {
    return resolveSlashCommandState({
      agentRuns,
      agentRunsAuthorityState,
    });
  }, [agentRuns, agentRunsAuthorityState, resolveSlashCommandState]);
  const { blockedReason, lastChatIdRef } = useProjectChatRuntimeController({
    chatId,
    projectConfigId,
    hydrationAuthority,
    hydrationMetadataRevision,
    waitingForResponse,
    pendingPrompt,
    setDraftMessage,
    agentRunsInitialLoadComplete,
    onBlockedErrorCodeChange,
  });

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

  const handleSlashCommand = useCallback(
    async (command: ChatSlashCommand): Promise<ChatSlashCommandResult> => {
      return executeProjectChatSlashCommand({
        command,
        slashCommands,
        onStartNewChat: handleNewChatStart,
        onResumeLatestChat: handleResumeLatestChat,
        onSetPermissionMode: executionControlHandlers.onPermissionModeChange,
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
      return handleUnknownProjectChatSlashCommand({
        message,
        isExternalEngine,
        agentRunsAuthorityState,
        getRefreshedState: () => {
          const refreshedState = useAIStore.getState();
          return {
            agentRuns: refreshedState.agentRuns,
            agentRunsAuthorityState: refreshedState.agentRunsAuthorityState,
          };
        },
        resolveSlashCommandState,
      });
    },
    [agentRunsAuthorityState, isExternalEngine, resolveSlashCommandState],
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
  const handleStarterPrompt = useCallback(
    (prompt: string) => {
      void handleSubmit(prompt, []);
    },
    [handleSubmit],
  );
  const messageListProps = useMemo(
    () => ({
      messages: filteredConversationMessages,
      allMessagesForToolResults: messages,
      waitingForResponse,
      toolCallArguments,
      interruptedAssistantMessageIds,
      activeSearchMessageId: activeConversationSearchMatchMessageId,
      editDisabledReason,
      onRedoMessage: handleRedoMessage,
      onEditMessage: handleEditMessage,
      onBranchSwitch: handleBranchSwitch,
      branchInfoByMessage,
    }),
    [
      activeConversationSearchMatchMessageId,
      branchInfoByMessage,
      editDisabledReason,
      filteredConversationMessages,
      handleBranchSwitch,
      handleEditMessage,
      handleRedoMessage,
      interruptedAssistantMessageIds,
      messages,
      toolCallArguments,
      waitingForResponse,
    ],
  );
  const chatInputProps = useMemo(
    () => ({
      placeholderText,
      waitingForResponse,
      submitDisabled,
      disabled: isDisabled,
      value: draftMessage,
      onChange: setDraftMessage,
      onSubmit: handleSubmit,
      onStop: handleStop,
      slashCommands,
      recognizedSlashCommands,
      onSlashCommand: handleSlashCommand,
      onUnknownSlashCommand: handleUnknownSlashCommand,
      executionControls,
      executionControlVisibility: {
        permissionMode: showPermissionExecutionControl,
        search: showSearchExecutionControl,
      },
      dictationMode,
      dictationEnabledByProvider: providerDictationAvailable,
      providerDictationLikelySupported,
      contextWindowTokens,
      contextUsedTokens,
      contextUsageIsEstimated,
      contextUsageUnavailable: chatInputContextUsageUnavailable,
      submittedMessageHistory,
      runtimeActivityCounts,
      runtimeActivityDetails,
      onProviderDictationTranscribe: !providerDictationTranscribeEnabled
        ? undefined
        : handleProviderDictationTranscribe,
    }),
    [
      chatInputContextUsageUnavailable,
      contextUsageIsEstimated,
      contextUsedTokens,
      contextWindowTokens,
      dictationMode,
      draftMessage,
      executionControls,
      handleProviderDictationTranscribe,
      handleSlashCommand,
      handleStop,
      handleSubmit,
      handleUnknownSlashCommand,
      isDisabled,
      placeholderText,
      providerDictationAvailable,
      providerDictationLikelySupported,
      providerDictationTranscribeEnabled,
      recognizedSlashCommands,
      runtimeActivityCounts,
      runtimeActivityDetails,
      setDraftMessage,
      showPermissionExecutionControl,
      showSearchExecutionControl,
      slashCommands,
      submitDisabled,
      submittedMessageHistory,
      waitingForResponse,
    ],
  );

  return (
    <ProjectChatConversationSurface
      blockedReason={blockedReason}
      showEmptyState={showEmptyState}
      showConversationSearchEmptyState={showConversationSearchEmptyState}
      visibleStarterPrompts={visibleStarterPrompts}
      isDisabled={isDisabled}
      onStarterPrompt={handleStarterPrompt}
      messageListProps={messageListProps}
      chatInputProps={chatInputProps}
    />
  );
});
