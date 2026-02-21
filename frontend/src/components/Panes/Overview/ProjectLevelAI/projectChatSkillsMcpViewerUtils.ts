import {
  type AppGenSkillEntry,
  type BaseChatMessageUnion,
  type EngineType,
  type ExternalAgentToolType,
  type MCPServerRuntimeState,
  type MCPServerRuntimeStatus,
  EngineTypeEnum,
  ExternalAgentToolTypeEnum,
} from "utils/generatedTypes";

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

type SkillActivityState = "active" | "inactive";

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
  engineType: EngineType | null;
  externalAgentToolType: ExternalAgentToolType | null;
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
  engineType: EngineType | null;
  externalAgentToolType: ExternalAgentToolType | null;
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
  engineType: EngineType | null;
  externalAgentToolType: ExternalAgentToolType | null;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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

const CODEX_SKILL_CONTEXT_VERBS = new Set<string>([
  "activate",
  "apply",
  "call",
  "execute",
  "invoke",
  "load",
  "run",
  "try",
  "use",
  "using",
  "with",
]);

function isLikelyCodexSkillTokenContext(prefix: string): boolean {
  const trimmedPrefix = prefix.trimEnd();
  if (!trimmedPrefix) {
    return true;
  }
  if (/^[>*\-+0-9.)\s]+$/.test(trimmedPrefix)) {
    return true;
  }
  const trailingWordMatch = trimmedPrefix.toLowerCase().match(/([a-z]+)$/);
  if (!trailingWordMatch) {
    return false;
  }
  const trailingWord = trailingWordMatch[1];
  if (!trailingWord) {
    return false;
  }
  return CODEX_SKILL_CONTEXT_VERBS.has(trailingWord);
}

