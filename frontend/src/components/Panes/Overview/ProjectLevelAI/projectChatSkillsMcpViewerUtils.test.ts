import { describe, expect, it } from "vitest";

import {
  filterSkills,
  formatMcpToolsError,
  parseMcpToolsFromResult,
} from "./projectChatSkillsMcpViewerUtils";

describe("projectChatSkillsMcpViewerUtils", () => {
  it("parses mcp tool names from structured content", () => {
    const parsed = parseMcpToolsFromResult({
      isError: false,
      structuredContent: {
        tools: ["setta__set_app_definition", "setta__stream_app_definition"],
      },
    });
    expect(parsed.toolNames).toEqual([
      "setta__set_app_definition",
      "setta__stream_app_definition",
    ]);
    expect(parsed.mcpError).toBeNull();
  });

  it("returns fallback error text for unresolved mcp errors", () => {
    expect(formatMcpToolsError(null)).toBe(
      "MCP tools are unavailable for the current engine/session.",
    );
    expect(formatMcpToolsError("Not Found")).toBe(
      "MCP tools are unavailable for the current engine/session.",
    );
  });

  it("filters skills by name/path/root/description", () => {
    const rows = [
      {
        skillId: "workspace_skills::ui-layout",
        name: "ui-layout",
        rootLabel: "Workspace skills",
        rootPath: "/workspace/skills",
        relativePath: "ui-layout",
        skillPath: "/workspace/skills/ui-layout/SKILL.md",
        description: "Create dense dashboard layouts.",
      },
      {
        skillId: "user_agents_skills::build-tools",
        name: "build-tools",
        rootLabel: "User ~/.agents/skills",
        rootPath: "/home/.agents/skills",
        relativePath: "build-tools",
        skillPath: "/home/.agents/skills/build-tools/SKILL.md",
        description: "Automate builds and releases.",
      },
    ];

    expect(filterSkills(rows, "dashboard")).toHaveLength(1);
    expect(filterSkills(rows, "build-tools")[0]?.skillId).toBe(
      "user_agents_skills::build-tools",
    );
    expect(filterSkills(rows, "")).toHaveLength(2);
  });
});
