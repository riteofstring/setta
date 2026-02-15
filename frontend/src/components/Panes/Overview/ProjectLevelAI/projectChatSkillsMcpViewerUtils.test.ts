import { describe, expect, it } from "vitest";

import {
  EngineTypeEnum,
  ExternalAgentToolTypeEnum,
  type BaseChatMessageUnion,
} from "utils/generatedTypes";
import {
  buildSkillStatusBySkillId,
  filterSkills,
  groupMcpServersByConfigPath,
  groupSkillsByRootPath,
} from "./projectChatSkillsMcpViewerUtils";

describe("projectChatSkillsMcpViewerUtils", () => {
  it("filters skills by name/path/root/description", () => {
    const rows = [
      {
        skillId: "workspace_agents_skills::ui-layout",
        name: "ui-layout",
        rootLabel: "Workspace .agents/skills",
        rootPath: "/workspace/.agents/skills",
        relativePath: "ui-layout",
        description: "Create dense dashboard layouts.",
      },
      {
        skillId: "user_agents_skills::build-tools",
        name: "build-tools",
        rootLabel: "User ~/.agents/skills",
        rootPath: "/home/.agents/skills",
        relativePath: "build-tools",
        description: "Automate builds and releases.",
      },
    ];

    expect(filterSkills(rows, "dashboard")).toHaveLength(1);
    expect(filterSkills(rows, "build-tools")[0]?.skillId).toBe(
      "user_agents_skills::build-tools",
    );
    expect(filterSkills(rows, "")).toHaveLength(2);
  });

  it("groups filtered skills by root path", () => {
    const rows = [
      {
        skillId: "user_claude_skills::frontend-design",
        name: "frontend-design",
        rootLabel: "User ~/.claude/skills",
        rootPath: "/home/.claude/skills",
        relativePath: "frontend-design",
        description: "Create polished frontend interfaces.",
      },
      {
        skillId: "workspace_agents_skills::setta-cli",
        name: "setta-cli",
        rootLabel: "Workspace .agents/skills",
        rootPath: "/workspace/.agents/skills",
        relativePath: "setta-cli",
        description: "Project-local CLI helpers.",
      },
      {
        skillId: "user_claude_skills::.system/skill-installer",
        name: "skill-installer",
        rootLabel: "User ~/.claude/skills",
        rootPath: "/home/.claude/skills",
        relativePath: ".system/skill-installer",
        description: "Install curated skills.",
      },
    ];

    const groups = groupSkillsByRootPath(rows);
    expect(groups).toHaveLength(2);
    expect(groups[0]?.rootPath).toBe("/home/.claude/skills");
    expect(groups[0]?.skills.map((skill) => skill.skillId)).toEqual([
      "user_claude_skills::.system/skill-installer",
      "user_claude_skills::frontend-design",
    ]);
    expect(groups[1]?.rootPath).toBe("/workspace/.agents/skills");
  });

  it("keeps missing MCP config path nullable instead of using a sentinel string", () => {
    const groups = groupMcpServersByConfigPath({
      mcpServers: {
        setta: {
          transport: "sse",
          url: "http://127.0.0.1:8000/mcp",
        },
      },
      mcpConfigPath: null,
      settaFilesLocation: "local",
    });

    expect(groups).toHaveLength(1);
    expect(groups[0]?.configPath).toBeNull();
    expect(groups[0]?.servers[0]?.endpoint).toBe("http://127.0.0.1:8000/mcp");
  });

  it("marks applicability from root ids based on selected engine tool type", () => {
    const skills = [
      {
        skillId: "workspace_agents_skills::ui-layout",
        name: "ui-layout",
        rootLabel: "Workspace .agents/skills",
        rootPath: "/workspace/.agents/skills",
        relativePath: "ui-layout",
        description: "Codex root skill",
      },
      {
        skillId: "workspace_claude_skills::handoff",
        name: "handoff",
        rootLabel: "Workspace .claude/skills",
        rootPath: "/workspace/.claude/skills",
        relativePath: "handoff",
        description: "Claude root skill",
      },
      {
        skillId: "workspace_opencode_skills::frontend-design",
        name: "frontend-design",
        rootLabel: "Workspace .opencode/skills",
        rootPath: "/workspace/.opencode/skills",
        relativePath: "frontend-design",
        description: "OpenCode root skill",
      },
    ];

    const codexStatus = buildSkillStatusBySkillId({
      skills,
      engineType: EngineTypeEnum.external_agent,
      externalAgentToolType: ExternalAgentToolTypeEnum.codex,
      messages: [],
    });
    expect(
      codexStatus["workspace_agents_skills::ui-layout"]?.isApplicable,
    ).toBe(true);
    expect(codexStatus["workspace_claude_skills::handoff"]?.isApplicable).toBe(
      false,
    );
    expect(
      codexStatus["workspace_opencode_skills::frontend-design"]?.isApplicable,
    ).toBe(false);

    const settaStatus = buildSkillStatusBySkillId({
      skills,
      engineType: EngineTypeEnum.setta_llm,
      externalAgentToolType: null,
      messages: [],
    });
    expect(
      settaStatus["workspace_agents_skills::ui-layout"]?.isApplicable,
    ).toBe(false);
    expect(settaStatus["workspace_claude_skills::handoff"]?.isApplicable).toBe(
      false,
    );
  });

  it("marks active skills from skill tool invocations", () => {
    const skills = [
      {
        skillId: "workspace_opencode_skills::ui-layout",
        name: "ui-layout",
        rootLabel: "Workspace .opencode/skills",
        rootPath: "/workspace/.opencode/skills",
        relativePath: "ui-layout",
        description: "OpenCode skill",
      },
      {
        skillId: "workspace_opencode_skills::documentation",
        name: "documentation",
        rootLabel: "Workspace .opencode/skills",
        rootPath: "/workspace/.opencode/skills",
        relativePath: "documentation",
        description: "OpenCode skill",
      },
    ];
    const messages: BaseChatMessageUnion[] = [
      {
        id: "assistant-1",
        role: "assistant",
        content: [],
        attachments: [],
        tool_calls: [
          {
            id: "tc-1",
            type: "function",
            function: {
              name: "skill",
              arguments: { name: "ui-layout" },
            },
          },
        ],
      },
    ];

    const status = buildSkillStatusBySkillId({
      skills,
      engineType: EngineTypeEnum.external_agent,
      externalAgentToolType: ExternalAgentToolTypeEnum.opencode,
      messages,
    });

    expect(status["workspace_opencode_skills::ui-layout"]?.activityState).toBe(
      "active",
    );
    expect(status["workspace_opencode_skills::ui-layout"]?.activitySource).toBe(
      "opencode_skill_tool",
    );
    expect(
      status["workspace_opencode_skills::documentation"]?.activityState,
    ).toBe("inactive");
  });

  it("uses unknown activity for claude-applicable skills when no signal is present", () => {
    const skills = [
      {
        skillId: "workspace_claude_skills::handoff",
        name: "handoff",
        rootLabel: "Workspace .claude/skills",
        rootPath: "/workspace/.claude/skills",
        relativePath: "handoff",
        description: "Claude skill",
      },
      {
        skillId: "workspace_agents_skills::ui-layout",
        name: "ui-layout",
        rootLabel: "Workspace .agents/skills",
        rootPath: "/workspace/.agents/skills",
        relativePath: "ui-layout",
        description: "Codex skill",
      },
    ];

    const status = buildSkillStatusBySkillId({
      skills,
      engineType: EngineTypeEnum.external_agent,
      externalAgentToolType: ExternalAgentToolTypeEnum.claude_code,
      messages: [],
    });

    expect(status["workspace_claude_skills::handoff"]?.activityState).toBe(
      "unknown",
    );
    expect(status["workspace_agents_skills::ui-layout"]?.activityState).toBe(
      "inactive",
    );
  });
});
