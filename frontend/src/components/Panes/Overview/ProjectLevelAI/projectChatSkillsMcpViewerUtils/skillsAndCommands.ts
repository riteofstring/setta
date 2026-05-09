import {
  normalizeSlashCommandToken,
  type ChatSlashCommandDefinition,
} from "components/Chat/chatComposerControls";

import type {
  HttpapiExternalAgentPreflightStatus,
  HttpapiLlmapiKeysSnapshot,
} from "openapi/http";

import {
  EngineTypeEnum,
  ToolTypeEnum,
  type AgentRun,
  type AllConfigs,
  type BaseChatMessageUnion,
  type EngineConfig,
  type SkillEntry,
} from "utils/generatedTypes";

export type APIKeys = HttpapiLlmapiKeysSnapshot["apiKeys"];

export type ExternalAgentHealthStatus = HttpapiExternalAgentPreflightStatus;

export const EMPTY_AGENT_NATIVE_COMMANDS: string[] = [];

export const EMPTY_AGENT_NATIVE_SLASH_COMMANDS_BY_ENGINE_ID = Object.freeze(
  {},
) as Record<string, AgentNativeSlashCommandsEntry>;

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

export type AgentRunsAuthorityState =
  | "loading"
  | "ready"
  | "transient_error"
  | "terminal_error";

export const DEFAULT_AGENT_NATIVE_SLASH_COMMANDS_ENTRY: AgentNativeSlashCommandsEntry =
  {
    commands: EMPTY_AGENT_NATIVE_COMMANDS,
    status: "unknown",
    statusDetail: null,
  };

export function isAgentRunsAuthorityReady(
  agentRunsAuthorityState: AgentRunsAuthorityState,
): boolean {
  return agentRunsAuthorityState === "ready";
}

export function filterSkills(
  skills: SkillEntry[],
  query: string,
): SkillEntry[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return skills;
  }
  return skills.filter((skill) => {
    return (
      skill.name.toLowerCase().includes(normalizedQuery) ||
      skill.relativePath.toLowerCase().includes(normalizedQuery) ||
      skill.rootLabel.toLowerCase().includes(normalizedQuery) ||
      skill.description.toLowerCase().includes(normalizedQuery)
    );
  });
}

type SkillActivityState = "active" | "inactive" | "unknown";

type SkillStatus = {
  isApplicable: boolean;
  applicabilityReason: string;
  activityState: SkillActivityState;
  activitySource: string | null;
};

const CODEX_APPLICABLE_ROOT_IDS = [
  "workspace_agents_skills",
  "user_agents_skills",
  "agents_home_skills",
  "codex_home_skills",
  "admin_codex_skills",
];

const CLAUDE_APPLICABLE_ROOT_IDS = [
  "workspace_claude_skills",
  "user_claude_skills",
];

type SkillStatusContext = {
  skills: SkillEntry[];
  engineType: EngineConfig["engineType"] | null;
  externalAgentToolType: string | null;
  messages: BaseChatMessageUnion[] | null;
};

type SkillStatusResolutionContext = {
  activeSkillSourcesBySkillId: Map<string, string>;
  ambiguousSkillIds: Set<string>;
  applicableRootIdSet: Set<string>;
  engineLabel: string;
  hasStructuredMetadata: boolean;
  requiresStructuredMetadata: boolean;
};

function getSkillRootId(skillId: string): string {
  const separatorIndex = skillId.indexOf("::");
  if (separatorIndex < 0) {
    return "";
  }
  return skillId.slice(0, separatorIndex);
}

function getApplicableRootIds({
  engineType,
  externalAgentToolType,
}: {
  engineType: EngineConfig["engineType"] | null;
  externalAgentToolType: string | null;
}): string[] {
  if (engineType !== EngineTypeEnum.external_agent) {
    return [];
  }
  if (externalAgentToolType === ToolTypeEnum.codex) {
    return CODEX_APPLICABLE_ROOT_IDS;
  }
  if (externalAgentToolType === ToolTypeEnum.claude_code) {
    return CLAUDE_APPLICABLE_ROOT_IDS;
  }
  return [];
}

function getEngineLabel({
  engineType,
  externalAgentToolType,
}: {
  engineType: EngineConfig["engineType"] | null;
  externalAgentToolType: string | null;
}): string {
  if (engineType === EngineTypeEnum.setta_llm) {
    return "Setta LLM";
  }
  if (engineType === EngineTypeEnum.external_agent) {
    if (externalAgentToolType === ToolTypeEnum.codex) {
      return "Codex";
    }
    if (externalAgentToolType === ToolTypeEnum.claude_code) {
      return "Claude";
    }
    return "external agent";
  }
  return "selected engine";
}

