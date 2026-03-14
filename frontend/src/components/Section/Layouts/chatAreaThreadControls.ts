import {
  formatSlashCommandHelp,
  type ChatSlashCommandDefinition,
} from "components/Chat/chatComposerControls";
import type {
  ChatSlashCommand,
  ChatSlashCommandResult,
} from "components/Chat/ChatInput";

export function buildManagedZeroScopeBannerSessionKey(
  projectConfigId: string,
  sectionId: string,
): string {
  return `setta:managed-zero-scope-banner-dismissed:${projectConfigId}:${sectionId}`;
}

export async function executeSectionChatSlashCommand({
  command,
  canUseManagedChat,
  slashCommands,
  onStartNewChat,
  onResumeLatestChat,
}: {
  command: ChatSlashCommand;
  canUseManagedChat: boolean;
  slashCommands: ChatSlashCommandDefinition[];
  onStartNewChat: () => void;
  onResumeLatestChat: () => Promise<boolean>;
}): Promise<ChatSlashCommandResult> {
  if (
    !canUseManagedChat &&
    (command.action === "new" || command.action === "resume")
  ) {
    return {
      feedback: "Chat thread changes are disabled by share policy.",
      keepInput: true,
    };
  }
  if (command.action === "new") {
    onStartNewChat();
    return { feedback: "Started a new chat thread." };
  }
  if (command.action === "resume") {
    const resumed = await onResumeLatestChat();
    return resumed
      ? { feedback: "Resumed the latest section chat." }
      : {
          feedback: "No previous section chat found to resume.",
          keepInput: true,
        };
  }
  if (command.action === "help") {
    return {
      feedback: formatSlashCommandHelp(slashCommands),
    };
  }
  return false;
}
