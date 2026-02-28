import {
  buildChatSlashCommands,
  type ChatSlashCommandDefinition,
} from "components/Chat/chatComposerControls";
import {
  buildLLMConfigGroups,
  pickDefaultConfigId,
} from "components/Chat/llmConfigUtils";
import {
  EngineTypeEnum,
  ExternalAgentToolTypeEnum,
  type APIKeys,
  type AllLLMConfigs,
  type AppGenSkillEntry,
  type BaseChatMessageUnion,
  type EngineConfig,
  type ExternalAgentPreflightStatus,
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

const CODEX_SKILL_LIST_CONNECTOR_WORDS = new Set<string>([
  "and",
  "or",
  "plus",
  "then",
  "with",
]);

function isLikelyCodexSkillTokenContext(prefix: string): boolean {
  const normalizedPrefix = prefix.replace(
    /\$[A-Za-z0-9][A-Za-z0-9._/-]*/g,
    " ",
  );
  const trimmedPrefix = normalizedPrefix.trimEnd();
  if (!trimmedPrefix) {
    return true;
  }
  if (/^[>*\-+0-9.)\s:;,\[\]{}!?'"`]+$/.test(trimmedPrefix)) {
    return true;
  }
  const trailingWordMatch = trimmedPrefix
    .toLowerCase()
    .match(/([a-z]+)[^a-z]*$/);
  if (!trailingWordMatch) {
    return false;
  }
  const trailingWord = trailingWordMatch[1];
  if (!trailingWord) {
    return false;
  }
  return CODEX_SKILL_CONTEXT_VERBS.has(trailingWord);
}

function isLikelyCodexSkillListContinuation(segment: string): boolean {
  const normalizedSegment = segment.trim().toLowerCase();
  if (!normalizedSegment) {
    return true;
  }
  const words = normalizedSegment.match(/[a-z]+/g) ?? [];
  for (const word of words) {
    if (!CODEX_SKILL_LIST_CONNECTOR_WORDS.has(word)) {
      return false;
    }
  }
  const nonWordCharacters = normalizedSegment.replace(/[a-z]+/g, "");
  return /^[,/:()\[\]{}\-\s]*$/.test(nonWordCharacters);
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
    const matches = Array.from(
      line.matchAll(/(^|[^A-Za-z0-9_./-\\])\$([A-Za-z0-9][A-Za-z0-9._/-]*)/g),
    );
    let lastAcceptedTokenEndIndex: number | null = null;
    for (const match of matches) {
      const token = match[2];
      const tokenPrefix = match[1];
      const matchIndex = match.index;
      if (!token || tokenPrefix === undefined || matchIndex === undefined) {
        continue;
      }
      const tokenStartIndex = matchIndex + tokenPrefix.length;
      const tokenEndIndex = tokenStartIndex + token.length + 1;
      const prefix = line.slice(0, tokenStartIndex);
      const hasPerTokenActivationContext =
        isLikelyCodexSkillTokenContext(prefix);
      let hasListContinuationContext = false;
      if (lastAcceptedTokenEndIndex !== null) {
        const continuationSegment = line.slice(
          lastAcceptedTokenEndIndex,
          tokenStartIndex,
        );
        hasListContinuationContext =
          isLikelyCodexSkillListContinuation(continuationSegment);
      }
      if (!hasPerTokenActivationContext && !hasListContinuationContext) {
        continue;
      }
      const normalizedToken = token.replace(/[.,:;!?]+$/g, "");
      if (!normalizedToken) {
        continue;
      }
      tokens.push(normalizedToken);
      lastAcceptedTokenEndIndex = tokenEndIndex;
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
  engineType: EngineConfig["engineType"] | null;
  externalAgentToolType: string | null;
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
    statusesBySkillId[skill.skillId] = {
      isApplicable,
      applicabilityReason: isApplicable
        ? `Applicable for ${engineLabel}.`
        : `Not applicable for ${engineLabel}.`,
      activityState: activeSource ? "active" : "inactive",
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

function extractRuntimeStatusEntriesFromStructuredContent(
  value: unknown,
): unknown[] | null {
  if (!isRecord(value)) {
    return null;
  }
  const servers = value.servers;
  if (!Array.isArray(servers)) {
    return null;
  }
  return servers;
}

function extractRuntimeStatusEntriesFromContent(
  value: unknown,
): unknown[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  for (const contentEntry of value) {
    if (!isRecord(contentEntry)) {
      continue;
    }
    const text = contentEntry.text;
    if (typeof text !== "string" || text.trim().length === 0) {
      continue;
    }
    try {
      const parsed = JSON.parse(text);
      const statusEntries =
        extractRuntimeStatusEntriesFromStructuredContent(parsed);
      if (statusEntries) {
        return statusEntries;
      }
    } catch {
      continue;
    }
  }
  return null;
}

function extractRuntimeStatusEntriesFromCallResult(
  callResult: Record<string, unknown>,
): unknown[] | null {
  return (
    extractRuntimeStatusEntriesFromStructuredContent(
      callResult.structuredContent,
    ) ??
    extractRuntimeStatusEntriesFromContent(callResult.content) ??
    null
  );
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
    case "available":
      return "connected";
    case "unavailable":
      return "error";
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

function parseRuntimeServerStatusEntry(
  value: unknown,
): [string, McpRuntimeServerStatus] | null {
  if (!isRecord(value)) {
    return null;
  }
  const serverIdRaw = value.serverId;
  if (typeof serverIdRaw !== "string" || serverIdRaw.trim().length === 0) {
    return null;
  }
  const quickInfoRaw = value.quickInfo;
  const issueRaw = value.issue;
  const registeredToolCountRaw = value.registeredToolCount;
  const registeredToolCount =
    typeof registeredToolCountRaw === "number" &&
    Number.isFinite(registeredToolCountRaw) &&
    registeredToolCountRaw >= 0
      ? registeredToolCountRaw
      : 0;
  const issue =
    typeof issueRaw === "string" && issueRaw.trim().length > 0
      ? issueRaw
      : null;
  const missingEnvVar = null;
  const state = normalizeRuntimeServerState(value.state);
  const quickInfo =
    typeof quickInfoRaw === "string" && quickInfoRaw.trim().length > 0
      ? quickInfoRaw
      : normalizeRuntimeServerQuickInfo({
          state,
          quickInfo: null,
          issue,
          missingEnvVar,
          registeredToolCount,
        });
  return [
    serverIdRaw,
    {
      state,
      quickInfo,
      registeredToolCount,
      issue,
      missingEnvVar,
    },
  ];
}

export function parseMcpServerRuntimeStatuses(
  callResult: Record<string, unknown>,
): Record<string, McpRuntimeServerStatus> | null {
  const rawEntries = extractRuntimeStatusEntriesFromCallResult(callResult);
  if (!rawEntries) {
    return null;
  }
  const statuses: Record<string, McpRuntimeServerStatus> = {};
  for (const rawEntry of rawEntries) {
    const parsedEntry = parseRuntimeServerStatusEntry(rawEntry);
    if (!parsedEntry) {
      return null;
    }
    const [serverId, status] = parsedEntry;
    statuses[serverId] = status;
  }
  return statuses;
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
      }),
    };
  });
}
