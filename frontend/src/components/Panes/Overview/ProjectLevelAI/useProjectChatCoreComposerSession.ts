import {
  createManagedExecutionControlHandlers,
  executeManagedChatSlashCommand,
  type ChatPermissionModeValue,
  type ManagedChatExecutionSettings,
} from "components/Chat/chatComposerControls";
import { getChatEditDisabledReason } from "components/Chat/chatEditUtils";
import {
  resolveSlashCommandRequest,
  type ChatSlashCommand,
  type ChatSlashCommandResult,
  type ChatSubmitOptions,
} from "components/Chat/chatInputSubmission";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { loadAgentRuns } from "state/actions/aiAgentRuns";
import { stopProjectChatResponse } from "state/actions/aiChatControls";
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
  type ProjectChatCustomSlashCommand,
} from "state/definitions";
import { useLocalStorage } from "state/stores/uiPreferenceStores";
import {
  resolveChatAppGenerationContextFromMessageState,
  type ChatAppGenerationContext,
  type ChatAppGenerationMessageState,
} from "state/utils/chatAppGenerationDetails";
import { hasPendingToolInteraction } from "utils/claudeTools";
import {
  EngineTypeEnum,
  type AgentRun,
  type BaseChatMessageUnion,
  type ChatFileAttachment,
} from "utils/generatedTypes";
import {
  buildProjectChatSubmittedMessageHistory,
  extractProjectChatUserPromptText,
  findBranchSourceUserMessage,
  getProjectChatMessageAttachments,
  toSortedProjectHistoryEntries,
} from "./projectChatConversationModel";
import {
  buildProjectChatSubmitReadinessKey,
  getDefaultProjectChatPermissionMode,
  resolveProjectChatProviderDictationTranscribeEnabled,
  resolveProjectChatSubmitAppGeneration,
  resolveProjectChatSubmitPreflightResult,
} from "./projectChatExecutionSettings";
import { resolveProjectChatRunTypeForEngine } from "./projectChatHydrationAuthority";
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

type ChatExecutionSettings = ManagedChatExecutionSettings;

type ResolveProjectChatCoreExecutionSettingsForEngineTypeInput = {
  current: ChatExecutionSettings;
  isExternalEngine: boolean;
};

type ResolveProjectChatCoreSettledChatIdInput = {
  currentChatId: string | null | undefined;
  newChatId: string | null;
  succeeded: boolean;
};

type ResolveProjectChatCoreDraftMessageAfterPendingPromptInput = {
  currentDraftMessage: string;
  pendingPrompt: string | null;
};

type UseProjectChatCoreComposerSessionInput = {
  activeAppGeneration: ChatAppGenerationContext | null;
  appGenerationByMessageId: Record<string, ChatAppGenerationMessageState>;
  chatId: string | null | undefined;
  draftMessage: string;
  engineConfigId: string | null;
  engineType: EngineTypeEnum | null;
  externalEngineAvailable: boolean;
  hasLLMConfig: boolean;
  isExternalEngine: boolean;
  messages: BaseChatMessageUnion[];
  newThreadContinuationRequiredReason: string | null;
  newThreadSeedChatId: string | null;
  noLLMConfigsAvailable: boolean;
  onDraftThreadSettled?: (
    nextChatId: string | null,
    succeeded: boolean,
  ) => void;
  onDraftThreadStart?: () => void;
  onPermissionModeChange?: (
    nextPermissionMode: ChatPermissionModeValue,
  ) => void;
  onThinkingChange?: (nextThinking: boolean) => void;
  onStartNewChat?: () => void;
  projectConfigId: string;
  providerDictationAvailable: boolean;
  requiresNewThreadContinuation: boolean;
  setChatId: Dispatch<SetStateAction<string | null | undefined>>;
  setDraftMessage: Dispatch<SetStateAction<string>>;
  surfaceId: string;
  thinking: boolean;
  transcriptionProfileId: string | null;
  waitingForResponse: boolean;
};

