import {
  executeManagedChatSlashCommand,
  type ChatPermissionModeValue,
  type ChatSlashCommandDefinition,
} from "components/Chat/chatComposerControls";
import {
  resolveSlashCommandRequest,
  type ChatSlashCommand,
  type ChatSlashCommandResult,
} from "components/Chat/ChatInput";
import { loadAgentRuns } from "state/actions/ai/agentRuns";
import { type ProjectChatCustomSlashCommand } from "state/definitions";
import type { AppGenerationMode } from "state/types/appGenerationMode";
import { EngineTypeEnum, type AgentRun } from "utils/generatedTypes";
import {
  resolveProjectChatComposerExecutableNativeSlashCommandTokens,
  resolveProjectChatComposerNativeSlashCommandTokens,
  resolveProjectChatComposerSlashCommandSets,
  resolveProjectChatRuntimeNativeSlashCommandTokens,
} from "./projectChatRuntimeUtils";
import {
  isAgentRunsAuthorityReady,
  type AgentRunsAuthorityState,
} from "./projectChatSkillsMcpViewerUtils";

const CUSTOM_SLASH_COMMAND_AUTHORITY_LOADING_FEEDBACK =
  "Custom slash commands are unavailable until native command authority is loaded for this project.";
const NATIVE_SLASH_COMMANDS_RELOAD_FEEDBACK =
  "Native slash commands are unavailable until agent metadata reloads.";

type ProjectChatSlashCommandDependencies = {
  executeManagedChatSlashCommand?: typeof executeManagedChatSlashCommand;
  loadAgentRuns?: typeof loadAgentRuns;
  resolveSlashCommandRequest?: typeof resolveSlashCommandRequest;
  isAgentRunsAuthorityReady?: typeof isAgentRunsAuthorityReady;
};

type ProjectChatSlashCommandAuthoritySnapshot = {
  agentRuns: AgentRun[];
  agentRunsAuthorityState: AgentRunsAuthorityState;
};

export function resolveProjectChatSlashCommandState({
  agentRuns,
  agentRunsAuthorityState,
  projectConfigId,
  engineConfigId,
  engineType,
  customProjectChatSlashCommands,
  isExternalEngine,
  showPermissionExecutionControl,
  showSearchExecutionControl,
}: {
  agentRuns: AgentRun[];
  agentRunsAuthorityState: AgentRunsAuthorityState;
  projectConfigId: string;
  engineConfigId: string | null;
  engineType: EngineTypeEnum | null;
  customProjectChatSlashCommands: ProjectChatCustomSlashCommand[];
  isExternalEngine: boolean;
  showPermissionExecutionControl: boolean;
  showSearchExecutionControl: boolean;
}): {
  slashCommands: ChatSlashCommandDefinition[];
  recognizedSlashCommands: ChatSlashCommandDefinition[];
} {
  const runtimeNativeSlashCommandTokens =
    resolveProjectChatRuntimeNativeSlashCommandTokens({
      runs: agentRuns,
      projectConfigId,
      engineConfigId,
      engineType,
    });
  const customCommandsExecutable =
    !isExternalEngine || isAgentRunsAuthorityReady(agentRunsAuthorityState);
  const discoveredAgentNativeSlashCommands =
    resolveProjectChatComposerNativeSlashCommandTokens({
      runtimeNativeSlashCommandTokens,
      agentRunsAuthorityState,
    });
  const executableAgentNativeSlashCommands =
    resolveProjectChatComposerExecutableNativeSlashCommandTokens({
      runtimeNativeSlashCommandTokens,
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
}

export async function executeProjectChatSlashCommand({
  command,
  slashCommands,
  onStartNewChat,
  onResumeLatestChat,
  onSetPermissionMode,
  searchEnabled,
  onSetSearchEnabled,
  appGenerationMode,
  onSetAppGenerationMode,
  dependencies = {},
}: {
  command: ChatSlashCommand;
  slashCommands: ChatSlashCommandDefinition[];
  onStartNewChat: () => void;
  onResumeLatestChat: () => Promise<boolean>;
  onSetPermissionMode: (nextPermissionMode: ChatPermissionModeValue) => void;
  searchEnabled: boolean;
  onSetSearchEnabled: (nextValue: boolean) => void;
  appGenerationMode: AppGenerationMode;
  onSetAppGenerationMode: (nextMode: AppGenerationMode) => void;
  dependencies?: ProjectChatSlashCommandDependencies;
}): Promise<ChatSlashCommandResult> {
  const executeManagedSlashCommand =
    dependencies.executeManagedChatSlashCommand ??
    executeManagedChatSlashCommand;
  return executeManagedSlashCommand({
    command,
    slashCommands,
    onStartNewChat,
    onResumeLatestChat,
    resumeFeedback: {
      success: "Resumed the latest project chat.",
      notFound: "No previous project chat found to resume.",
    },
    onSetPermissionMode,
    modelFeedback: "Use the model selector in the Project AI Chat toolbar.",
    searchEnabled,
    onSetSearchEnabled,
    appGenerationMode,
    onSetAppGenerationMode,
  });
}

export async function handleUnknownProjectChatSlashCommand({
  message,
  isExternalEngine,
  agentRunsAuthorityState,
  getRefreshedState,
  resolveSlashCommandState,
  dependencies = {},
}: {
  message: string;
  isExternalEngine: boolean;
  agentRunsAuthorityState: AgentRunsAuthorityState;
  getRefreshedState: () => ProjectChatSlashCommandAuthoritySnapshot;
  resolveSlashCommandState: (
    refreshedState: ProjectChatSlashCommandAuthoritySnapshot,
  ) => {
    slashCommands: ChatSlashCommandDefinition[];
    recognizedSlashCommands: ChatSlashCommandDefinition[];
  };
  dependencies?: ProjectChatSlashCommandDependencies;
}): Promise<ChatSlashCommandResult> {
  const loadRuns = dependencies.loadAgentRuns ?? loadAgentRuns;
  const resolveRequest =
    dependencies.resolveSlashCommandRequest ?? resolveSlashCommandRequest;
  const isAuthorityReady =
    dependencies.isAgentRunsAuthorityReady ?? isAgentRunsAuthorityReady;
  if (!isExternalEngine || isAuthorityReady(agentRunsAuthorityState)) {
    return false;
  }
  await loadRuns();
  const refreshedState = getRefreshedState();
  const refreshedSlashCommandState = resolveSlashCommandState(refreshedState);
  const refreshedRequest = resolveRequest({
    message,
    slashCommands: refreshedSlashCommandState.slashCommands,
    recognizedSlashCommands: refreshedSlashCommandState.recognizedSlashCommands,
  });
  if (!isAuthorityReady(refreshedState.agentRunsAuthorityState)) {
    return {
      handled: true,
      feedback: NATIVE_SLASH_COMMANDS_RELOAD_FEEDBACK,
      keepInput: true,
    };
  }
  if (refreshedRequest.parsed) {
    return {
      refreshedSlashCommands: refreshedSlashCommandState.slashCommands,
      refreshedRecognizedSlashCommands:
        refreshedSlashCommandState.recognizedSlashCommands,
    };
  }
  return false;
}
