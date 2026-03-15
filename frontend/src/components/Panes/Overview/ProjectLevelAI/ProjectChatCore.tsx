import { type ChatPermissionModeValue } from "components/Chat/chatComposerControls";
import { ChatInput } from "components/Chat/ChatInput";
import { ChatMessageList } from "components/Chat/ChatMessages";
import { Dispatch, SetStateAction, memo, useEffect, useMemo } from "react";
import { buildMessageBranchInfo } from "state/actions/aiBranches";
import { getDefaultChatDetails } from "state/actions/aiChatDetails";
import { useAIStore, useProjectState } from "state/definitions";
import { useChatBranchIndex } from "state/hooks/useChatBranchIndex";
import { getDefaultChatAppGenerationDetails } from "state/utils/chatAppGenerationDetails";
import { tokenizeConversationSearchQuery } from "utils/conversationSearch";
import { ChatRoleEnum, EngineTypeEnum } from "utils/generatedTypes";
import { shallow } from "zustand/shallow";
import {
  filterProjectConversationMessagesBySearch,
  hasRetainedImageAttachmentFromImageModeThread,
  resolveProjectChatContextTelemetry,
  resolveProjectChatRuntimeActivityDetails,
} from "./projectChatConversationModel";
import { ProjectChatEmptyState } from "./projectChatEmptyState";
import {
  getProjectChatBlockedReasonMessage,
  type ProjectChatBlockedErrorCode,
} from "./projectChatExecutionSettings";
import { type ProjectChatHydrationAuthority } from "./projectChatHydrationAuthority";
import { useProjectChatCoreComposerSession } from "./useProjectChatCoreComposerSession";
import { useProjectChatCoreHydrationSession } from "./useProjectChatCoreHydrationSession";

const DEFAULT_CHAT_APP_GENERATION_DETAILS =
  getDefaultChatAppGenerationDetails();

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
  const interruptedAssistantMessageIds = useAIStore((state) => {
    if (typeof chatId !== "string") {
      return {};
    }
    return state.interruptedAssistantMessageIdsByChatId[chatId] ?? {};
  }, shallow);
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
  const { blockedErrorCode } = useProjectChatCoreHydrationSession({
    chatId,
    hydrationAuthority,
    hydrationMetadataRevision,
    projectConfigId,
    waitingForResponse,
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
  const blockedReason = blockedErrorCode
    ? getProjectChatBlockedReasonMessage(blockedErrorCode)
    : null;
  useEffect(() => {
    onBlockedErrorCodeChange?.(blockedErrorCode);
  }, [blockedErrorCode, onBlockedErrorCodeChange]);
  const {
    editDisabledReason,
    executionControls,
    executionControlVisibility,
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
  } = useProjectChatCoreComposerSession({
    activeAppGeneration,
    appGenerationByMessageId,
    chatId,
    draftMessage,
    engineConfigId,
    engineType,
    externalEngineAvailable,
    hasLLMConfig,
    isExternalEngine: engineType === EngineTypeEnum.external_agent,
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
  });
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
            onStarterPrompt={handleStarterPrompt}
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
          executionControlVisibility={executionControlVisibility}
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
          onProviderDictationTranscribe={onProviderDictationTranscribe}
        />
      </div>
    </div>
  );
});