// Owns ProjectChatCore composer execution settings, slash-command refresh,
// pending prompt adoption, and submit/edit/redo command handling.

export function resolveProjectChatCoreExecutionSettingsForEngineType({
  current,
  isExternalEngine,
}: ResolveProjectChatCoreExecutionSettingsForEngineTypeInput): ChatExecutionSettings | null {
  if (!isExternalEngine) {
    if (current.permissionMode !== "config_toml_custom") {
      return null;
    }
    return {
      permissionMode: getDefaultProjectChatPermissionMode(
        EngineTypeEnum.setta_llm,
      ),
      searchEnabled: current.searchEnabled,
    };
  }
  if (current.permissionMode !== "minimal") {
    return null;
  }
  return {
    permissionMode: "config_toml_custom",
    searchEnabled: current.searchEnabled,
  };
}

export function resolveProjectChatCoreSettledChatId({
  currentChatId,
  newChatId,
  succeeded,
}: ResolveProjectChatCoreSettledChatIdInput): string | null | undefined {
  if (!succeeded || !newChatId) {
    return currentChatId !== null ? currentChatId : undefined;
  }
  return newChatId;
}

export function resolveProjectChatCoreDraftMessageAfterPendingPrompt({
  currentDraftMessage,
  pendingPrompt,
}: ResolveProjectChatCoreDraftMessageAfterPendingPromptInput): string | null {
  if (!pendingPrompt) {
    return null;
  }
  if (currentDraftMessage.trim()) {
    return null;
  }
  return pendingPrompt;
}