function extractSkillTokensFromText(value: string): string[] {
  const tokens: string[] = [];
  const lines = value.split(/\r?\n/);
  let inFencedCodeBlock = false;
  for (const rawLine of lines) {
    const trimmedLine = rawLine.trimStart();
    if (trimmedLine.startsWith("```")) {
      inFencedCodeBlock = !inFencedCodeBlock;
      continue;
    }
    if (inFencedCodeBlock) {
      continue;
    }
    const line = rawLine.replace(/`[^`\n]*`/g, " ");
    const matches = line.matchAll(
      /(^|[^A-Za-z0-9_./-\\])\$([A-Za-z0-9][A-Za-z0-9._/-]*)/g,
    );
    for (const match of matches) {
      const token = match[2];
      const tokenPrefix = match[1];
      const matchIndex = match.index;
      if (!token || tokenPrefix === undefined || matchIndex === undefined) {
        continue;
      }
      const tokenStartIndex = matchIndex + tokenPrefix.length;
      const prefix = line.slice(0, tokenStartIndex);
      if (!isLikelyCodexSkillTokenContext(prefix)) {
        continue;
      }
      tokens.push(token);
    }
  }
  return tokens;
}

function getMessageTextBlocks(message: BaseChatMessageUnion): string[] {
  const blocks: string[] = [];
  for (const block of message.content) {
    if (!isRecord(block)) {
      continue;
    }
    if (block.type !== "text") {
      continue;
    }
    if (typeof block.text !== "string" || !block.text.trim()) {
      continue;
    }
    blocks.push(block.text);
  }
  return blocks;
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

function collectActiveSkillNames({
  engineType,
  externalAgentToolType,
  messages,
}: {
  engineType: EngineType | null;
  externalAgentToolType: ExternalAgentToolType | null;
  messages: BaseChatMessageUnion[] | null;
}): Map<string, string> {
  const activeByName = new Map<string, string>();
  if (!messages || messages.length === 0) {
    return activeByName;
  }
  if (engineType !== EngineTypeEnum.external_agent) {
    return activeByName;
  }
  if (
    externalAgentToolType !== ExternalAgentToolTypeEnum.codex &&
    externalAgentToolType !== ExternalAgentToolTypeEnum.opencode
  ) {
    return activeByName;
  }
  if (externalAgentToolType === ExternalAgentToolTypeEnum.codex) {
    for (const message of messages) {
      if (message.role !== "user") {
        continue;
      }
      const textBlocks = getMessageTextBlocks(message);
      for (const text of textBlocks) {
        const tokens = extractSkillTokensFromText(text);
        for (const token of tokens) {
          activeByName.set(normalizeSkillToken(token), "codex_skill_token");
        }
      }
    }
    return activeByName;
  }
  for (const message of messages) {
    if (message.role === "assistant" && Array.isArray(message.tool_calls)) {
      for (const toolCall of message.tool_calls) {
        const skillName = extractSkillNameFromInvocation({
          toolName: toolCall.function.name,
          toolArguments: toolCall.function.arguments,
        });
        if (!skillName) {
          continue;
        }
        activeByName.set(normalizeSkillToken(skillName), "opencode_skill_tool");
      }
      continue;
    }
    if (message.role !== "tool") {
      continue;
    }
    const skillName = extractSkillNameFromInvocation({
      toolName: message.tool_name,
      toolArguments: message.arguments,
    });
    if (!skillName) {
      continue;
    }
    activeByName.set(normalizeSkillToken(skillName), "opencode_skill_tool");
  }
  return activeByName;
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

function compareSkillCandidates({
  left,
  right,
  applicableRootPriority,
}: {
  left: AppGenSkillEntry;
  right: AppGenSkillEntry;
  applicableRootPriority: Map<string, number>;
}): number {
  const leftRootId = getSkillRootId(left.skillId);
  const rightRootId = getSkillRootId(right.skillId);
  const leftIsApplicable = applicableRootPriority.has(leftRootId);
  const rightIsApplicable = applicableRootPriority.has(rightRootId);
  if (leftIsApplicable !== rightIsApplicable) {
    return leftIsApplicable ? -1 : 1;
  }
  const leftPriority =
    applicableRootPriority.get(leftRootId) ?? Number.MAX_SAFE_INTEGER;
  const rightPriority =
    applicableRootPriority.get(rightRootId) ?? Number.MAX_SAFE_INTEGER;
  if (leftPriority !== rightPriority) {
    return leftPriority - rightPriority;
  }
  const leftRelativePathLength = left.relativePath.length;
  const rightRelativePathLength = right.relativePath.length;
  if (leftRelativePathLength !== rightRelativePathLength) {
    return leftRelativePathLength - rightRelativePathLength;
  }
  return left.skillId.localeCompare(right.skillId);
}

function selectBestSkillCandidate({
  candidates,
  applicableRootPriority,
}: {
  candidates: AppGenSkillEntry[];
  applicableRootPriority: Map<string, number>;
}): AppGenSkillEntry | null {
  let bestCandidate: AppGenSkillEntry | null = null;
  for (const candidate of candidates) {
    if (bestCandidate === null) {
      bestCandidate = candidate;
      continue;
    }
    if (
      compareSkillCandidates({
        left: candidate,
        right: bestCandidate,
        applicableRootPriority,
      }) < 0
    ) {
      bestCandidate = candidate;
    }
  }
  return bestCandidate;
}

function mapActiveSkillNamesToSkillIds({
  skills,
  activeSkillNames,
  applicableRootIds,
}: {
  skills: AppGenSkillEntry[];
  activeSkillNames: Map<string, string>;
  applicableRootIds: string[];
}): Map<string, string> {
  const activeSkillSourcesBySkillId = new Map<string, string>();
  if (activeSkillNames.size === 0) {
    return activeSkillSourcesBySkillId;
  }
  const applicableRootPriority = new Map<string, number>();
  for (const [index, rootId] of applicableRootIds.entries()) {
    applicableRootPriority.set(rootId, index);
  }
  const skillIdentifierIndex = buildSkillIdentifierIndex(skills);
  for (const [activeSkillName, source] of activeSkillNames.entries()) {
    const candidates = skillIdentifierIndex.get(activeSkillName) ?? [];
    if (candidates.length === 0) {
      continue;
    }
    const bestCandidate = selectBestSkillCandidate({
      candidates,
      applicableRootPriority,
    });
    if (!bestCandidate) {
      continue;
    }
    activeSkillSourcesBySkillId.set(bestCandidate.skillId, source);
  }
  return activeSkillSourcesBySkillId;
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
  const activeSkillNames = collectActiveSkillNames({
    engineType,
    externalAgentToolType,
    messages,
  });
  const activeSkillSourcesBySkillId = mapActiveSkillNamesToSkillIds({
    skills,
    activeSkillNames,
    applicableRootIds,
  });
  for (const skill of skills) {
    const rootId = getSkillRootId(skill.skillId);
    const isApplicable = applicableRootIdSet.has(rootId);
    const activeSource = activeSkillSourcesBySkillId.get(skill.skillId) ?? null;
    let activityState: SkillActivityState = "inactive";
    if (activeSource) {
      activityState = "active";
    }
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
  transport: string;
  endpoint: string;
  state: MCPServerRuntimeState;
  lastError: string | null;
  missingEnvVar: string | null;
  toolCount: number;
};

type McpServersByConfigPath = {
  configPath: string | null;
  configLabel: string;
  sourceLabel: string;
  servers: McpServerListEntry[];
};

function resolveMcpConfigLabel(settaFilesLocation: string | null): string {
  if (!settaFilesLocation) {
    return "Active setta_files";
  }
  return `Active ${settaFilesLocation} setta_files`;
}

function mcpStatusPriority(state: MCPServerRuntimeState): number {
  if (state === "error") {
    return 0;
  }
  if (state === "retrying") {
    return 1;
  }
  if (state === "connecting") {
    return 2;
  }
  if (state === "connected") {
    return 3;
  }
  if (state === "unknown") {
    return 4;
  }
  return 5;
}

function toMcpListEntry(server: MCPServerRuntimeStatus): McpServerListEntry {
  return {
    serverId: server.serverId,
    transport: server.transport,
    endpoint: server.endpoint,
    state: server.state,
    lastError: server.lastError,
    missingEnvVar: server.missingEnvVar,
    toolCount: server.toolCount,
  };
}

export function groupMcpServersByConfigPath({
  mcpRuntimeStatuses,
  externalMcpRuntimeStatuses,
  mcpConfigPath,
  settaFilesLocation,
}: {
  mcpRuntimeStatuses: MCPServerRuntimeStatus[];
  externalMcpRuntimeStatuses: MCPServerRuntimeStatus[];
  mcpConfigPath: string | null;
  settaFilesLocation: string | null;
}): McpServersByConfigPath[] {
  const groups: McpServersByConfigPath[] = [];
  const sortedSettaServers = [...mcpRuntimeStatuses]
    .map(toMcpListEntry)
    .sort((a, b) => {
      const priorityDiff =
        mcpStatusPriority(a.state) - mcpStatusPriority(b.state);
      if (priorityDiff !== 0) {
        return priorityDiff;
      }
      return a.serverId.localeCompare(b.serverId);
    });
  if (sortedSettaServers.length > 0) {
    groups.push({
      configPath: mcpConfigPath,
      configLabel: resolveMcpConfigLabel(settaFilesLocation),
      sourceLabel: "Setta MCP",
      servers: sortedSettaServers,
    });
  }
  const sortedExternalServers = [...externalMcpRuntimeStatuses]
    .map(toMcpListEntry)
    .sort((a, b) => {
      const priorityDiff =
        mcpStatusPriority(a.state) - mcpStatusPriority(b.state);
      if (priorityDiff !== 0) {
        return priorityDiff;
      }
      return a.serverId.localeCompare(b.serverId);
    });
  if (sortedExternalServers.length > 0) {
    groups.push({
      configPath: null,
      configLabel: "Active external runtime",
      sourceLabel: "External Runtime",
      servers: sortedExternalServers,
    });
  }
  return groups;
}

type McpStatusSummary = {
  total: number;
  connected: number;
  connecting: number;
  retrying: number;
  error: number;
  disabled: number;
  unknown: number;
};

export function buildMcpStatusSummary(
  groups: McpServersByConfigPath[],
): McpStatusSummary {
  const summary: McpStatusSummary = {
    total: 0,
    connected: 0,
    connecting: 0,
    retrying: 0,
    error: 0,
    disabled: 0,
    unknown: 0,
  };
  for (const group of groups) {
    for (const server of group.servers) {
      summary.total += 1;
      if (server.state === "connected") {
        summary.connected += 1;
        continue;
      }
      if (server.state === "connecting") {
        summary.connecting += 1;
        continue;
      }
      if (server.state === "retrying") {
        summary.retrying += 1;
        continue;
      }
      if (server.state === "error") {
        summary.error += 1;
        continue;
      }
      if (server.state === "disabled") {
        summary.disabled += 1;
        continue;
      }
      summary.unknown += 1;
    }
  }
  return summary;
}