function getArgumentsRecord(
  argumentsValue: unknown,
): Record<string, unknown> | null {
  if (isRecord(argumentsValue)) {
    return argumentsValue;
  }
  if (typeof argumentsValue !== "string" || !argumentsValue.trim()) {
    return null;
  }
  try {
    const parsed = JSON.parse(argumentsValue);
    if (!isRecord(parsed)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function normalizeSkillToken(value: string): string {
  return value.trim().toLowerCase();
}

type SkillActivityCollection = {
  activeByName: Map<string, string>;
  hasStructuredMetadata: boolean;
};

function shouldCollectCodexSkillActivity({
  engineType,
  externalAgentToolType,
}: {
  engineType: EngineConfig["engineType"] | null;
  externalAgentToolType: string | null;
}): boolean {
  return (
    engineType === EngineTypeEnum.external_agent &&
    externalAgentToolType === ToolTypeEnum.codex
  );
}

function recordActiveSkillName(
  activeByName: Map<string, string>,
  activitySource: string,
  skillName: string | null,
): void {
  if (!skillName) {
    return;
  }
  activeByName.set(normalizeSkillToken(skillName), activitySource);
}

function stripMcpToolNamespace(toolName: string): string {
  if (!toolName.startsWith("mcp__")) {
    return toolName;
  }
  const namespaceSeparatorIndex = toolName.indexOf("__", "mcp__".length);
  if (namespaceSeparatorIndex < 0) {
    return toolName;
  }
  return toolName.slice(namespaceSeparatorIndex + "__".length);
}

function extractSkillNameFromArguments(
  argumentsValue: Record<string, unknown>,
): string | null {
  const candidateKeys = [
    "name",
    "skill",
    "skill_name",
    "skillName",
    "skill_id",
    "skillId",
  ];
  for (const key of candidateKeys) {
    const raw = argumentsValue[key];
    if (typeof raw === "string" && raw.trim()) {
      return raw.trim();
    }
  }
  const nestedKeys = ["input", "arguments", "args", "payload", "config"];
  for (const key of nestedKeys) {
    const raw = argumentsValue[key];
    if (!isRecord(raw)) {
      continue;
    }
    const nested = extractSkillNameFromArguments(raw);
    if (nested) {
      return nested;
    }
  }
  return null;
}

function extractSkillNameFromInvocation({
  toolName,
  toolArguments,
}: {
  toolName: string | null;
  toolArguments: unknown;
}): string | null {
  if (typeof toolName !== "string" || !toolName.trim()) {
    return null;
  }
  const normalizedToolName = stripMcpToolNamespace(
    toolName.trim().toLowerCase(),
  );
  if (normalizedToolName === "skills" || normalizedToolName === "skills/list") {
    return null;
  }
  if (normalizedToolName === "skill") {
    const argumentRecord = getArgumentsRecord(toolArguments);
    if (!argumentRecord) {
      return null;
    }
    return extractSkillNameFromArguments(argumentRecord);
  }
  if (normalizedToolName.startsWith("skill/")) {
    const suffix = normalizedToolName.slice("skill/".length).trim();
    return suffix || null;
  }
  return null;
}

function collectStructuredSkillActivityFromAssistantMessage(
  message: BaseChatMessageUnion,
  activeByName: Map<string, string>,
  activitySource: string,
): boolean {
  if (message.role !== "assistant" || !Array.isArray(message.tool_calls)) {
    return false;
  }
  for (const toolCall of message.tool_calls) {
    recordActiveSkillName(
      activeByName,
      activitySource,
      extractSkillNameFromInvocation({
        toolName: toolCall.function.name,
        toolArguments: toolCall.function.arguments,
      }),
    );
  }
  return true;
}

function collectStructuredSkillActivityFromToolMessage(
  message: BaseChatMessageUnion,
  activeByName: Map<string, string>,
  activitySource: string,
): boolean {
  if (message.role !== "tool") {
    return false;
  }
  recordActiveSkillName(
    activeByName,
    activitySource,
    extractSkillNameFromInvocation({
      toolName: message.tool_name,
      toolArguments: message.arguments,
    }),
  );
  return true;
}

function collectActiveSkillNames({
  engineType,
  externalAgentToolType,
  messages,
}: {
  engineType: EngineConfig["engineType"] | null;
  externalAgentToolType: string | null;
  messages: BaseChatMessageUnion[] | null;
}): SkillActivityCollection {
  const activeByName = new Map<string, string>();
  let hasStructuredMetadata = false;
  if (!messages || messages.length === 0) {
    return { activeByName, hasStructuredMetadata };
  }
  if (!shouldCollectCodexSkillActivity({ engineType, externalAgentToolType })) {
    return { activeByName, hasStructuredMetadata };
  }
  const activitySource = "codex_skill_tool";
  for (const message of messages) {
    const foundStructuredMetadata =
      collectStructuredSkillActivityFromAssistantMessage(
        message,
        activeByName,
        activitySource,
      ) ||
      collectStructuredSkillActivityFromToolMessage(
        message,
        activeByName,
        activitySource,
      );
    if (foundStructuredMetadata) {
      hasStructuredMetadata = true;
    }
  }
  return { activeByName, hasStructuredMetadata };
}

function buildSkillIdentifierSet(skill: SkillEntry): Set<string> {
  const identifiers = new Set<string>();
  identifiers.add(normalizeSkillToken(skill.name));
  const normalizedRelativePath = normalizeSkillToken(skill.relativePath);
  identifiers.add(normalizedRelativePath);
  const relativePathSegments = normalizedRelativePath.split("/");
  const lastSegment = relativePathSegments[relativePathSegments.length - 1];
  if (lastSegment) {
    identifiers.add(lastSegment);
  }
  return identifiers;
}

function buildSkillIdentifierIndex(
  skills: SkillEntry[],
): Map<string, SkillEntry[]> {
  const index = new Map<string, SkillEntry[]>();
  for (const skill of skills) {
    const identifiers = buildSkillIdentifierSet(skill);
    for (const identifier of identifiers) {
      const existing = index.get(identifier);
      if (existing) {
        existing.push(skill);
        continue;
      }
      index.set(identifier, [skill]);
    }
  }
  return index;
}

function mapActiveSkillNamesToSkillIds({
  applicableRootIds,
  skills,
  activeSkillNames,
}: {
  applicableRootIds: string[];
  skills: SkillEntry[];
  activeSkillNames: Map<string, string>;
}): {
  activeSkillSourcesBySkillId: Map<string, string>;
  ambiguousSkillIds: Set<string>;
} {
  const activeSkillSourcesBySkillId = new Map<string, string>();
  const ambiguousSkillIds = new Set<string>();
  if (activeSkillNames.size === 0) {
    return {
      activeSkillSourcesBySkillId,
      ambiguousSkillIds,
    };
  }
  const skillIdentifierIndex = buildSkillIdentifierIndex(skills);
  const applicableRootIdSet = new Set(applicableRootIds);
  for (const [activeSkillName, source] of activeSkillNames.entries()) {
    const candidates = skillIdentifierIndex.get(activeSkillName) ?? [];
    const applicableCandidates = candidates.filter((candidate) =>
      applicableRootIdSet.has(getSkillRootId(candidate.skillId)),
    );
    if (applicableCandidates.length === 0) {
      continue;
    }
    if (applicableCandidates.length > 1) {
      for (const candidate of applicableCandidates) {
        ambiguousSkillIds.add(candidate.skillId);
      }
      continue;
    }
    const [matchedCandidate] = applicableCandidates;
    if (!matchedCandidate) {
      continue;
    }
    activeSkillSourcesBySkillId.set(matchedCandidate.skillId, source);
  }
  return {
    activeSkillSourcesBySkillId,
    ambiguousSkillIds,
  };
}

function buildSkillStatusResolutionContext({
  skills,
  engineType,
  externalAgentToolType,
  messages,
}: SkillStatusContext): SkillStatusResolutionContext {
  const applicableRootIds = getApplicableRootIds({
    engineType,
    externalAgentToolType,
  });
  const requiresStructuredMetadata =
    engineType === EngineTypeEnum.external_agent &&
    externalAgentToolType === ToolTypeEnum.codex;
  const { activeByName: activeSkillNames, hasStructuredMetadata } =
    collectActiveSkillNames({
      engineType,
      externalAgentToolType,
      messages,
    });
  const { activeSkillSourcesBySkillId, ambiguousSkillIds } =
    mapActiveSkillNamesToSkillIds({
      applicableRootIds,
      skills,
      activeSkillNames,
    });
  return {
    activeSkillSourcesBySkillId,
    ambiguousSkillIds,
    applicableRootIdSet: new Set(applicableRootIds),
    engineLabel: getEngineLabel({
      engineType,
      externalAgentToolType,
    }),
    hasStructuredMetadata,
    requiresStructuredMetadata,
  };
}

function resolveSkillActivityState({
  skillId,
  isApplicable,
  activeSource,
  resolutionContext,
}: {
  skillId: string;
  isApplicable: boolean;
  activeSource: string | null;
  resolutionContext: SkillStatusResolutionContext;
}): SkillActivityState {
  if (activeSource) {
    return "active";
  }
  if (resolutionContext.ambiguousSkillIds.has(skillId)) {
    return "unknown";
  }
  if (
    isApplicable &&
    resolutionContext.requiresStructuredMetadata &&
    !resolutionContext.hasStructuredMetadata
  ) {
    return "unknown";
  }
  return "inactive";
}

function buildSkillStatusEntry(
  skill: SkillEntry,
  resolutionContext: SkillStatusResolutionContext,
): SkillStatus {
  const rootId = getSkillRootId(skill.skillId);
  const isApplicable = resolutionContext.applicableRootIdSet.has(rootId);
  const activeSource =
    resolutionContext.activeSkillSourcesBySkillId.get(skill.skillId) ?? null;
  return {
    isApplicable,
    applicabilityReason: isApplicable
      ? `Applicable for ${resolutionContext.engineLabel}.`
      : `Not applicable for ${resolutionContext.engineLabel}.`,
    activityState: resolveSkillActivityState({
      skillId: skill.skillId,
      isApplicable,
      activeSource,
      resolutionContext,
    }),
    activitySource: activeSource,
  };
}

export function buildSkillStatusBySkillId({
  skills,
  engineType,
  externalAgentToolType,
  messages,
}: SkillStatusContext): Record<string, SkillStatus> {
  const statusesBySkillId: Record<string, SkillStatus> = {};
  const resolutionContext = buildSkillStatusResolutionContext({
    skills,
    engineType,
    externalAgentToolType,
    messages,
  });
  for (const skill of skills) {
    statusesBySkillId[skill.skillId] = buildSkillStatusEntry(
      skill,
      resolutionContext,
    );
  }
  return statusesBySkillId;
}

type SkillsByRootPath = {
  rootPath: string;
  rootLabel: string;
  skills: SkillEntry[];
};

export function groupSkillsByRootPath(
  skills: SkillEntry[],
): SkillsByRootPath[] {
  const grouped = new Map<string, SkillsByRootPath>();
  for (const skill of skills) {
    const rootPath = skill.rootPath;
    const existing = grouped.get(rootPath);
    if (!existing) {
      grouped.set(rootPath, {
        rootPath,
        rootLabel: skill.rootLabel,
        skills: [skill],
      });
      continue;
    }
    existing.skills.push(skill);
  }
  return Array.from(grouped.values())
    .map((group) => ({
      ...group,
      skills: [...group.skills].sort((a, b) => {
        const relativeComparison = a.relativePath.localeCompare(b.relativePath);
        if (relativeComparison !== 0) {
          return relativeComparison;
        }
        return a.name.localeCompare(b.name);
      }),
    }))
    .sort((a, b) => a.rootPath.localeCompare(b.rootPath));
}

type McpServerListEntry = {
  serverId: string;
  transport: string;
  endpoint: string;
};

export type McpServerStatusColor = "green" | "yellow" | "red";

export type McpServerStatus = {
  color: McpServerStatusColor;
  quickInfo: string;
};

export type McpRuntimeServerState =
  | "connected"
  | "connecting"
  | "retrying"
  | "error"
  | "disabled"
  | "unknown";

export type McpRuntimeServerStatus = {
  state: McpRuntimeServerState;
  quickInfo: string;
  registeredToolCount: number;
  issue: string | null;
  missingEnvVar: string | null;
};

export const RUNTIME_SERVER_STATE_LABELS: Record<
  McpRuntimeServerState,
  string
> = {
  connected: "Connected",
  connecting: "Connecting",
  retrying: "Retrying",
  error: "Error",
  disabled: "Disabled",
  unknown: "Unknown",
};

export type SlashCommandsByEngine = {
  engineId: string;
  engineName: string;
  engineType: EngineConfig["engineType"];
  commands: ChatSlashCommandDefinition[];
};

type McpServersByConfigPath = {
  configPath: string | null;
  configLabel: string;
  servers: McpServerListEntry[];
};

function resolveMcpServerEndpoint(
  config: AllConfigs["mcpServers"][string],
): string {
  if (typeof config.url === "string" && config.url.length > 0) {
    return config.url;
  }
  if (typeof config.command === "string" && config.command.length > 0) {
    return config.command;
  }
  return "(no endpoint)";
}

function resolveMcpConfigLabel(settaFilesLocation: string | null): string {
  if (!settaFilesLocation) {
    return "Active setta_files";
  }
  if (settaFilesLocation === "custom") {
    return "Active custom setta_files root";
  }
  return `Active ${settaFilesLocation} setta_files`;
}

export function groupMcpServersByConfigPath({
  mcpServers,
  mcpConfigPath,
  settaFilesLocation,
  runtimeServers = [],
}: {
  mcpServers: AllConfigs["mcpServers"] | undefined;
  mcpConfigPath: string | null;
  settaFilesLocation: string | null;
  runtimeServers?: Array<McpServerListEntry>;
}): McpServersByConfigPath[] {
  const groups: McpServersByConfigPath[] = [];
  const runtimeServerByServerId = new Map(
    runtimeServers.map((server) => [server.serverId, server]),
  );
  if (mcpServers) {
    const serverEntries = Object.entries(mcpServers)
      .map(([serverId, config]) => {
        const liveRuntimeServer = runtimeServerByServerId.get(serverId);
        if (liveRuntimeServer) {
          return {
            ...liveRuntimeServer,
          };
        }
        return {
          serverId,
          transport: config.transport,
          endpoint: resolveMcpServerEndpoint(config),
        };
      })
      .sort((a, b) => a.serverId.localeCompare(b.serverId));
    if (serverEntries.length > 0) {
      groups.push({
        configPath: mcpConfigPath,
        configLabel: resolveMcpConfigLabel(settaFilesLocation),
        servers: serverEntries,
      });
    }
  }
  const unmatchedRuntimeServers = runtimeServers.filter(
    (server) => !(mcpServers && server.serverId in mcpServers),
  );
  if (unmatchedRuntimeServers.length > 0) {
    groups.push({
      configPath: null,
      configLabel: "Active external runtime",
      servers: [...unmatchedRuntimeServers].sort((a, b) =>
        a.serverId.localeCompare(b.serverId),
      ),
    });
  }
  return groups;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed;
}

function normalizeSlashCommandList(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const value of raw) {
    if (typeof value !== "string") {
      continue;
    }
    const normalizedValue = normalizeSlashCommandToken(value);
    if (!normalizedValue || seen.has(normalizedValue)) {
      continue;
    }
    seen.add(normalizedValue);
    normalized.push(normalizedValue);
  }
  return normalized;
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

function resolveAgentNativeSlashCommandsMetadata(
  run: AgentRun,
): Record<string, unknown> | null {
  if (!isRecord(run.outputs) || !isRecord(run.outputs.metadata)) {
    return null;
  }
  return run.outputs.metadata;
}

function resolveAgentNativeSlashCommandsStatus({
  commands,
  hasCommandsField,
  metadata,
}: {
  commands: string[];
  hasCommandsField: boolean;
  metadata: Record<string, unknown>;
}): AgentNativeSlashCommandsEntry | null {
  const normalizedStatus = normalizeAgentNativeSlashCommandsStatus(
    metadata.agentNativeSlashCommandsStatus,
  );
  const statusDetail = normalizeOptionalString(
    metadata.agentNativeSlashCommandsStatusDetail,
  );
  const status =
    normalizedStatus !== "unknown"
      ? normalizedStatus
      : commands.length > 0
        ? "available"
        : hasCommandsField
          ? "none"
          : "unknown";
  if (commands.length === 0 && status === "unknown" && statusDetail === null) {
    return null;
  }
  return {
    commands,
    status,
    statusDetail,
  };
}

export function extractAgentNativeSlashCommandsFromRun(
  run: AgentRun,
): { engineConfigId: string; entry: AgentNativeSlashCommandsEntry } | null {
  const metadata = resolveAgentNativeSlashCommandsMetadata(run);
  if (!metadata) {
    return null;
  }
  const engineConfigId = normalizeOptionalString(metadata.engineConfigId);
  if (!engineConfigId) {
    return null;
  }
  const hasCommandsField = Array.isArray(metadata.agentNativeSlashCommands);
  const commands = normalizeSlashCommandList(metadata.agentNativeSlashCommands);
  const entry = resolveAgentNativeSlashCommandsStatus({
    commands,
    hasCommandsField,
    metadata,
  });
  if (!entry) {
    return null;
  }
  return {
    engineConfigId,
    entry,
  };
}
