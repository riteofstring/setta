import { type ChatPermissionModeValue } from "components/Chat/chatComposerControls";
import { Dispatch, SetStateAction, memo, useCallback, useMemo } from "react";
import { getDefaultChatDetails } from "state/actions/ai/chatRuntime";
import {
  useAIStore,
  useLocalStorage,
  useProjectState,
  type ProjectChatCustomSlashCommand,
} from "state/definitions";
import { useChatBranchIndex } from "state/hooks/useChatBranchIndex";
import type { AppGenerationMode } from "state/types/appGenerationMode";
import { EngineTypeEnum } from "utils/generatedTypes";
import { shallow } from "zustand/shallow";
import { createProjectChatComposerController } from "./projectChatComposerController";
import { resolveProjectChatComposerDerivedState } from "./projectChatComposerState";
import { ProjectChatConversationSurface } from "./ProjectChatConversationSurface";
import {
  buildProjectChatInputProps,
  buildProjectChatMessageListProps,
} from "./projectChatConversationSurfaceState";
import { resolveProjectChatConversationViewModel } from "./projectChatConversationViewModel";
import { useProjectChatExecutionControls } from "./projectChatExecutionControls";
import { type ProjectChatHydrationAuthority } from "./projectChatHydrationAuthority";
import { useProjectChatRuntimeController } from "./projectChatRuntimeController";
import {
  resolveProjectChatContextTelemetry,
  type ProjectChatBlockedErrorCode,
} from "./projectChatRuntimeUtils";
import { selectCustomProjectChatSlashCommands } from "./projectChatSlashCommandSelectors";
import { useProjectChatStarterPrompts } from "./projectChatStarterPromptState";

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
  const projectConfigId = useProjectState((state) => state.projectConfig.id);
  const appGenerationMode = useLocalStorage((state) => state.appGenerationMode);
  const customProjectChatSlashCommands = useLocalStorage(
    (state): ProjectChatCustomSlashCommand[] =>
      selectCustomProjectChatSlashCommands(
        state.customProjectChatSlashCommandsByProjectConfigId,
        projectConfigId,
      ),
  );
  const {
    showEmptyState,
    normalizedConversationSearchTerms,
    filteredConversationMessages,
    hasVisibleConversationMatches,
    branchInfoByMessage,
    submittedMessageHistory,
    historyCompatibility,
    isExternalEngine,
  } = useMemo(
    () =>
      resolveProjectChatConversationViewModel({
        chatId,
        messages,
        branchIndex,
        conversationFilterText,
        agentRuns,
        projectConfigId,
        engineType,
        engineConfigId,
      }),
    [
      agentRuns,
      branchIndex,
      chatId,
      conversationFilterText,
      engineConfigId,
      engineType,
      messages,
      projectConfigId,
    ],
  );
  const visibleStarterPrompts = useProjectChatStarterPrompts({
    enabled: showEmptyState,
    projectConfigId,
  });
  const {
    contextWindowTokens,
    contextUsedTokens,
    contextUsageIsEstimated,
    contextUsageUnavailable,
  } = useMemo(
    () => resolveProjectChatContextTelemetry(contextUsage),
    [contextUsage],
  );
  const {
    executionSettings,
    executionControlHandlers,
    showPermissionExecutionControl,
    showSearchExecutionControl,
  } = useProjectChatExecutionControls({
    engineType,
    engineConfigId,
    isExternalEngine,
    externalEngineAvailable,
    hasLLMConfig,
    onPermissionModeChange,
  });
  const agentRunsAuthorityState = useAIStore(
    (state) => state.agentRunsAuthorityState,
  );
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

  const handleSetAppGenerationMode = useCallback(
    (nextMode: AppGenerationMode) => {
      useLocalStorage.setState({
        appGenerationMode: nextMode,
      });
    },
    [],
  );
  const readAgentRunsState = useCallback(() => {
    const state = useAIStore.getState();
    return {
      agentRuns: state.agentRuns,
      agentRunsAuthorityState: state.agentRunsAuthorityState,
    };
  }, []);
  const {
    slashCommands,
    recognizedSlashCommands,
    handleSlashCommand,
    handleUnknownSlashCommand,
    handleSubmit,
    handleStop,
    handleEditMessage,
    handleBranchSwitch,
    handleRedoMessage,
    handleProviderDictationTranscribe,
    handleStarterPrompt,
  } = useMemo(
    () =>
      createProjectChatComposerController({
        chatId,
        surfaceId,
        projectConfigId,
        historyCompatibility,
        appGenerationMode,
        engineConfigId,
        engineType,
        isExternalEngine,
        externalEngineAvailable,
        hasLLMConfig,
        requiresNewThreadContinuation,
        newThreadSeedChatId,
        waitingForResponse,
        thinking,
        messages,
        executionSettings,
        executionControlHandlers,
        customProjectChatSlashCommands,
        showPermissionExecutionControl,
        showSearchExecutionControl,
        transcriptionProfileId,
        agentRuns,
        agentRunsAuthorityState,
        setChatId,
        onStartNewChat,
        onDraftThreadStart,
        onDraftThreadSettled,
        lastChatIdRef,
        getAgentRunsState: readAgentRunsState,
        setAppGenerationMode: handleSetAppGenerationMode,
      }),
    [
      agentRuns,
      agentRunsAuthorityState,
      appGenerationMode,
      chatId,
      customProjectChatSlashCommands,
      engineConfigId,
      engineType,
      executionControlHandlers.onPermissionModeChange,
      executionControlHandlers.onSearchEnabledChange,
      executionSettings.permissionMode,
      executionSettings.searchEnabled,
      externalEngineAvailable,
      handleSetAppGenerationMode,
      hasLLMConfig,
      historyCompatibility,
      isExternalEngine,
      lastChatIdRef,
      messages,
      newThreadSeedChatId,
      onDraftThreadSettled,
      onDraftThreadStart,
      onStartNewChat,
      projectConfigId,
      readAgentRunsState,
      requiresNewThreadContinuation,
      setChatId,
      showPermissionExecutionControl,
      showSearchExecutionControl,
      surfaceId,
      thinking,
      transcriptionProfileId,
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
  const messageListProps = useMemo(
    () =>
      buildProjectChatMessageListProps({
        filteredConversationMessages,
        messages,
        waitingForResponse,
        toolCallArguments,
        interruptedAssistantMessageIds,
        activeConversationSearchMatchMessageId,
        editDisabledReason,
        handleRedoMessage,
        handleEditMessage,
        handleBranchSwitch,
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
    () =>
      buildProjectChatInputProps({
        placeholderText,
        waitingForResponse,
        submitDisabled,
        isDisabled,
        draftMessage,
        setDraftMessage,
        handleSubmit,
        handleStop,
        slashCommands,
        recognizedSlashCommands,
        handleSlashCommand,
        handleUnknownSlashCommand,
        executionControls,
        showPermissionExecutionControl,
        showSearchExecutionControl,
        dictationMode,
        providerDictationAvailable,
        providerDictationLikelySupported,
        contextWindowTokens,
        contextUsedTokens,
        contextUsageIsEstimated,
        chatInputContextUsageUnavailable,
        submittedMessageHistory,
        runtimeActivityCounts,
        runtimeActivityDetails,
        providerDictationTranscribeEnabled,
        handleProviderDictationTranscribe,
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
