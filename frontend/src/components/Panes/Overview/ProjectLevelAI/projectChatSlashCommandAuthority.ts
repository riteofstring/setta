import {
  buildChatSlashCommands,
  buildCustomPromptSlashCommandDefinitions,
  type ChatSlashCommandDefinition,
} from "components/Chat/chatComposerControls";
import type { ProjectChatCustomSlashCommand } from "state/definitions";
import { AgentRun, EngineTypeEnum } from "utils/generatedTypes";
import {
  buildReservedSlashCommandTokens,
  collectAgentNativeSlashCommandTokensFromEntries,
  isAgentRunsAuthorityReady,
  reconcileCustomSlashCommands,
  resolveAgentNativeSlashCommandsByEngineId,
  type AgentRunsAuthorityState,
} from "./projectChatSkillsMcpViewerUtils";

export const CUSTOM_SLASH_COMMAND_AUTHORITY_LOADING_FEEDBACK =
  "Custom slash commands are unavailable until native command authority is loaded for this project.";
export const NATIVE_SLASH_COMMANDS_RELOAD_FEEDBACK =
  "Native slash commands are unavailable until agent metadata reloads.";

export function resolveProjectChatComposerNativeSlashCommandTokens({
  runtimeNativeSlashCommandTokens,
  agentRunsAuthorityState,
}: {
  runtimeNativeSlashCommandTokens: string[];
  agentRunsAuthorityState: AgentRunsAuthorityState;
}): string[] {
  if (isAgentRunsAuthorityReady(agentRunsAuthorityState)) {
    return runtimeNativeSlashCommandTokens;
  }
  return [];
}

export function resolveProjectChatComposerExecutableNativeSlashCommandTokens({
  runtimeNativeSlashCommandTokens,
  agentRunsAuthorityState,
}: {
  runtimeNativeSlashCommandTokens: string[];
  agentRunsAuthorityState: AgentRunsAuthorityState;
}): string[] {
  if (!isAgentRunsAuthorityReady(agentRunsAuthorityState)) {
    return [];
  }
  return runtimeNativeSlashCommandTokens;
}

export function resolveProjectChatRuntimeNativeSlashCommandTokens({
  runs,
  projectConfigId,
  engineConfigId,
  engineType,
}: {
  runs: AgentRun[];
  projectConfigId: string;
  engineConfigId: string | null;
  engineType: EngineTypeEnum | null;
}): string[] {
  if (
    engineType !== EngineTypeEnum.external_agent ||
    typeof engineConfigId !== "string" ||
    engineConfigId.trim() === ""
  ) {
    return [];
  }
  return collectAgentNativeSlashCommandTokensFromEntries(
    resolveAgentNativeSlashCommandsByEngineId({
      runs,
      projectConfigId,
      engineConfigIds: [engineConfigId],
    }),
  );
}

export function resolveProjectChatComposerSlashCommandSets({
  customProjectChatSlashCommands,
  discoveredAgentNativeSlashCommands,
  executableAgentNativeSlashCommands = discoveredAgentNativeSlashCommands,
  customCommandsExecutable = true,
  customCommandUnavailableFeedback = null,
  showPermissionExecutionControl,
  showSearchExecutionControl,
}: {
  customProjectChatSlashCommands: ProjectChatCustomSlashCommand[];
  discoveredAgentNativeSlashCommands: string[];
  executableAgentNativeSlashCommands?: string[];
  customCommandsExecutable?: boolean;
  customCommandUnavailableFeedback?: string | null;
  showPermissionExecutionControl: boolean;
  showSearchExecutionControl: boolean;
}): {
  slashCommands: ChatSlashCommandDefinition[];
  recognizedSlashCommands: ChatSlashCommandDefinition[];
} {
  const managedCommands = buildChatSlashCommands({
    model: true,
    permissions: showPermissionExecutionControl,
    search: showSearchExecutionControl,
    appGenerationModes: true,
  });
  const globallyReservedManagedCommands = buildChatSlashCommands({
    model: true,
    permissions: true,
    search: true,
    appGenerationModes: true,
  });
  const customCommandDefinitions = buildCustomPromptSlashCommandDefinitions(
    customProjectChatSlashCommands,
  );
  const reservedCommandSet = buildReservedSlashCommandTokens({
    managedCommands: globallyReservedManagedCommands,
    engineCommandGroups: [],
    discoveredNativeSlashCommands: discoveredAgentNativeSlashCommands,
  });
  const { executableCommands: customCommands } = reconcileCustomSlashCommands({
    customCommands: customCommandDefinitions,
    reservedTokens: reservedCommandSet,
  });
  const nativeCommands: ChatSlashCommandDefinition[] = [];
  const recognizedCommands: ChatSlashCommandDefinition[] = [
    ...globallyReservedManagedCommands,
  ];
  const recognizedCustomCommands = customCommandsExecutable
    ? customCommandDefinitions
    : customCommandDefinitions.map((command) => ({
        ...command,
        unavailableFeedback:
          customCommandUnavailableFeedback ??
          `${command.command} is unavailable in the current context. Use /help.`,
      }));
  const globallyReservedManagedCommandTokens = new Set(
    globallyReservedManagedCommands.map((entry) => entry.command),
  );
  const nativeCommandTokens = new Set<string>();
  const recognizedCommandTokens = new Set(
    recognizedCommands.map((entry) => entry.command),
  );
  for (const token of discoveredAgentNativeSlashCommands) {
    if (recognizedCommandTokens.has(token)) {
      continue;
    }
    recognizedCommandTokens.add(token);
    recognizedCommands.push({
      command: token,
      action: "native_prompt",
      appGenerationMode: null,
      summary: "Submit this native external-agent command verbatim.",
    });
  }
  for (const token of executableAgentNativeSlashCommands) {
    if (
      nativeCommandTokens.has(token) ||
      globallyReservedManagedCommandTokens.has(token)
    ) {
      continue;
    }
    nativeCommandTokens.add(token);
    nativeCommands.push({
      command: token,
      action: "native_prompt",
      appGenerationMode: null,
      summary: "Submit this native external-agent command verbatim.",
    });
  }
  for (const customCommand of recognizedCustomCommands) {
    if (recognizedCommandTokens.has(customCommand.command)) {
      continue;
    }
    recognizedCommandTokens.add(customCommand.command);
    recognizedCommands.push(customCommand);
  }
  return {
    slashCommands: [
      ...managedCommands,
      ...nativeCommands,
      ...(customCommandsExecutable ? customCommands : []),
    ],
    recognizedSlashCommands: recognizedCommands,
  };
}
