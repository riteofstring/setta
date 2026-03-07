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
  ExternalAgentToolTypeEnum,
  type APIKeys,
  type AgentRun,
  type AllLLMConfigs,
  type AppGenSkillEntry,
  type BaseChatMessageUnion,
  type EngineConfig,
  type ExternalAgentPreflightStatus,
} from "utils/generatedTypes";
import { getSafeLocalStorageAdapter } from "utils/safeLocalStorage";
import { createWithEqualityFn } from "zustand/traditional";

export const AGENT_NATIVE_SLASH_COMMANDS_STORAGE_KEY =
  "setta.projectChatSkillsMcpViewer.agentNativeSlashCommandsByProjectConfigId";

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
type AgentNativeSlashCommandsByProjectConfigId = Record<
  string,
  Record<string, AgentNativeSlashCommandsEntry>
>;
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
const agentNativeSlashCommandsStorageAdapter =
  getSafeLocalStorageAdapter("agent-runs");
export const useAgentNativeSlashCommandsCache =
  createWithEqualityFn<AgentNativeSlashCommandsByProjectConfigId>()(() =>
    parseAgentNativeSlashCommandsStorage(
      agentNativeSlashCommandsStorageAdapter.getItem(
        AGENT_NATIVE_SLASH_COMMANDS_STORAGE_KEY,
      ),
    ),
  );

export function isAgentRunsAuthorityReady(
  agentRunsAuthorityState: AgentRunsAuthorityState,
): boolean {
  return agentRunsAuthorityState === "ready";
}

