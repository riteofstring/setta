import {
  buildChatSlashCommands,
  normalizeSlashCommandToken,
  type ChatSlashCommandDefinition,
} from "components/Chat/chatComposerControls";

import {
  buildLLMConfigGroups,
  pickDefaultConfigId,
} from "components/Chat/llmConfigUtils";

import {
  filterRunsByProjectConfigId,
  getRunLastUpdatedMs,
} from "state/actions/agentRunUtils";

import {
  EngineTypeEnum,
  type AgentRun,
  type AllConfigs,
  type EngineConfig,
} from "utils/generatedTypes";

import {
  APIKeys,
  AgentNativeSlashCommandsEntry,
  AgentRunsAuthorityState,
  EMPTY_AGENT_NATIVE_SLASH_COMMANDS_BY_ENGINE_ID,
  ExternalAgentHealthStatus,
  McpRuntimeServerState,
  McpRuntimeServerStatus,
  McpServerStatus,
  McpServerStatusColor,
  RUNTIME_SERVER_STATE_LABELS,
  SlashCommandsByEngine,
  extractAgentNativeSlashCommandsFromRun,
  isAgentRunsAuthorityReady,
  normalizeOptionalString,
} from "./skillsAndCommands";

export function resolveAgentNativeSlashCommandsByEngineId({
  runs,
  projectConfigId,
  engineConfigIds,
}: {
  runs: AgentRun[];
  projectConfigId: string;
  engineConfigIds: string[];
}): Record<string, AgentNativeSlashCommandsEntry> {
  const scopedRuns = filterRunsByProjectConfigId(runs, projectConfigId);
  const allowedEngineIds = new Set(engineConfigIds);
  const nextByEngineId: Record<
    string,
    {
      entry: AgentNativeSlashCommandsEntry;
      lastUpdatedMs: number;
      runId: string;
    }
  > = {};
  for (const run of scopedRuns) {
    const extracted = extractAgentNativeSlashCommandsFromRun(run);
    if (!extracted || !allowedEngineIds.has(extracted.engineConfigId)) {
      continue;
    }
    const lastUpdatedMs = getRunLastUpdatedMs(run);
    const current = nextByEngineId[extracted.engineConfigId];
    const nextRunId = run.id.trim();
    if (
      current &&
      (lastUpdatedMs < current.lastUpdatedMs ||
        (lastUpdatedMs === current.lastUpdatedMs &&
          nextRunId.localeCompare(current.runId) <= 0))
    ) {
      continue;
    }
    nextByEngineId[extracted.engineConfigId] = {
      entry: extracted.entry,
      lastUpdatedMs,
      runId: nextRunId,
    };
  }
  const next: Record<string, AgentNativeSlashCommandsEntry> = {};
  for (const [engineConfigId, value] of Object.entries(nextByEngineId)) {
    next[engineConfigId] = value.entry;
  }
  return next;
}

export function resolveVisibleAgentNativeSlashCommandsByEngineId({
  agentRunsAuthorityState,
  runtimeEntries,
}: {
  agentRunsAuthorityState: AgentRunsAuthorityState;
  runtimeEntries: Record<string, AgentNativeSlashCommandsEntry>;
}): Record<string, AgentNativeSlashCommandsEntry> {
  if (isAgentRunsAuthorityReady(agentRunsAuthorityState)) {
    return runtimeEntries;
  }
  return EMPTY_AGENT_NATIVE_SLASH_COMMANDS_BY_ENGINE_ID;
}

export function collectAgentNativeSlashCommandTokensFromEntries(
  entries: Record<string, AgentNativeSlashCommandsEntry>,
): string[] {
  const discoveredTokens: string[] = [];
  const seen = new Set<string>();
  for (const entry of Object.values(entries)) {
    for (const command of entry.commands) {
      const normalizedCommand = normalizeSlashCommandToken(command);
      if (!normalizedCommand || seen.has(normalizedCommand)) {
        continue;
      }
      seen.add(normalizedCommand);
      discoveredTokens.push(normalizedCommand);
    }
  }
  return discoveredTokens;
}

