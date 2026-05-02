import { type ChatSlashCommand } from "components/Chat/ChatInput";
import { useMemo } from "react";
import { type ProjectChatCustomSlashCommand } from "state/definitions";
import { type AgentRun, type EngineTypeEnum } from "utils/generatedTypes";
import {
  CUSTOM_SLASH_COMMAND_AUTHORITY_LOADING_FEEDBACK,
  resolveProjectChatComposerExecutableNativeSlashCommandTokens,
  resolveProjectChatComposerNativeSlashCommandTokens,
  resolveProjectChatComposerSlashCommandSets,
  resolveProjectChatRuntimeNativeSlashCommandTokens,
} from "../projectChatCoreUtils";
import { type AgentRunsAuthorityState } from "../projectChatSkillsMcpViewerUtils";

type UseProjectChatSlashCommandSetsArgs = {
  agentRuns: AgentRun[];
  projectConfigId: string;
  engineConfigId: string | null;
  engineType: EngineTypeEnum | null;
  agentRunsAuthorityState: AgentRunsAuthorityState;
  customProjectChatSlashCommands: ProjectChatCustomSlashCommand[];
  appGenerationSlashCommands: ChatSlashCommand[];
  customCommandsExecutable: boolean;
  showPermissionExecutionControl: boolean;
  showSearchExecutionControl: boolean;
};

export function useProjectChatSlashCommandSets({
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
}: UseProjectChatSlashCommandSetsArgs) {
  const runtimeAgentNativeSlashCommandTokens = useMemo(() => {
    return resolveProjectChatRuntimeNativeSlashCommandTokens({
      runs: agentRuns,
      projectConfigId,
      engineConfigId,
      engineType,
    });
  }, [agentRuns, engineConfigId, engineType, projectConfigId]);

  return useMemo(() => {
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
    appGenerationSlashCommands,
    customCommandsExecutable,
    customProjectChatSlashCommands,
    runtimeAgentNativeSlashCommandTokens,
    showPermissionExecutionControl,
    showSearchExecutionControl,
  ]);
}
