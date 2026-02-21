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
