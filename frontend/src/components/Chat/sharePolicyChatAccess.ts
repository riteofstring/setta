import type { ChatSlashCommandDefinition } from "./chatComposerControls";

type ManagedChatShareAccess = {
  isDeploymentMode: boolean;
  allowLLM: boolean;
};

export function canUseManagedChatLLM({
  isDeploymentMode,
  allowLLM,
}: ManagedChatShareAccess): boolean {
  return !isDeploymentMode || allowLLM;
}

export function filterManagedChatThreadSlashCommands(
  slashCommands: ChatSlashCommandDefinition[],
  canUseManagedChat: boolean,
): ChatSlashCommandDefinition[] {
  if (canUseManagedChat) {
    return slashCommands;
  }
  return slashCommands.filter(
    (command) => command.action !== "new" && command.action !== "resume",
  );
}
