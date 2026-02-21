import {
  type AllLLMConfigs,
  type AppGenSkillEntry,
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

export type McpServerStatusColor = "green" | "yellow" | "red";

export type McpServerStatus = {
  color: McpServerStatusColor;
  quickInfo: string;
};

export type McpRuntimeServerState =
  | "available"
  | "connecting"
  | "retrying"
  | "unavailable"
  | "disabled"
  | "unknown";

export type McpRuntimeServerStatus = {
  state: McpRuntimeServerState;
  quickInfo: string;
  registeredToolCount: number;
  issue: string | null;
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
  if (settaFilesLocation === "custom") {
    return "Active custom setta_files root";
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

function extractRuntimeStatusEntriesFromContent(value: unknown): unknown[] | null {
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
      const statusEntries = extractRuntimeStatusEntriesFromStructuredContent(parsed);
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
    extractRuntimeStatusEntriesFromStructuredContent(callResult.structuredContent) ??
    extractRuntimeStatusEntriesFromContent(callResult.content) ??
    null
  );
}

function normalizeRuntimeServerState(value: unknown): McpRuntimeServerState {
  if (typeof value !== "string") {
    return "unknown";
  }
  switch (value) {
    case "available":
    case "connecting":
    case "retrying":
    case "unavailable":
    case "disabled":
    case "unknown":
      return value;
    default:
      return "unknown";
  }
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
  const issue = typeof issueRaw === "string" && issueRaw.trim().length > 0 ? issueRaw : null;
  const fallbackQuickInfo =
    issue ?? "Status unknown: runtime MCP status did not include details.";
  const quickInfo =
    typeof quickInfoRaw === "string" && quickInfoRaw.trim().length > 0
      ? quickInfoRaw
      : fallbackQuickInfo;
  return [
    serverIdRaw,
    {
      state: normalizeRuntimeServerState(value.state),
      quickInfo,
      registeredToolCount,
      issue,
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
      quickInfo:
        "Status unknown: MCP runtime status data is not available.",
    };
  }
  const runtimeStatus = runtimeStatusByServerId[serverId];
  if (!runtimeStatus) {
    return {
      color: "yellow",
      quickInfo:
        "Status unknown: server is configured but not reported by MCP runtime status.",
    };
  }
  if (runtimeStatus.state === "available") {
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
