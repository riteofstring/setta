import type { AppSubsystemChatSlashCommandDefinition } from "@setta/app-subsystem-frontend-sdk";
import {
  AppGenerationModeEnum,
  AppSubsystemChatUIConfig,
  type AppGenerationMode,
} from "./appSubsystemContracts";

const APP_SUBSYSTEM_APP_GENERATION_MODE_SET = new Set<AppGenerationMode>(
  Object.values(AppGenerationModeEnum),
);

type AppSubsystemCustomSlashCommandModeOption = {
  id: string;
  name: string;
};

const APP_SUBSYSTEM_IMAGE_REQUIRED_MODES = new Set<AppGenerationMode>(
  AppSubsystemChatUIConfig.customSlashCommandModeOptions
    .filter((option) => option.requiresImageAttachment)
    .map((option) => requireAppGenerationMode(option.value)),
);

function requireAppGenerationMode(value: string): AppGenerationMode {
  if (!APP_SUBSYSTEM_APP_GENERATION_MODE_SET.has(value as AppGenerationMode)) {
    throw new Error(
      `App subsystem chat UI config declared unsupported appGenerationMode ${JSON.stringify(value)}.`,
    );
  }
  return value as AppGenerationMode;
}

const APP_SUBSYSTEM_SLASH_COMMANDS: AppSubsystemChatSlashCommandDefinition[] =
  AppSubsystemChatUIConfig.slashCommands.map((entry) => ({
    command: entry.command,
    action: entry.action,
    summary: entry.summary,
    promptTemplate: entry.promptTemplate,
    appGenerationMode: requireAppGenerationMode(entry.appGenerationMode),
    requiresImageAttachment: doesAppSubsystemModeRequireImageAttachment(
      entry.appGenerationMode,
    ),
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

export function buildAppGenerationSlashCommandDefinitions(): AppSubsystemChatSlashCommandDefinition[] {
  return APP_SUBSYSTEM_SLASH_COMMANDS.map((entry) => ({ ...entry }));
}

export function getAppGenerationSlashCommandByAction(
  action: string,
): AppSubsystemChatSlashCommandDefinition | null {
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

export function doesAppSubsystemModeRequireImageAttachment(
  mode: string | null | undefined,
): boolean {
  return (
    typeof mode === "string" &&
    APP_SUBSYSTEM_IMAGE_REQUIRED_MODES.has(mode as AppGenerationMode)
  );
}
