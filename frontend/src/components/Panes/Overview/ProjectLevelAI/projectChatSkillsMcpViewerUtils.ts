import {
  type AllLLMConfigs,
  type AppGenSkillEntry,
} from "utils/generatedTypes";

const MCP_TOOL_NAME_SEPARATOR = "__";

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

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((entry) => typeof entry === "string" && entry.length > 0)
  );
}

function extractToolNamesFromStructuredContent(
  value: unknown,
): string[] | null {
  if (!isRecord(value)) {
    return null;
  }
  const tools = value.tools;
  if (!isStringArray(tools)) {
    return null;
  }
  return tools;
}

function extractToolNamesFromContent(value: unknown): string[] | null {
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
      const tools = extractToolNamesFromStructuredContent(parsed);
      if (tools) {
        return tools;
      }
    } catch {
      continue;
    }
  }
  return null;
}

function extractToolNamesFromCallResult(
  callResult: Record<string, unknown>,
): string[] {
  return (
    extractToolNamesFromStructuredContent(callResult.structuredContent) ??
    extractToolNamesFromContent(callResult.content) ??
    []
  );
}

export function parseRegisteredMcpToolCounts(
  callResult: Record<string, unknown>,
): Record<string, number> {
  const toolNames = extractToolNamesFromCallResult(callResult);
  const toolCountsByServerId: Record<string, number> = {};
  for (const toolName of toolNames) {
    const separatorIndex = toolName.indexOf(MCP_TOOL_NAME_SEPARATOR);
    if (separatorIndex <= 0) {
      continue;
    }
    const serverId = toolName.slice(0, separatorIndex);
    toolCountsByServerId[serverId] =
      (toolCountsByServerId[serverId] ?? 0) + 1;
  }
  return toolCountsByServerId;
}

export function hasNamespacedMcpToolNames(
  callResult: Record<string, unknown>,
): boolean {
  const toolNames = extractToolNamesFromCallResult(callResult);
  return toolNames.some((toolName) => {
    return toolName.indexOf(MCP_TOOL_NAME_SEPARATOR) > 0;
  });
}

export function resolveMcpServerStatus({
  serverId,
  endpoint,
  runtimeToolCountsByServerId,
  runtimeSupportsServerMapping,
  runtimeStatusLoading,
  runtimeStatusError,
}: {
  serverId: string;
  endpoint: string;
  runtimeToolCountsByServerId: Record<string, number> | null;
  runtimeSupportsServerMapping: boolean | null;
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
  if (!runtimeToolCountsByServerId) {
    return {
      color: "yellow",
      quickInfo:
        "Status unknown: MCP runtime registration data is not available.",
    };
  }
  if (runtimeSupportsServerMapping === false) {
    return {
      color: "yellow",
      quickInfo:
        "Status unknown: runtime MCP tool list does not expose server IDs in this mode.",
    };
  }
  const registeredToolCount = runtimeToolCountsByServerId[serverId] ?? 0;
  if (registeredToolCount > 0) {
    return {
      color: "green",
      quickInfo: `Available: registered with ${registeredToolCount} MCP tool${registeredToolCount === 1 ? "" : "s"}.`,
    };
  }
  return {
    color: "red",
    quickInfo:
      "Unavailable: server is configured but no MCP tools are registered in the current runtime.",
  };
}
