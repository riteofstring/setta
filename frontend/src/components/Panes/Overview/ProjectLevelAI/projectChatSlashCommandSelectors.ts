import type { ProjectChatCustomSlashCommand } from "state/definitions";

type SlashCommandByProjectConfigId = Record<
  string,
  Array<ProjectChatCustomSlashCommand>
>;

const EMPTY_CUSTOM_PROJECT_CHAT_SLASH_COMMANDS: Array<ProjectChatCustomSlashCommand> =
  [];
Object.freeze(EMPTY_CUSTOM_PROJECT_CHAT_SLASH_COMMANDS);

export function selectCustomProjectChatSlashCommands(
  slashCommandsByProjectConfigId: SlashCommandByProjectConfigId,
  projectConfigId: string,
): Array<ProjectChatCustomSlashCommand> {
  if (!(projectConfigId in slashCommandsByProjectConfigId)) {
    return EMPTY_CUSTOM_PROJECT_CHAT_SLASH_COMMANDS;
  }
  const selectedCommands = slashCommandsByProjectConfigId[projectConfigId];
  if (!selectedCommands) {
    return EMPTY_CUSTOM_PROJECT_CHAT_SLASH_COMMANDS;
  }
  return selectedCommands;
}
