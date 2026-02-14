import { type AppGenSkillEntry } from "utils/generatedTypes";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function parseMcpToolsFromResult(result: unknown): {
  toolNames: string[];
  mcpError: string | null;
} {
  if (!isRecord(result)) {
    return { toolNames: [], mcpError: "Unexpected MCP response payload." };
  }
  const isError = result.isError === true;
  const structuredContent = result.structuredContent;
  if (isRecord(structuredContent) && Array.isArray(structuredContent.tools)) {
    const toolNames = structuredContent.tools.filter(
      (entry): entry is string => typeof entry === "string",
    );
    return { toolNames, mcpError: null };
  }
  if (isError) {
    return { toolNames: [], mcpError: "MCP tool listing failed." };
  }
  return { toolNames: [], mcpError: null };
}

export function formatMcpToolsError(detail: string | null): string {
  if (!detail || detail === "Not Found") {
    return "MCP tools are unavailable for the current engine/session.";
  }
  return detail;
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
