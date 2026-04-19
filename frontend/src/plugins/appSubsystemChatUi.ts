import type { ChatSlashCommandDefinition } from "components/Chat/chatComposerControls";
import {
  parseAppGenerationMode,
  type AppGenerationMode,
} from "state/types/appGenerationMode";
import { AppSubsystemChatUIConfig } from "utils/generatedTypes";

type AppSubsystemCustomSlashCommandModeOption = {
  id: string;
  name: string;
};

function requireAppGenerationMode(value: string): AppGenerationMode {
  const mode = parseAppGenerationMode(value);
  if (!mode) {
    throw new Error(
      `App subsystem chat UI config declared unsupported appGenerationMode ${JSON.stringify(value)}.`,
    );
  }
  return mode;
}

const APP_SUBSYSTEM_SLASH_COMMANDS: ChatSlashCommandDefinition[] =
  AppSubsystemChatUIConfig.slashCommands.map((entry) => ({
    command: entry.command,
    action: entry.action,
    summary: entry.summary,
    promptTemplate: entry.promptTemplate,
    appGenerationMode: requireAppGenerationMode(entry.appGenerationMode),
  }));

export const APP_SUBSYSTEM_CUSTOM_SLASH_COMMAND_MODE_OPTIONS: AppSubsystemCustomSlashCommandModeOption[] =
  AppSubsystemChatUIConfig.customSlashCommandModeOptions.map((option) => ({
    id: option.value,
    name: option.label,
  }));

export const DEFAULT_APP_SUBSYSTEM_CUSTOM_SLASH_COMMAND_MODE =
  AppSubsystemChatUIConfig.defaultCustomSlashCommandMode;

if (
  !APP_SUBSYSTEM_CUSTOM_SLASH_COMMAND_MODE_OPTIONS.some(
    (option) => option.id === DEFAULT_APP_SUBSYSTEM_CUSTOM_SLASH_COMMAND_MODE,
  )
) {
  throw new Error(
    "App subsystem chat UI config defaultCustomSlashCommandMode is not present in customSlashCommandModeOptions.",
  );
}

export function buildAppGenerationSlashCommandDefinitions(): ChatSlashCommandDefinition[] {
  return APP_SUBSYSTEM_SLASH_COMMANDS.map((entry) => ({ ...entry }));
}

export function getAppGenerationSlashCommandByAction(
  action: string,
): ChatSlashCommandDefinition | null {
  return (
    APP_SUBSYSTEM_SLASH_COMMANDS.find((entry) => entry.action === action) ??
    null
  );
}

export function resolveAppGenerationModeForSlashAction(
  action: string,
): AppGenerationMode | null {
  const mode = getAppGenerationSlashCommandByAction(action)?.appGenerationMode;
  return mode ?? null;
}
