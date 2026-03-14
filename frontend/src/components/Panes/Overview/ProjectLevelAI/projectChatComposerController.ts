import {
  type ChatPermissionModeValue,
  type ManagedChatExecutionSettings,
} from "components/Chat/chatComposerControls";
import {
  type ChatSlashCommand,
  type ChatSlashCommandResult,
} from "components/Chat/ChatInput";
import { type MutableRefObject } from "react";
import { type ChatHistoryCompatibility } from "state/actions/chatHistory";
import { type ProjectChatCustomSlashCommand } from "state/definitions";
import type { AppGenerationMode } from "state/types/appGenerationMode";
import {
  type AgentRun,
  type BaseChatMessageUnion,
  type ChatFileAttachment,
  EngineTypeEnum,
} from "utils/generatedTypes";
import {
  editProjectChatComposerMessage,
  redoProjectChatComposerMessage,
  stopProjectChatComposerResponse,
  submitProjectChatComposerMessage,
  transcribeProjectChatComposerAudio,
} from "./projectChatComposerRuntime";
import { type AgentRunsAuthorityState } from "./projectChatSkillsMcpViewerUtils";
import {
  executeProjectChatSlashCommand,
  handleUnknownProjectChatSlashCommand,
  resolveProjectChatSlashCommandState,
} from "./projectChatSlashCommands";
import {
  type ProjectChatIdUpdate,
  resumeLatestProjectChat,
  selectProjectChatThread,
  settleProjectChatThreadStart,
  startProjectChatThread,
} from "./projectChatThreadController";

type ProjectChatExecutionControlHandlers = {
  onPermissionModeChange: (nextMode: ChatPermissionModeValue) => void;
  onSearchEnabledChange: (nextValue: boolean) => void;
};

type ProjectChatAgentRunsState = {
  agentRuns: AgentRun[];
  agentRunsAuthorityState: AgentRunsAuthorityState;
};

export type ProjectChatComposerController = ReturnType<
  typeof createProjectChatComposerController
>;

export function createProjectChatComposerController({
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
  getAgentRunsState,
  setAppGenerationMode,
}: {
  chatId: string | null | undefined;
  surfaceId: string;
  projectConfigId: string;
  historyCompatibility: ChatHistoryCompatibility | null;
  appGenerationMode: AppGenerationMode;
  engineConfigId: string | null;
  engineType: EngineTypeEnum | null;
  isExternalEngine: boolean;
  externalEngineAvailable: boolean;
  hasLLMConfig: boolean;
  requiresNewThreadContinuation: boolean;
  newThreadSeedChatId: string | null;
  waitingForResponse: boolean;
  thinking: boolean;
  messages: Array<BaseChatMessageUnion>;
  executionSettings: ManagedChatExecutionSettings;
  executionControlHandlers: ProjectChatExecutionControlHandlers;
  customProjectChatSlashCommands: ProjectChatCustomSlashCommand[];
  showPermissionExecutionControl: boolean;
  showSearchExecutionControl: boolean;
  transcriptionProfileId: string | null;
  agentRuns: AgentRun[];
  agentRunsAuthorityState: AgentRunsAuthorityState;
  setChatId: (nextChatId: ProjectChatIdUpdate) => void;
  onStartNewChat?: () => void;
  onDraftThreadStart?: () => void;
  onDraftThreadSettled?: (
    nextChatId: string | null,
    succeeded: boolean,
  ) => void;
  lastChatIdRef: MutableRefObject<string | null>;
  getAgentRunsState: () => ProjectChatAgentRunsState;
  setAppGenerationMode: (nextMode: AppGenerationMode) => void;
}) {
  const resolveSlashCommandState = (state: ProjectChatAgentRunsState) =>
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
    });
  const { slashCommands, recognizedSlashCommands } = resolveSlashCommandState({
    agentRuns,
    agentRunsAuthorityState,
  });

  const handleNewChatStart = () => {
    startProjectChatThread({
      chatId,
      surfaceId,
      onStartNewChat,
      onDraftThreadStart,
      setChatId,
    });
  };

  const handleNewChatSettled = (newChatId: string | null, succeeded: boolean) =>
    settleProjectChatThreadStart({
      newChatId,
      succeeded,
      surfaceId,
      onDraftThreadSettled,
      setChatId,
    });

  const handleResumeLatestChat = async (): Promise<boolean> => {
    return resumeLatestProjectChat({
      chatId: typeof chatId === "string" ? chatId : null,
      projectConfigId,
      historyCompatibility,
      agentRuns: getAgentRunsState().agentRuns,
      setChatId,
    });
  };

  const handleSlashCommand = async (
    command: ChatSlashCommand,
  ): Promise<ChatSlashCommandResult> => {
    return executeProjectChatSlashCommand({
      command,
      slashCommands,
      onStartNewChat: handleNewChatStart,
      onResumeLatestChat: handleResumeLatestChat,
      onSetPermissionMode: executionControlHandlers.onPermissionModeChange,
      searchEnabled: executionSettings.searchEnabled,
      onSetSearchEnabled: executionControlHandlers.onSearchEnabledChange,
      appGenerationMode,
      onSetAppGenerationMode: setAppGenerationMode,
    });
  };

  const handleUnknownSlashCommand = async (
    message: string,
  ): Promise<ChatSlashCommandResult> => {
    return handleUnknownProjectChatSlashCommand({
      message,
      isExternalEngine,
      agentRunsAuthorityState,
      getRefreshedState: getAgentRunsState,
      resolveSlashCommandState,
    });
  };

  const handleSubmit = (message: string, attachments: ChatFileAttachment[]) =>
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
    });

  const handleStop = () =>
    stopProjectChatComposerResponse({
      chatId,
      isExternalEngine,
      surfaceId,
    });

  const handleEditMessage = (
    messageId: string,
    text: string,
    attachments: ChatFileAttachment[],
  ) =>
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
    });

  const handleBranchSwitch = (nextChatId: string) => {
    selectProjectChatThread({
      nextChatId,
      chatId,
      setChatId,
    });
  };

  const handleRedoMessage = (assistantMessageId: string) =>
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
    });

  const handleProviderDictationTranscribe = (audioBlob: Blob) =>
    transcribeProjectChatComposerAudio({
      transcriptionProfileId,
      audioBlob,
    });

  const handleStarterPrompt = (prompt: string) => {
    void handleSubmit(prompt, []);
  };

  return {
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
  };
}