export function normalizeRuntimeServerState(
  value: unknown,
): McpRuntimeServerState {
  if (typeof value !== "string") {
    return "unknown";
  }
  switch (value) {
    case "connected":
    case "connecting":
    case "retrying":
    case "error":
    case "disabled":
    case "unknown":
      return value;
    default:
      return "unknown";
  }
}

export function normalizeRuntimeServerQuickInfo({
  state,
  quickInfo,
  issue,
  missingEnvVar,
  registeredToolCount,
}: {
  state: McpRuntimeServerState;
  quickInfo: string | null;
  issue: string | null;
  missingEnvVar: string | null;
  registeredToolCount: number;
}): string {
  if (quickInfo) {
    return quickInfo;
  }
  return `${RUNTIME_SERVER_STATE_LABELS[state]}: ${buildRuntimeServerQuickInfoDetails(
    {
      issue,
      missingEnvVar,
      registeredToolCount,
    },
  )}`;
}

export function buildRuntimeServerQuickInfoDetails({
  issue,
  missingEnvVar,
  registeredToolCount,
}: {
  issue: string | null;
  missingEnvVar: string | null;
  registeredToolCount: number;
}): string {
  const details: string[] = [];
  if (missingEnvVar) {
    details.push(`missing env var ${missingEnvVar}`);
  }
  if (issue) {
    details.push(issue);
  }
  details.push(
    `${registeredToolCount} tool${registeredToolCount === 1 ? "" : "s"}`,
  );
  return details.join(" | ");
}

export type RuntimeStatusInput = {
  serverId: string;
  state: unknown;
  quickInfo?: string | null;
  lastError?: string | null;
  missingEnvVar?: string | null;
  toolCount?: number;
};

export function normalizeRegisteredToolCount(toolCount: unknown): number {
  if (
    typeof toolCount !== "number" ||
    !Number.isFinite(toolCount) ||
    toolCount < 0
  ) {
    return 0;
  }
  return toolCount;
}

export function buildRuntimeServerStatusEntry(
  runtimeStatus: RuntimeStatusInput,
): [string, McpRuntimeServerStatus] | null {
  const serverId = runtimeStatus.serverId.trim();
  if (!serverId) {
    return null;
  }
  const state = normalizeRuntimeServerState(runtimeStatus.state);
  const issue = normalizeOptionalString(runtimeStatus.lastError);
  const missingEnvVar = normalizeOptionalString(runtimeStatus.missingEnvVar);
  const registeredToolCount = normalizeRegisteredToolCount(
    runtimeStatus.toolCount,
  );
  return [
    serverId,
    {
      state,
      quickInfo: normalizeRuntimeServerQuickInfo({
        state,
        quickInfo: normalizeOptionalString(runtimeStatus.quickInfo),
        issue,
        missingEnvVar,
        registeredToolCount,
      }),
      registeredToolCount,
      issue,
      missingEnvVar,
    },
  ];
}

export function toRuntimeStatusByServerId(
  runtimeStatuses: RuntimeStatusInput[],
): Record<string, McpRuntimeServerStatus> {
  const statuses: Record<string, McpRuntimeServerStatus> = {};
  for (const runtimeStatus of runtimeStatuses) {
    const entry = buildRuntimeServerStatusEntry(runtimeStatus);
    if (!entry) {
      continue;
    }
    const [serverId, normalizedStatus] = entry;
    statuses[serverId] = normalizedStatus;
  }
  return statuses;
}

export function resolvePendingMcpServerStatus({
  endpoint,
  runtimeStatusLoading,
  runtimeStatusError,
  runtimeStatusByServerId,
}: {
  endpoint: string;
  runtimeStatusByServerId: Record<string, McpRuntimeServerStatus> | null;
  runtimeStatusLoading: boolean;
  runtimeStatusError: string | null;
}): McpServerStatus | null {
  if (endpoint === "(no endpoint)") {
    return {
      color: "red",
      quickInfo:
        "Unavailable: missing command/url in MCP server config for this entry.",
    };
  }
  if (runtimeStatusLoading) {
    return {
      color: "yellow",
      quickInfo: "Checking runtime MCP registration status...",
    };
  }
  if (runtimeStatusError) {
    return {
      color: "yellow",
      quickInfo: `Status unknown: ${runtimeStatusError}`,
    };
  }
  if (!runtimeStatusByServerId) {
    return {
      color: "yellow",
      quickInfo: "Status unknown: MCP runtime status data is not available.",
    };
  }
  return null;
}

