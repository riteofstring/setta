import {
  buildCustomPromptSlashCommandDefinitions,
  normalizeSlashCommandToken,
  type ChatSlashCommandDefinition,
} from "components/Chat/chatComposerControls";
import type { ProjectChatCustomSlashCommand } from "state/definitions";
import type { AgentRun } from "utils/generatedTypes";

type AgentNativeSlashCommandsStatus =
  | "unknown"
  | "available"
  | "none"
  | "not_supported"
  | "error";

export type AgentNativeSlashCommandsEntry = {
  commands: string[];
  status: AgentNativeSlashCommandsStatus;
  statusDetail: string | null;
};

const EMPTY_AGENT_NATIVE_COMMANDS: string[] = [];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed;
}

function normalizeAgentNativeSlashCommandsStatus(
  rawStatus: unknown,
): AgentNativeSlashCommandsStatus {
  if (typeof rawStatus !== "string") {
    return "unknown";
  }
  switch (rawStatus.trim()) {
    case "available":
      return "available";
    case "none":
      return "none";
    case "not_supported":
      return "not_supported";
    case "error":
      return "error";
    default:
      return "unknown";
  }
}

function normalizeSlashCommandList(rawCommands: unknown): string[] {
  if (!Array.isArray(rawCommands)) {
    return EMPTY_AGENT_NATIVE_COMMANDS;
  }
  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const rawValue of rawCommands) {
    if (typeof rawValue !== "string") {
      continue;
    }
    const normalizedCommand = normalizeSlashCommandToken(rawValue);
    if (!normalizedCommand || seen.has(normalizedCommand)) {
      continue;
    }
    seen.add(normalizedCommand);
    normalized.push(normalizedCommand);
  }
  return normalized;
}

function extractAgentNativeSlashCommandsFromRun(
  run: AgentRun,
): { engineConfigId: string; entry: AgentNativeSlashCommandsEntry } | null {
  const outputs = run.outputs;
  if (!isRecord(outputs)) {
    return null;
  }
  const metadata = outputs.metadata;
  if (!isRecord(metadata)) {
    return null;
  }
  const rawEngineConfigId = metadata.engineConfigId;
  if (
    typeof rawEngineConfigId !== "string" ||
    rawEngineConfigId.trim() === ""
  ) {
    return null;
  }

  const hasCommandsField = Array.isArray(metadata.agentNativeSlashCommands);
  const commands = normalizeSlashCommandList(metadata.agentNativeSlashCommands);
  const status = normalizeAgentNativeSlashCommandsStatus(
    metadata.agentNativeSlashCommandsStatus,
  );
  const statusDetail = normalizeOptionalString(
    metadata.agentNativeSlashCommandsStatusDetail,
  );

  let resolvedStatus = status;
  if (commands.length > 0 && resolvedStatus === "unknown") {
    resolvedStatus = "available";
  } else if (hasCommandsField && resolvedStatus === "unknown") {
    resolvedStatus = "none";
  }

  if (
    commands.length === 0 &&
    resolvedStatus === "unknown" &&
    statusDetail === null
  ) {
    return null;
  }

  return {
    engineConfigId: rawEngineConfigId,
    entry: {
      commands,
      status: resolvedStatus,
      statusDetail,
    },
  };
}

function resolveRunUpdatedAtMs(run: AgentRun): number {
  const finishedAtMs = Date.parse(run.finishedAt);
  if (Number.isFinite(finishedAtMs)) {
    return finishedAtMs;
  }
  const startedAtMs = Date.parse(run.startedAt);
  if (Number.isFinite(startedAtMs)) {
    return startedAtMs;
  }
  return 0;
}

export function buildAgentNativeSlashCommandsByEngineId(
  agentRuns: AgentRun[],
): Record<string, AgentNativeSlashCommandsEntry> {
  const nextByEngineId: Record<string, AgentNativeSlashCommandsEntry> = {};
  const updatedAtByEngineId: Record<string, number> = {};

  for (const run of agentRuns) {
    const extracted = extractAgentNativeSlashCommandsFromRun(run);
    if (!extracted) {
      continue;
    }
    const engineId = extracted.engineConfigId;
    const updatedAtMs = resolveRunUpdatedAtMs(run);
    const existingUpdatedAtMs = updatedAtByEngineId[engineId];
    if (
      typeof existingUpdatedAtMs === "number" &&
      updatedAtMs < existingUpdatedAtMs
    ) {
      continue;
    }
    nextByEngineId[engineId] = extracted.entry;
    updatedAtByEngineId[engineId] = updatedAtMs;
  }

  return nextByEngineId;
}