export function useProjectChatCoreComposerSession({
  activeAppGeneration,
  appGenerationByMessageId,
  chatId,
  draftMessage,
  engineConfigId,
  engineType,
  externalEngineAvailable,
  hasLLMConfig,
  isExternalEngine,
  messages,
  newThreadContinuationRequiredReason,
  newThreadSeedChatId,
  noLLMConfigsAvailable,
  onDraftThreadSettled,
  onDraftThreadStart,
  onPermissionModeChange,
  onThinkingChange,
  onStartNewChat,
  projectConfigId,
  providerDictationAvailable,
  requiresNewThreadContinuation,
  setChatId,
  setDraftMessage,
  surfaceId,
  thinking,
  transcriptionProfileId,
  waitingForResponse,
}: UseProjectChatCoreComposerSessionInput) {
  const pendingPrompt = useAIStore((state) => state.pendingProjectChatPrompt);
  const agentRuns = useAIStore((state) => state.agentRuns);
  const agentRunsInitialLoadComplete = useAIStore(
    (state) => state.agentRunsInitialLoadComplete,
  );
  const agentRunsAuthorityState = useAIStore(
    (state) => state.agentRunsAuthorityState,
  );
  const customProjectChatSlashCommands = useLocalStorage(
    (state): ProjectChatCustomSlashCommand[] =>
      selectCustomProjectChatSlashCommands(
        state.customProjectChatSlashCommandsByProjectConfigId,
        projectConfigId,
      ),
  );
  const [executionSettings, setExecutionSettings] =
    useState<ChatExecutionSettings>(() => ({
      permissionMode: getDefaultProjectChatPermissionMode(engineType),
      searchEnabled: true,
    }));
  const showPermissionExecutionControl =
    Boolean(engineConfigId) &&
    (isExternalEngine ? externalEngineAvailable : hasLLMConfig);
  const showSearchExecutionControl = false;
  const submittedMessageHistory = useMemo(
    () =>
      buildProjectChatSubmittedMessageHistory({
        runs: agentRuns,
        projectConfigId,
        activeMessages: messages,
      }),
    [agentRuns, messages, projectConfigId],
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
  const runtimeAgentNativeSlashCommandTokens = useMemo(
    () =>
      resolveProjectChatRuntimeNativeSlashCommandTokens({
        runs: agentRuns,
        projectConfigId,
        engineConfigId,
        engineType,
      }),
    [agentRuns, engineConfigId, engineType, projectConfigId],
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
    const nextDraftMessage =
      resolveProjectChatCoreDraftMessageAfterPendingPrompt({
        currentDraftMessage: draftMessage,
        pendingPrompt,
      });
    if (nextDraftMessage === null) {
      return;
    }
    setDraftMessage(nextDraftMessage);
    useAIStore.setState({ pendingProjectChatPrompt: null });
  }, [draftMessage, pendingPrompt, setDraftMessage]);

  useEffect(() => {
    setExecutionSettings((current) => {
      const nextSettings = resolveProjectChatCoreExecutionSettingsForEngineType(
        {
          current,
          isExternalEngine,
        },
      );
      return nextSettings ?? current;
    });
  }, [isExternalEngine]);

  useEffect(() => {
    if (!onPermissionModeChange) {
      return;
    }
    onPermissionModeChange(executionSettings.permissionMode);
  }, [executionSettings.permissionMode, onPermissionModeChange]);

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
        setChatId((currentChatId) =>
          resolveProjectChatCoreSettledChatId({
            currentChatId,
            newChatId,
            succeeded,
          }),
        );
        return;
      }
      setChatId(newChatId);
      finalizePendingChatDetails(newChatId, surfaceId);
    },
    [onDraftThreadSettled, setChatId, surfaceId],
  );

  const executionControlHandlers = useMemo(
    () => createManagedExecutionControlHandlers(setExecutionSettings),
    [],
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
      activeAppGeneration,
      chatId,
      engineConfigId,
      executionSettings.permissionMode,
      executionSettings.searchEnabled,
      externalEngineAvailable,
      handleNewChatSettled,
      handleNewChatStart,
      hasLLMConfig,
      isExternalEngine,
      newThreadSeedChatId,
      requiresNewThreadContinuation,
      surfaceId,
      thinking,
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
      appGenerationByMessageId,
      chatId,
      engineConfigId,
      executionSettings.permissionMode,
      executionSettings.searchEnabled,
      externalEngineAvailable,
      isExternalEngine,
      messages,
      requiresNewThreadContinuation,
      setChatId,
      surfaceId,
      thinking,
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
      appGenerationByMessageId,
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
  const executionControls = useMemo(
    () => ({
      thinkingEnabled: thinking,
      onThinkingEnabledChange:
        engineType === EngineTypeEnum.setta_llm ||
        engineType === EngineTypeEnum.external_agent
          ? onThinkingChange
          : undefined,
      permissionMode: executionSettings.permissionMode,
      searchEnabled: executionSettings.searchEnabled,
      onPermissionModeChange: executionControlHandlers.onPermissionModeChange,
      onSearchEnabledChange: executionControlHandlers.onSearchEnabledChange,
    }),
    [
      engineType,
      executionSettings.permissionMode,
      executionSettings.searchEnabled,
      executionControlHandlers.onPermissionModeChange,
      executionControlHandlers.onSearchEnabledChange,
      onThinkingChange,
      thinking,
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
  const onProviderDictationTranscribe =
    !resolveProjectChatProviderDictationTranscribeEnabled({
      providerDictationAvailable,
    })
      ? undefined
      : handleProviderDictationTranscribe;
  const handleStarterPrompt = useCallback(
    (prompt: string) => {
      void handleSubmit(prompt, []);
    },
    [handleSubmit],
  );

  return {
    editDisabledReason,
    executionControls,
    executionControlVisibility: {
      permissionMode: showPermissionExecutionControl,
      search: showSearchExecutionControl,
    },
    handleBranchSwitch,
    handleEditMessage,
    handleRedoMessage,
    handleSlashCommand,
    handleStarterPrompt,
    handleStop,
    handleSubmit,
    handleUnknownSlashCommand,
    isDisabled,
    onProviderDictationTranscribe,
    recognizedSlashCommands,
    slashCommands,
    submitDisabled,
    submitReadinessKey,
    submittedMessageHistory,
  };
}