export function resolveRuntimeStatusColor(
  state: McpRuntimeServerState,
): McpServerStatusColor {
  if (state === "connected") {
    return "green";
  }
  if (state === "error") {
    return "red";
  }
  return "yellow";
}

export function resolveMcpServerStatus({
  serverId,
  endpoint,
  runtimeStatusByServerId,
  runtimeStatusLoading,
  runtimeStatusError,
}: {
  serverId: string;
  endpoint: string;
  runtimeStatusByServerId: Record<string, McpRuntimeServerStatus> | null;
  runtimeStatusLoading: boolean;
  runtimeStatusError: string | null;
}): McpServerStatus {
  const pendingStatus = resolvePendingMcpServerStatus({
    endpoint,
    runtimeStatusByServerId,
    runtimeStatusLoading,
    runtimeStatusError,
  });
  if (pendingStatus) {
    return pendingStatus;
  }
  const runtimeStatus = runtimeStatusByServerId[serverId] ?? null;
  if (!runtimeStatus) {
    return {
      color: "yellow",
      quickInfo:
        "Status unknown: server is configured but not reported by MCP runtime status.",
    };
  }
  return {
    color: resolveRuntimeStatusColor(runtimeStatus.state),
    quickInfo: runtimeStatus.quickInfo,
  };
}

export function resolveEngineDisplayName(config: EngineConfig): string {
  const explicitName = config.name.trim();
  if (explicitName) {
    return explicitName;
  }
  if (config.engineType === EngineTypeEnum.external_agent) {
    return "External Agent";
  }
  return "Setta LLM";
}

export function buildAvailableConfigIds(
  allLLMConfigs: AllConfigs | null,
  apiKeys: APIKeys,
): Set<string> {
  const availableConfigIds = new Set<string>();
  const availableConfigGroups = buildLLMConfigGroups(allLLMConfigs, apiKeys);
  for (const group of availableConfigGroups) {
    for (const item of group.items) {
      availableConfigIds.add(item.id);
    }
  }
  return availableConfigIds;
}

export function buildExternalAgentHealthByConfigId(
  externalAgentHealth: ExternalAgentHealthStatus[],
): Map<string, ExternalAgentHealthStatus> {
  return new Map(
    externalAgentHealth.map((healthStatus) => [
      healthStatus.configId,
      healthStatus,
    ]),
  );
}

export function resolveSlashCommandAvailability({
  engineConfig,
  defaultConfigId,
  availableConfigIds,
  externalAgentHealthByConfigId,
  externalAgentHealthInitialLoadComplete,
}: {
  engineConfig: EngineConfig;
  defaultConfigId: string | null;
  availableConfigIds: Set<string>;
  externalAgentHealthByConfigId: Map<string, ExternalAgentHealthStatus>;
  externalAgentHealthInitialLoadComplete: boolean;
}): { permissionsEnabled: boolean; searchEnabled: boolean } {
  if (engineConfig.engineType !== EngineTypeEnum.external_agent) {
    const selectedConfigId = engineConfig.settaLlmConfigId ?? defaultConfigId;
    const hasLLMConfig = Boolean(
      selectedConfigId && availableConfigIds.has(selectedConfigId),
    );
    return {
      permissionsEnabled: hasLLMConfig,
      searchEnabled: hasLLMConfig,
    };
  }
  const externalEngineStatus = externalAgentHealthInitialLoadComplete
    ? externalAgentHealthByConfigId.get(
        engineConfig.externalAgentConfigId ?? "",
      )
    : null;
  return {
    permissionsEnabled: Boolean(
      externalEngineStatus?.available && externalEngineStatus.supported,
    ),
    searchEnabled: false,
  };
}