export function filterAgentNativeSlashCommandsByEngineId(args: {
  agentNativeSlashCommandsByEngineId: Record<
    string,
    AgentNativeSlashCommandsEntry
  >;
  allowedEngineIds: string[];
}): Record<string, AgentNativeSlashCommandsEntry> {
  const allowedEngineIds = new Set(
    args.allowedEngineIds
      .map((engineId) => engineId.trim())
      .filter((engineId) => engineId !== ""),
  );
  const filtered: Record<string, AgentNativeSlashCommandsEntry> = {};
  for (const [engineId, entry] of Object.entries(
    args.agentNativeSlashCommandsByEngineId,
  )) {
    if (!allowedEngineIds.has(engineId)) {
      continue;
    }
    filtered[engineId] = entry;
  }
  return filtered;
}

export function buildReservedSlashCommandTokens(args: {
  managedSlashCommands: ChatSlashCommandDefinition[];
  slashCommandsByEngine: Array<{ commands: ChatSlashCommandDefinition[] }>;
  agentNativeSlashCommandsByEngineId: Record<
    string,
    AgentNativeSlashCommandsEntry
  >;
}): Set<string> {
  const reservedTokens = new Set<string>();

  for (const command of args.managedSlashCommands) {
    const normalizedCommand = normalizeSlashCommandToken(command.command);
    if (!normalizedCommand) {
      continue;
    }
    reservedTokens.add(normalizedCommand);
  }

  for (const engineCommands of args.slashCommandsByEngine) {
    for (const command of engineCommands.commands) {
      const normalizedCommand = normalizeSlashCommandToken(command.command);
      if (!normalizedCommand) {
        continue;
      }
      reservedTokens.add(normalizedCommand);
    }
  }

  for (const nativeEntry of Object.values(
    args.agentNativeSlashCommandsByEngineId,
  )) {
    for (const nativeCommand of nativeEntry.commands) {
      const normalizedCommand = normalizeSlashCommandToken(nativeCommand);
      if (!normalizedCommand) {
        continue;
      }
      reservedTokens.add(normalizedCommand);
    }
  }

  return reservedTokens;
}

export function resolveExecutableProjectChatCustomSlashCommands(args: {
  customSlashCommands: ProjectChatCustomSlashCommand[];
  reservedSlashCommandTokens: Set<string>;
}): {
  executableCustomSlashCommandDefinitions: ChatSlashCommandDefinition[];
  sanitizedCustomSlashCommands: ProjectChatCustomSlashCommand[];
  conflictedCustomSlashCommands: string[];
} {
  const customCommandDefinitions = buildCustomPromptSlashCommandDefinitions(
    args.customSlashCommands,
  );
  const executableCustomSlashCommandDefinitions: ChatSlashCommandDefinition[] =
    [];
  const sanitizedCustomSlashCommands: ProjectChatCustomSlashCommand[] = [];
  const conflictedCustomSlashCommands: string[] = [];

  for (const commandDefinition of customCommandDefinitions) {
    if (args.reservedSlashCommandTokens.has(commandDefinition.command)) {
      conflictedCustomSlashCommands.push(commandDefinition.command);
      continue;
    }
    executableCustomSlashCommandDefinitions.push(commandDefinition);
    sanitizedCustomSlashCommands.push({
      command: commandDefinition.command,
      prompt: commandDefinition.promptTemplate ?? "",
    });
  }

  return {
    executableCustomSlashCommandDefinitions,
    sanitizedCustomSlashCommands,
    conflictedCustomSlashCommands,
  };
}

export function areProjectChatCustomSlashCommandsEqual(
  a: ProjectChatCustomSlashCommand[],
  b: ProjectChatCustomSlashCommand[],
): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let index = 0; index < a.length; index += 1) {
    if (a[index]?.command !== b[index]?.command) {
      return false;
    }
    if (a[index]?.prompt !== b[index]?.prompt) {
      return false;
    }
  }
  return true;
}