export function filterSkills(
  skills: AppGenSkillEntry[],
  query: string,
): AppGenSkillEntry[] {
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

const OPENCODE_APPLICABLE_ROOT_IDS = [
  "workspace_opencode_skills",
  "user_opencode_skills",
];

type SkillStatusContext = {
  skills: AppGenSkillEntry[];
  engineType: EngineConfig["engineType"] | null;
  externalAgentToolType: string | null;
  messages: BaseChatMessageUnion[] | null;
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
  if (externalAgentToolType === ExternalAgentToolTypeEnum.codex) {
    return CODEX_APPLICABLE_ROOT_IDS;
  }
  if (externalAgentToolType === ExternalAgentToolTypeEnum.claude_code) {
    return CLAUDE_APPLICABLE_ROOT_IDS;
  }
  if (externalAgentToolType === ExternalAgentToolTypeEnum.opencode) {
    return OPENCODE_APPLICABLE_ROOT_IDS;
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
    if (externalAgentToolType === ExternalAgentToolTypeEnum.codex) {
      return "Codex";
    }
    if (externalAgentToolType === ExternalAgentToolTypeEnum.claude_code) {
      return "Claude";
    }
    if (externalAgentToolType === ExternalAgentToolTypeEnum.opencode) {
      return "OpenCode";
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
  if (engineType !== EngineTypeEnum.external_agent) {
    return { activeByName, hasStructuredMetadata };
  }
  if (
    externalAgentToolType !== ExternalAgentToolTypeEnum.codex &&
    externalAgentToolType !== ExternalAgentToolTypeEnum.opencode
  ) {
    return { activeByName, hasStructuredMetadata };
  }
  const activitySource =
    externalAgentToolType === ExternalAgentToolTypeEnum.codex
      ? "codex_skill_tool"
      : "opencode_skill_tool";
  for (const message of messages) {
    if (message.role === "assistant" && Array.isArray(message.tool_calls)) {
      hasStructuredMetadata = true;
      for (const toolCall of message.tool_calls) {
        const skillName = extractSkillNameFromInvocation({
          toolName: toolCall.function.name,
          toolArguments: toolCall.function.arguments,
        });
        if (!skillName) {
          continue;
        }
        activeByName.set(normalizeSkillToken(skillName), activitySource);
      }
      continue;
    }
    if (message.role !== "tool") {
      continue;
    }
    hasStructuredMetadata = true;
    const skillName = extractSkillNameFromInvocation({
      toolName: message.tool_name,
      toolArguments: message.arguments,
    });
    if (!skillName) {
      continue;
    }
    activeByName.set(normalizeSkillToken(skillName), activitySource);
  }
  return { activeByName, hasStructuredMetadata };
}

function buildSkillIdentifierSet(skill: AppGenSkillEntry): Set<string> {
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
  skills: AppGenSkillEntry[],
): Map<string, AppGenSkillEntry[]> {
  const index = new Map<string, AppGenSkillEntry[]>();
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
  skills,
  activeSkillNames,
}: {
  skills: AppGenSkillEntry[];
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
  for (const [activeSkillName, source] of activeSkillNames.entries()) {
    const candidates = skillIdentifierIndex.get(activeSkillName) ?? [];
    if (candidates.length === 0) {
      continue;
    }
    if (candidates.length > 1) {
      for (const candidate of candidates) {
        ambiguousSkillIds.add(candidate.skillId);
      }
      continue;
    }
    activeSkillSourcesBySkillId.set(candidates[0].skillId, source);
  }
  return {
    activeSkillSourcesBySkillId,
    ambiguousSkillIds,
  };
}

export function buildSkillStatusBySkillId({
  skills,
  engineType,
  externalAgentToolType,
  messages,
}: SkillStatusContext): Record<string, SkillStatus> {
  const statusesBySkillId: Record<string, SkillStatus> = {};
  const applicableRootIds = getApplicableRootIds({
    engineType,
    externalAgentToolType,
  });
  const applicableRootIdSet = new Set(applicableRootIds);
  const engineLabel = getEngineLabel({
    engineType,
    externalAgentToolType,
  });
  const requiresStructuredMetadata =
    engineType === EngineTypeEnum.external_agent &&
    (externalAgentToolType === ExternalAgentToolTypeEnum.codex ||
      externalAgentToolType === ExternalAgentToolTypeEnum.opencode);
  const { activeByName: activeSkillNames, hasStructuredMetadata } =
    collectActiveSkillNames({
      engineType,
      externalAgentToolType,
      messages,
    });
  const { activeSkillSourcesBySkillId, ambiguousSkillIds } =
    mapActiveSkillNamesToSkillIds({
      skills,
      activeSkillNames,
    });
  for (const skill of skills) {
    const rootId = getSkillRootId(skill.skillId);
    const isApplicable = applicableRootIdSet.has(rootId);
    const activeSource = activeSkillSourcesBySkillId.get(skill.skillId) ?? null;
    const activityState: SkillActivityState = activeSource
      ? "active"
      : ambiguousSkillIds.has(skill.skillId)
        ? "unknown"
        : isApplicable && requiresStructuredMetadata && !hasStructuredMetadata
          ? "unknown"
          : "inactive";
    statusesBySkillId[skill.skillId] = {
      isApplicable,
      applicabilityReason: isApplicable
        ? `Applicable for ${engineLabel}.`
        : `Not applicable for ${engineLabel}.`,
      activityState,
      activitySource: activeSource,
    };
  }
  return statusesBySkillId;
}

type SkillsByRootPath = {
  rootPath: string;
  rootLabel: string;
  skills: AppGenSkillEntry[];
};

export function groupSkillsByRootPath(
  skills: AppGenSkillEntry[],
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
  source: string;
  transport: string;
  endpoint: string;
};

type McpServerStatusColor = "green" | "yellow" | "red";

type McpServerStatus = {
  color: McpServerStatusColor;
  quickInfo: string;
};

type McpRuntimeServerState =
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

type SlashCommandsByEngine = {
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

export const SETTA_MCP_RUNTIME_SOURCE = "setta_mcp";

function buildRuntimeStatusMapKey(source: string, serverId: string): string {
  return `${source}:${serverId}`;
}

function resolveMcpServerEndpoint(
  config: AllLLMConfigs["mcpServers"][string],
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
  externalRuntimeServers = [],
}: {
  mcpServers: AllLLMConfigs["mcpServers"] | undefined;
  mcpConfigPath: string | null;
  settaFilesLocation: string | null;
  externalRuntimeServers?: Array<McpServerListEntry>;
}): McpServersByConfigPath[] {
  const groups: McpServersByConfigPath[] = [];
  if (mcpServers) {
    const serverEntries = Object.entries(mcpServers)
      .map(([serverId, config]) => {
        return {
          serverId,
          source: SETTA_MCP_RUNTIME_SOURCE,
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
  if (externalRuntimeServers.length > 0) {
    groups.push({
      configPath: null,
      configLabel: "Active external runtime",
      servers: [...externalRuntimeServers].sort((a, b) =>
        a.serverId.localeCompare(b.serverId),
      ),
    });
  }
  return groups;
}

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

function extractAgentNativeSlashCommandsFromRun(
  run: AgentRun,
): { engineConfigId: string; entry: AgentNativeSlashCommandsEntry } | null {
  if (!isRecord(run.outputs)) {
    return null;
  }
  const metadata = run.outputs.metadata;
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

export function filterAgentNativeSlashCommandsByEngineId({
  entries,
  engineConfigIds,
}: {
  entries: Record<string, AgentNativeSlashCommandsEntry>;
  engineConfigIds: string[];
}): Record<string, AgentNativeSlashCommandsEntry> {
  const allowedEngineIds = new Set(engineConfigIds);
  const next: Record<string, AgentNativeSlashCommandsEntry> = {};
  for (const engineConfigId of engineConfigIds) {
    const entry = entries[engineConfigId];
    if (!entry || !allowedEngineIds.has(engineConfigId)) {
      continue;
    }
    next[engineConfigId] = entry;
  }
  return next;
}

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

export function resolveAgentNativeSlashCommandsByProjectConfigId({
  runs,
}: {
  runs: AgentRun[];
}): AgentNativeSlashCommandsByProjectConfigId {
  const nextByProjectAndEngine: Record<
    string,
    Record<
      string,
      {
        entry: AgentNativeSlashCommandsEntry;
        lastUpdatedMs: number;
        runId: string;
      }
    >
  > = {};
  for (const run of runs) {
    const projectConfigId = run.inputs?.projectConfigId;
    if (typeof projectConfigId !== "string" || projectConfigId.trim() === "") {
      continue;
    }
    const extracted = extractAgentNativeSlashCommandsFromRun(run);
    if (!extracted) {
      continue;
    }
    const lastUpdatedMs = getRunLastUpdatedMs(run);
    const nextRunId = run.id.trim();
    const currentByEngine =
      nextByProjectAndEngine[projectConfigId] ??
      (nextByProjectAndEngine[projectConfigId] = {});
    const current = currentByEngine[extracted.engineConfigId];
    if (
      current &&
      (lastUpdatedMs < current.lastUpdatedMs ||
        (lastUpdatedMs === current.lastUpdatedMs &&
          nextRunId.localeCompare(current.runId) <= 0))
    ) {
      continue;
    }
    currentByEngine[extracted.engineConfigId] = {
      entry: extracted.entry,
      lastUpdatedMs,
      runId: nextRunId,
    };
  }
  const next: AgentNativeSlashCommandsByProjectConfigId = {};
  for (const [projectConfigId, entriesByEngineId] of Object.entries(
    nextByProjectAndEngine,
  )) {
    const normalizedEntries: Record<string, AgentNativeSlashCommandsEntry> = {};
    for (const [engineConfigId, value] of Object.entries(entriesByEngineId)) {
      normalizedEntries[engineConfigId] = value.entry;
    }
    if (Object.keys(normalizedEntries).length === 0) {
      continue;
    }
    next[projectConfigId] = normalizedEntries;
  }
  return next;
}

export function resolveVisibleAgentNativeSlashCommandsByEngineId({
  agentRunsAuthorityState,
  persistedEntries,
  runtimeEntries,
  engineConfigIds,
}: {
  agentRunsAuthorityState: AgentRunsAuthorityState;
  persistedEntries: Record<string, AgentNativeSlashCommandsEntry>;
  runtimeEntries: Record<string, AgentNativeSlashCommandsEntry>;
  engineConfigIds: string[];
}): Record<string, AgentNativeSlashCommandsEntry> {
  if (isAgentRunsAuthorityReady(agentRunsAuthorityState)) {
    return runtimeEntries;
  }
  return filterAgentNativeSlashCommandsByEngineId({
    entries: persistedEntries,
    engineConfigIds,
  });
}

function areAgentNativeSlashEntriesEqual(
  currentEntry: AgentNativeSlashCommandsEntry | undefined,
  nextEntry: AgentNativeSlashCommandsEntry,
): boolean {
  if (!currentEntry) {
    return false;
  }
  if (
    currentEntry.status !== nextEntry.status ||
    currentEntry.statusDetail !== nextEntry.statusDetail
  ) {
    return false;
  }
  if (currentEntry.commands.length !== nextEntry.commands.length) {
    return false;
  }
  for (let index = 0; index < currentEntry.commands.length; index += 1) {
    if (currentEntry.commands[index] !== nextEntry.commands[index]) {
      return false;
    }
  }
  return true;
}

export function areAgentNativeSlashCommandMapsEqual(
  current: Record<string, AgentNativeSlashCommandsEntry>,
  next: Record<string, AgentNativeSlashCommandsEntry>,
): boolean {
  const currentKeys = Object.keys(current);
  const nextKeys = Object.keys(next);
  if (currentKeys.length !== nextKeys.length) {
    return false;
  }
  for (const key of currentKeys) {
    if (!(key in next)) {
      return false;
    }
    if (!areAgentNativeSlashEntriesEqual(current[key], next[key])) {
      return false;
    }
  }
  return true;
}

function areAgentNativeSlashCommandProjectMapsEqual(
  current: AgentNativeSlashCommandsByProjectConfigId,
  next: AgentNativeSlashCommandsByProjectConfigId,
): boolean {
  const currentKeys = Object.keys(current);
  const nextKeys = Object.keys(next);
  if (currentKeys.length !== nextKeys.length) {
    return false;
  }
  for (const key of currentKeys) {
    if (!(key in next)) {
      return false;
    }
    if (!areAgentNativeSlashCommandMapsEqual(current[key] ?? {}, next[key])) {
      return false;
    }
  }
  return true;
}

export function resolveAgentNativeSlashCommandsStorageUpdate({
  currentEntries,
  projectConfigId,
  nextEntries,
}: {
  currentEntries: AgentNativeSlashCommandsByProjectConfigId;
  projectConfigId: string;
  nextEntries: Record<string, AgentNativeSlashCommandsEntry>;
}): AgentNativeSlashCommandsByProjectConfigId | null {
  const currentProjectEntries = currentEntries[projectConfigId] ?? {};
  if (areAgentNativeSlashCommandMapsEqual(currentProjectEntries, nextEntries)) {
    return null;
  }
  const next = {
    ...currentEntries,
  };
  if (Object.keys(nextEntries).length === 0) {
    delete next[projectConfigId];
    return next;
  }
  next[projectConfigId] = nextEntries;
  return next;
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

function normalizeRuntimeServerState(value: unknown): McpRuntimeServerState {
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

function normalizeRuntimeServerQuickInfo({
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
  const detailSuffix = details.join(" | ");
  if (state === "connected") {
    return `Connected: ${detailSuffix}`;
  }
  if (state === "connecting") {
    return `Connecting: ${detailSuffix}`;
  }
  if (state === "retrying") {
    return `Retrying: ${detailSuffix}`;
  }
  if (state === "error") {
    return `Error: ${detailSuffix}`;
  }
  if (state === "disabled") {
    return `Disabled: ${detailSuffix}`;
  }
  return `Unknown: ${detailSuffix}`;
}

export function toRuntimeStatusByServerId(
  runtimeStatuses: Array<{
    serverId: string;
    source: string;
    state: unknown;
    lastError?: string | null;
    missingEnvVar?: string | null;
    toolCount?: number;
  }>,
): Record<string, McpRuntimeServerStatus> {
  const statuses: Record<string, McpRuntimeServerStatus> = {};
  for (const runtimeStatus of runtimeStatuses) {
    const serverId = runtimeStatus.serverId.trim();
    const source = runtimeStatus.source.trim();
    if (!serverId) {
      continue;
    }
    if (!source) {
      continue;
    }
    const state = normalizeRuntimeServerState(runtimeStatus.state);
    const issue = runtimeStatus.lastError?.trim() || null;
    const missingEnvVar = runtimeStatus.missingEnvVar?.trim() || null;
    const registeredToolCount =
      typeof runtimeStatus.toolCount === "number" &&
      Number.isFinite(runtimeStatus.toolCount) &&
      runtimeStatus.toolCount >= 0
        ? runtimeStatus.toolCount
        : 0;
    statuses[buildRuntimeStatusMapKey(source, serverId)] = {
      state,
      quickInfo: normalizeRuntimeServerQuickInfo({
        state,
        quickInfo: null,
        issue,
        missingEnvVar,
        registeredToolCount,
      }),
      registeredToolCount,
      issue,
      missingEnvVar,
    };
  }
  return statuses;
}

export function resolveMcpServerStatus({
  serverId,
  source,
  endpoint,
  runtimeStatusByServerId,
  runtimeStatusLoading,
  runtimeStatusError,
}: {
  serverId: string;
  source: string;
  endpoint: string;
  runtimeStatusByServerId: Record<string, McpRuntimeServerStatus> | null;
  runtimeStatusLoading: boolean;
  runtimeStatusError: string | null;
}): McpServerStatus {
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
  const runtimeStatus =
    runtimeStatusByServerId[buildRuntimeStatusMapKey(source, serverId)];
  if (!runtimeStatus) {
    return {
      color: "yellow",
      quickInfo:
        "Status unknown: server is configured but not reported by MCP runtime status.",
    };
  }
  if (runtimeStatus.state === "connected") {
    return {
      color: "green",
      quickInfo: runtimeStatus.quickInfo,
    };
  }
  if (
    runtimeStatus.state === "connecting" ||
    runtimeStatus.state === "retrying" ||
    runtimeStatus.state === "disabled" ||
    runtimeStatus.state === "unknown"
  ) {
    return {
      color: "yellow",
      quickInfo: runtimeStatus.quickInfo,
    };
  }
  return {
    color: "red",
    quickInfo: runtimeStatus.quickInfo,
  };
}

function resolveEngineDisplayName(config: EngineConfig): string {
  const explicitName = config.name.trim();
  if (explicitName) {
    return explicitName;
  }
  if (config.engineType === EngineTypeEnum.external_agent) {
    return "External Agent";
  }
  return "Setta LLM";
}

export function buildSlashCommandsByEngine({
  engineConfigs,
  allLLMConfigs,
  apiKeys,
  externalAgentHealth,
  externalAgentHealthInitialLoadComplete,
}: {
  engineConfigs: EngineConfig[];
  allLLMConfigs: AllLLMConfigs | null;
  apiKeys: APIKeys;
  externalAgentHealth: ExternalAgentPreflightStatus[];
  externalAgentHealthInitialLoadComplete: boolean;
}): SlashCommandsByEngine[] {
  const availableConfigIds = new Set<string>();
  const availableConfigGroups = buildLLMConfigGroups(allLLMConfigs, apiKeys);
  for (const group of availableConfigGroups) {
    for (const item of group.items) {
      availableConfigIds.add(item.id);
    }
  }
  const defaultConfigId = pickDefaultConfigId(allLLMConfigs);
  return engineConfigs.map((engineConfig) => {
    const isExternalEngine =
      engineConfig.engineType === EngineTypeEnum.external_agent;
    const hasLLMConfig = !isExternalEngine
      ? Boolean(
          (engineConfig.settaLlmConfigId ?? defaultConfigId) &&
            availableConfigIds.has(
              engineConfig.settaLlmConfigId ?? defaultConfigId ?? "",
            ),
        )
      : false;
    const externalEngineStatus =
      isExternalEngine && externalAgentHealthInitialLoadComplete
        ? externalAgentHealth.find(
            (status) => status.configId === engineConfig.externalAgentConfigId,
          ) ?? null
        : null;
    const externalEngineAvailable = isExternalEngine
      ? Boolean(
          externalEngineStatus?.available && externalEngineStatus.supported,
        )
      : false;
    const permissionsEnabled = isExternalEngine
      ? externalEngineAvailable
      : hasLLMConfig;
    const searchEnabled = !isExternalEngine && hasLLMConfig;
    return {
      engineId: engineConfig.id,
      engineName: resolveEngineDisplayName(engineConfig),
      engineType: engineConfig.engineType,
      commands: buildChatSlashCommands({
        model: true,
        permissions: permissionsEnabled,
        search: searchEnabled,
        appGenerationModes: true,
      }),
    };
  });
}

export function collectAgentNativeSlashCommandTokensFromStorage({
  rawStorageValue,
  projectConfigId,
  engineConfigIds,
}: {
  rawStorageValue: string | null;
  projectConfigId: string;
  engineConfigIds?: string[];
}): string[] {
  if (!projectConfigId.trim()) {
    return [];
  }
  const parsed = parseAgentNativeSlashCommandsStorage(rawStorageValue);
  const projectEntries = parsed[projectConfigId];
  if (!projectEntries) {
    return [];
  }
  const allowedEngineIds =
    Array.isArray(engineConfigIds) && engineConfigIds.length > 0
      ? new Set(engineConfigIds)
      : null;
  const discoveredTokens: string[] = [];
  const seen = new Set<string>();
  for (const [engineId, entry] of Object.entries(projectEntries)) {
    if (allowedEngineIds && !allowedEngineIds.has(engineId)) {
      continue;
    }
    for (const command of entry.commands) {
      const normalized = normalizeSlashCommandToken(command);
      if (!normalized || seen.has(normalized)) {
        continue;
      }
      seen.add(normalized);
      discoveredTokens.push(normalized);
    }
  }
  return discoveredTokens;
}

export function parseAgentNativeSlashCommandsStorage(
  rawStorageValue: string | null,
): AgentNativeSlashCommandsByProjectConfigId {
  if (!rawStorageValue) {
    return {};
  }
  try {
    const parsed = JSON.parse(rawStorageValue);
    if (!isRecord(parsed)) {
      return {};
    }
    const normalized: AgentNativeSlashCommandsByProjectConfigId = {};
    for (const [projectConfigId, rawProjectEntry] of Object.entries(parsed)) {
      if (!projectConfigId.trim() || !isRecord(rawProjectEntry)) {
        continue;
      }
      const normalizedProjectEntries: Record<
        string,
        AgentNativeSlashCommandsEntry
      > = {};
      for (const [engineId, rawEntry] of Object.entries(rawProjectEntry)) {
        if (!engineId.trim() || !isRecord(rawEntry)) {
          continue;
        }
        const hasCommandsField = Array.isArray(rawEntry.commands);
        const commands = normalizeSlashCommandList(rawEntry.commands);
        const status = normalizeAgentNativeSlashCommandsStatus(rawEntry.status);
        const statusDetail = normalizeOptionalString(rawEntry.statusDetail);
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
          continue;
        }
        normalizedProjectEntries[engineId] = {
          commands,
          status: resolvedStatus,
          statusDetail,
        };
      }
      if (Object.keys(normalizedProjectEntries).length === 0) {
        continue;
      }
      normalized[projectConfigId] = normalizedProjectEntries;
    }
    return normalized;
  } catch {
    return {};
  }
}

function serializeAgentNativeSlashCommandsStorage(
  entries: AgentNativeSlashCommandsByProjectConfigId,
): string {
  return JSON.stringify(entries);
}

export function replaceAgentNativeSlashCommandsCache(
  nextEntries: AgentNativeSlashCommandsByProjectConfigId,
): void {
  const currentEntries = useAgentNativeSlashCommandsCache.getState();
  const persistedEntries = parseAgentNativeSlashCommandsStorage(
    agentNativeSlashCommandsStorageAdapter.getItem(
      AGENT_NATIVE_SLASH_COMMANDS_STORAGE_KEY,
    ),
  );
  if (
    areAgentNativeSlashCommandProjectMapsEqual(currentEntries, nextEntries) &&
    areAgentNativeSlashCommandProjectMapsEqual(persistedEntries, nextEntries)
  ) {
    return;
  }
  useAgentNativeSlashCommandsCache.setState(nextEntries, true);
  if (Object.keys(nextEntries).length === 0) {
    agentNativeSlashCommandsStorageAdapter.removeItem(
      AGENT_NATIVE_SLASH_COMMANDS_STORAGE_KEY,
    );
    return;
  }
  agentNativeSlashCommandsStorageAdapter.setItem(
    AGENT_NATIVE_SLASH_COMMANDS_STORAGE_KEY,
    serializeAgentNativeSlashCommandsStorage(nextEntries),
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
