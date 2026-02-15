import {
  type AllLLMConfigs,
  type AppGenSkillEntry,
  type BaseChatMessageUnion,
  type EngineType,
  type ExternalAgentToolType,
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

export type SkillActivityState = "active" | "inactive" | "unknown";

export type SkillStatus = {
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
  const normalizedToolName = toolName.trim().toLowerCase();
  if (normalizedToolName === "skills" || normalizedToolName === "skills/list") {
    return null;
  }
  if (normalizedToolName.startsWith("skill/")) {
    const suffix = normalizedToolName.slice("skill/".length).trim();
    return suffix || null;
  }
  if (!normalizedToolName.includes("skill")) {
    return null;
  }
  const argumentRecord = getArgumentsRecord(toolArguments);
  if (!argumentRecord) {
    return null;
  }
  return extractSkillNameFromArguments(argumentRecord);
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
  const activitySource =
    externalAgentToolType === ExternalAgentToolTypeEnum.codex
      ? "codex_skill_item"
      : "opencode_skill_tool";
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
        activeByName.set(normalizeSkillToken(skillName), activitySource);
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
    activeByName.set(normalizeSkillToken(skillName), activitySource);
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
  for (const [activeSkillName, source] of activeSkillNames.entries()) {
    const candidates = skills.filter((skill) => {
      return buildSkillIdentifierSet(skill).has(activeSkillName);
    });
    if (candidates.length === 0) {
      continue;
    }
    const sortedCandidates = [...candidates].sort((a, b) => {
      const rootIdA = getSkillRootId(a.skillId);
      const rootIdB = getSkillRootId(b.skillId);
      const applicableA = applicableRootPriority.has(rootIdA);
      const applicableB = applicableRootPriority.has(rootIdB);
      if (applicableA !== applicableB) {
        return applicableA ? -1 : 1;
      }
      const priorityA =
        applicableRootPriority.get(rootIdA) ?? Number.MAX_SAFE_INTEGER;
      const priorityB =
        applicableRootPriority.get(rootIdB) ?? Number.MAX_SAFE_INTEGER;
      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }
      const relativeLengthA = a.relativePath.length;
      const relativeLengthB = b.relativePath.length;
      if (relativeLengthA !== relativeLengthB) {
        return relativeLengthA - relativeLengthB;
      }
      return a.skillId.localeCompare(b.skillId);
    });
    const bestCandidate = sortedCandidates[0];
    if (!bestCandidate) {
      continue;
    }
    activeSkillSourcesBySkillId.set(bestCandidate.skillId, source);
  }
  return activeSkillSourcesBySkillId;
}

function shouldUseUnknownState({
  engineType,
  externalAgentToolType,
}: {
  engineType: EngineType | null;
  externalAgentToolType: ExternalAgentToolType | null;
}): boolean {
  if (engineType !== EngineTypeEnum.external_agent) {
    return false;
  }
  return externalAgentToolType === ExternalAgentToolTypeEnum.claude_code;
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
  const unknownStateEnabled = shouldUseUnknownState({
    engineType,
    externalAgentToolType,
  });
  for (const skill of skills) {
    const rootId = getSkillRootId(skill.skillId);
    const isApplicable = applicableRootIdSet.has(rootId);
    const activeSource = activeSkillSourcesBySkillId.get(skill.skillId) ?? null;
    let activityState: SkillActivityState = "inactive";
    if (activeSource) {
      activityState = "active";
    } else if (unknownStateEnabled && isApplicable) {
      activityState = "unknown";
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
};

type McpServersByConfigPath = {
  configPath: string | null;
  configLabel: string;
  servers: McpServerListEntry[];
};

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
  return `Active ${settaFilesLocation} setta_files`;
}

export function groupMcpServersByConfigPath({
  mcpServers,
  mcpConfigPath,
  settaFilesLocation,
}: {
  mcpServers: AllLLMConfigs["mcpServers"] | undefined;
  mcpConfigPath: string | null;
  settaFilesLocation: string | null;
}): McpServersByConfigPath[] {
  if (!mcpServers) {
    return [];
  }
  const serverEntries = Object.entries(mcpServers)
    .map(([serverId, config]) => {
      return {
        serverId,
        transport: config.transport,
        endpoint: resolveMcpServerEndpoint(config),
      };
    })
    .sort((a, b) => a.serverId.localeCompare(b.serverId));
  if (serverEntries.length === 0) {
    return [];
  }
  return [
    {
      configPath: mcpConfigPath,
      configLabel: resolveMcpConfigLabel(settaFilesLocation),
      servers: serverEntries,
    },
  ];
}