export function buildSlashCommandsForEngine({
  engineConfig,
  appGenerationSlashCommands,
  defaultConfigId,
  availableConfigIds,
  externalAgentHealthByConfigId,
  externalAgentHealthInitialLoadComplete,
}: {
  engineConfig: EngineConfig;
  appGenerationSlashCommands: ChatSlashCommandDefinition[];
  defaultConfigId: string | null;
  availableConfigIds: Set<string>;
  externalAgentHealthByConfigId: Map<string, ExternalAgentHealthStatus>;
  externalAgentHealthInitialLoadComplete: boolean;
}): SlashCommandsByEngine {
  const { permissionsEnabled, searchEnabled } = resolveSlashCommandAvailability(
    {
      engineConfig,
      defaultConfigId,
      availableConfigIds,
      externalAgentHealthByConfigId,
      externalAgentHealthInitialLoadComplete,
    },
  );
  return {
    engineId: engineConfig.id,
    engineName: resolveEngineDisplayName(engineConfig),
    engineType: engineConfig.engineType,
    commands: buildChatSlashCommands({
      model: true,
      permissions: permissionsEnabled,
      search: searchEnabled,
      appGenerationCommands: appGenerationSlashCommands,
    }),
  };
}

export function buildSlashCommandsByEngine({
  engineConfigs,
  appGenerationSlashCommands = [],
  allLLMConfigs,
  apiKeys,
  externalAgentHealth,
  externalAgentHealthInitialLoadComplete,
}: {
  engineConfigs: EngineConfig[];
  appGenerationSlashCommands?: ChatSlashCommandDefinition[];
  allLLMConfigs: AllConfigs | null;
  apiKeys: APIKeys;
  externalAgentHealth: ExternalAgentHealthStatus[];
  externalAgentHealthInitialLoadComplete: boolean;
}): SlashCommandsByEngine[] {
  const availableConfigIds = buildAvailableConfigIds(allLLMConfigs, apiKeys);
  const defaultConfigId = pickDefaultConfigId(allLLMConfigs);
  const externalAgentHealthByConfigId =
    buildExternalAgentHealthByConfigId(externalAgentHealth);
  return engineConfigs.map((engineConfig) =>
    buildSlashCommandsForEngine({
      engineConfig,
      appGenerationSlashCommands,
      defaultConfigId,
      availableConfigIds,
      externalAgentHealthByConfigId,
      externalAgentHealthInitialLoadComplete,
    }),
  );
}

export function buildReservedSlashCommandTokens({
  managedCommands,
  engineCommandGroups,
  discoveredNativeSlashCommands,
}: {
  managedCommands: ChatSlashCommandDefinition[];
  engineCommandGroups: Array<{ commands: ChatSlashCommandDefinition[] }>;
  discoveredNativeSlashCommands: string[];
}): Set<string> {
  const reserved = new Set<string>();
  for (const command of managedCommands) {
    reserved.add(command.command);
  }
  for (const group of engineCommandGroups) {
    for (const command of group.commands) {
      reserved.add(command.command);
    }
  }
  for (const nativeCommand of discoveredNativeSlashCommands) {
    const normalized = normalizeSlashCommandToken(nativeCommand);
    if (!normalized) {
      continue;
    }
    reserved.add(normalized);
  }
  return reserved;
}

export function reconcileCustomSlashCommands({
  customCommands,
  reservedTokens,
}: {
  customCommands: ChatSlashCommandDefinition[];
  reservedTokens: Set<string>;
}): {
  executableCommands: ChatSlashCommandDefinition[];
  conflictingCommandTokens: Set<string>;
} {
  const executableCommands: ChatSlashCommandDefinition[] = [];
  const conflictingCommandTokens = new Set<string>();
  for (const customCommand of customCommands) {
    if (reservedTokens.has(customCommand.command)) {
      conflictingCommandTokens.add(customCommand.command);
      continue;
    }
    executableCommands.push(customCommand);
  }
  return {
    executableCommands,
    conflictingCommandTokens,
  };
}
