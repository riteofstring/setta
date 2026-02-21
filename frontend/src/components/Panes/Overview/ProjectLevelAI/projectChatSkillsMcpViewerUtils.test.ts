import { describe, expect, it } from "vitest";

import {
  EngineTypeEnum,
  ExternalAgentToolTypeEnum,
  type BaseChatMessageUnion,
} from "utils/generatedTypes";
import {
  buildMcpStatusSummary,
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

  it("groups MCP runtime statuses and keeps missing config path nullable", () => {
    const groups = groupMcpServersByConfigPath({
      mcpRuntimeStatuses: [
        {
          serverId: "setta",
          source: "setta_mcp",
          transport: "sse",
          endpoint: "http://127.0.0.1:8000/mcp",
          state: "connected",
          lastAttemptAt: null,
          lastConnectedAt: null,
          lastFailureAt: null,
          consecutiveFailures: 0,
          lastError: null,
          missingEnvVar: null,
          toolCount: 12,
        },
      ],
      externalMcpRuntimeStatuses: [
        {
          serverId: "filesystem",
          source: "external_runtime",
          transport: "stdio",
          endpoint: "npx @modelcontextprotocol/server-filesystem",
          state: "unknown",
          lastAttemptAt: null,
          lastConnectedAt: null,
          lastFailureAt: null,
          consecutiveFailures: 0,
          lastError: null,
          missingEnvVar: null,
          toolCount: 0,
        },
      ],
      mcpConfigPath: null,
      settaFilesLocation: "local",
    });

    expect(groups).toHaveLength(2);
    expect(groups[0]?.configPath).toBeNull();
    expect(groups[0]?.sourceLabel).toBe("Setta MCP");
    expect(groups[0]?.servers[0]?.endpoint).toBe("http://127.0.0.1:8000/mcp");
    expect(groups[1]?.sourceLabel).toBe("External Runtime");
    expect(groups[1]?.servers[0]?.state).toBe("unknown");
  });

  it("builds MCP status summary counts", () => {
    const summary = buildMcpStatusSummary([
      {
        configPath: "/tmp/llm_config.json",
        configLabel: "Active local setta_files",
        sourceLabel: "Setta MCP",
        servers: [
          {
            serverId: "setta",
            source: "setta_mcp",
            transport: "sse",
            endpoint: "http://127.0.0.1:8000/mcp",
            state: "connected",
            lastAttemptAt: null,
            lastConnectedAt: null,
            lastFailureAt: null,
            consecutiveFailures: 0,
            lastError: null,
            missingEnvVar: null,
            toolCount: 8,
          },
          {
            serverId: "github",
            source: "setta_mcp",
            transport: "streamable_http",
            endpoint: "http://localhost:8100/mcp",
            state: "retrying",
            lastAttemptAt: null,
            lastConnectedAt: null,
            lastFailureAt: null,
            consecutiveFailures: 2,
            lastError: "connection failed",
            missingEnvVar: null,
            toolCount: 0,
          },
          {
            serverId: "local-only",
            source: "setta_mcp",
            transport: "stdio",
            endpoint: "python -m local.mcp",
            state: "disabled",
            lastAttemptAt: null,
            lastConnectedAt: null,
            lastFailureAt: null,
            consecutiveFailures: 0,
            lastError: null,
            missingEnvVar: null,
            toolCount: 0,
          },
        ],
      },
    ]);

    expect(summary.total).toBe(3);
    expect(summary.connected).toBe(1);
    expect(summary.retrying).toBe(1);
    expect(summary.error).toBe(0);
    expect(summary.disabled).toBe(1);
    expect(summary.unknown).toBe(0);
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

  it("marks codex skills active from $skill tokens in user prompts", () => {
    const skills = [
      {
        skillId: "workspace_agents_skills::ui-layout",
        name: "ui-layout",
        rootLabel: "Workspace .agents/skills",
        rootPath: "/workspace/.agents/skills",
        relativePath: "ui-layout",
        description: "Codex skill",
      },
    ];
    const messages: BaseChatMessageUnion[] = [
      {
        id: "user-1",
        role: "user",
        content: [{ type: "text", text: "Use $ui-layout for this task." }],
        attachments: [],
      },
    ];

    const status = buildSkillStatusBySkillId({
      skills,
      engineType: EngineTypeEnum.external_agent,
      externalAgentToolType: ExternalAgentToolTypeEnum.codex,
      messages,
    });

    expect(status["workspace_agents_skills::ui-layout"]?.activityState).toBe(
      "active",
    );
    expect(status["workspace_agents_skills::ui-layout"]?.activitySource).toBe(
      "codex_skill_token",
    );
  });

  it("marks multiple codex skills active when tokens follow one activation phrase", () => {
    const skills = [
      {
        skillId: "workspace_agents_skills::readme",
        name: "readme",
        rootLabel: "Workspace .agents/skills",
        rootPath: "/workspace/.agents/skills",
        relativePath: "readme",
        description: "Codex skill",
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
    const messages: BaseChatMessageUnion[] = [
      {
        id: "user-1",
        role: "user",
        content: [
          {
            type: "text",
            text: "Use: $readme, then $ui-layout.",
          },
        ],
        attachments: [],
      },
    ];

    const status = buildSkillStatusBySkillId({
      skills,
      engineType: EngineTypeEnum.external_agent,
      externalAgentToolType: ExternalAgentToolTypeEnum.codex,
      messages,
    });

    expect(status["workspace_agents_skills::readme"]?.activityState).toBe(
      "active",
    );
    expect(status["workspace_agents_skills::ui-layout"]?.activityState).toBe(
      "active",
    );
  });

  it("keeps mixed skill-and-shell lines token-scoped for codex activity", () => {
    const skills = [
      {
        skillId: "workspace_agents_skills::readme",
        name: "readme",
        rootLabel: "Workspace .agents/skills",
        rootPath: "/workspace/.agents/skills",
        relativePath: "readme",
        description: "Codex skill",
      },
      {
        skillId: "workspace_agents_skills::home",
        name: "home",
        rootLabel: "Workspace .agents/skills",
        rootPath: "/workspace/.agents/skills",
        relativePath: "home",
        description: "Codex skill",
      },
    ];
    const messages: BaseChatMessageUnion[] = [
      {
        id: "user-1",
        role: "user",
        content: [
          {
            type: "text",
            text: "Use $readme, then run echo $HOME",
          },
        ],
        attachments: [],
      },
    ];

    const status = buildSkillStatusBySkillId({
      skills,
      engineType: EngineTypeEnum.external_agent,
      externalAgentToolType: ExternalAgentToolTypeEnum.codex,
      messages,
    });

    expect(status["workspace_agents_skills::readme"]?.activityState).toBe(
      "active",
    );
    expect(status["workspace_agents_skills::home"]?.activityState).toBe(
      "inactive",
    );
  });

  it("keeps codex activity inactive for shell-style variable usage", () => {
    const skills = [
      {
        skillId: "workspace_agents_skills::readme",
        name: "readme",
        rootLabel: "Workspace .agents/skills",
        rootPath: "/workspace/.agents/skills",
        relativePath: "readme",
        description: "Codex skill",
      },
    ];
    const messages: BaseChatMessageUnion[] = [
      {
        id: "user-1",
        role: "user",
        content: [
          {
            type: "text",
            // Shell-like variable references should not activate skills.
            text: "Set env first: export $readme && echo $readme",
          },
        ],
        attachments: [],
      },
    ];

    const status = buildSkillStatusBySkillId({
      skills,
      engineType: EngineTypeEnum.external_agent,
      externalAgentToolType: ExternalAgentToolTypeEnum.codex,
      messages,
    });

    expect(status["workspace_agents_skills::readme"]?.activityState).toBe(
      "inactive",
    );
  });

  it("ignores codex skill tokens when they are only inside code spans or fences", () => {
    const skills = [
      {
        skillId: "workspace_agents_skills::readme",
        name: "readme",
        rootLabel: "Workspace .agents/skills",
        rootPath: "/workspace/.agents/skills",
        relativePath: "readme",
        description: "Codex skill",
      },
    ];
    const messages: BaseChatMessageUnion[] = [
      {
        id: "user-1",
        role: "user",
        content: [
          {
            type: "text",
            text: [
              "Use this command:",
              "`echo $readme`",
              "```bash",
              "echo $readme",
              "```",
            ].join("\n"),
          },
        ],
        attachments: [],
      },
    ];

    const status = buildSkillStatusBySkillId({
      skills,
      engineType: EngineTypeEnum.external_agent,
      externalAgentToolType: ExternalAgentToolTypeEnum.codex,
      messages,
    });

    expect(status["workspace_agents_skills::readme"]?.activityState).toBe(
      "inactive",
    );
  });

  it("keeps codex activity inactive for tool-call-only skill signals", () => {
    const skills = [
      {
        skillId: "workspace_agents_skills::ui-layout",
        name: "ui-layout",
        rootLabel: "Workspace .agents/skills",
        rootPath: "/workspace/.agents/skills",
        relativePath: "ui-layout",
        description: "Codex skill",
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
              name: "mcp__setta__skill/ui-layout",
              arguments: "{}",
            },
          },
        ],
      },
    ];

    const status = buildSkillStatusBySkillId({
      skills,
      engineType: EngineTypeEnum.external_agent,
      externalAgentToolType: ExternalAgentToolTypeEnum.codex,
      messages,
    });

    expect(status["workspace_agents_skills::ui-layout"]?.activityState).toBe(
      "inactive",
    );
  });

  it("ignores tool names that only contain the word skill as a substring", () => {
    const skills = [
      {
        skillId: "workspace_agents_skills::readme",
        name: "readme",
        rootLabel: "Workspace .agents/skills",
        rootPath: "/workspace/.agents/skills",
        relativePath: "readme",
        description: "Codex skill",
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
              name: "mcp__repo__skillful_search",
              arguments: { name: "readme" },
            },
          },
        ],
      },
    ];

    const status = buildSkillStatusBySkillId({
      skills,
      engineType: EngineTypeEnum.external_agent,
      externalAgentToolType: ExternalAgentToolTypeEnum.codex,
      messages,
    });

    expect(status["workspace_agents_skills::readme"]?.activityState).toBe(
      "inactive",
    );
  });

  it("prefers applicable roots when active skill token matches multiple skills", () => {
    const skills = [
      {
        skillId: "workspace_agents_skills::shared-skill",
        name: "shared-skill",
        rootLabel: "Workspace .agents/skills",
        rootPath: "/workspace/.agents/skills",
        relativePath: "shared-skill",
        description: "Codex shared skill",
      },
      {
        skillId: "workspace_claude_skills::shared-skill",
        name: "shared-skill",
        rootLabel: "Workspace .claude/skills",
        rootPath: "/workspace/.claude/skills",
        relativePath: "shared-skill",
        description: "Claude shared skill",
      },
    ];
    const messages: BaseChatMessageUnion[] = [
      {
        id: "user-1",
        role: "user",
        content: [{ type: "text", text: "Please load $shared-skill now." }],
        attachments: [],
      },
    ];

    const status = buildSkillStatusBySkillId({
      skills,
      engineType: EngineTypeEnum.external_agent,
      externalAgentToolType: ExternalAgentToolTypeEnum.codex,
      messages,
    });

    expect(status["workspace_agents_skills::shared-skill"]?.activityState).toBe(
      "active",
    );
    expect(status["workspace_claude_skills::shared-skill"]?.activityState).toBe(
      "inactive",
    );
  });

  it("keeps activity inactive when no signal is present", () => {
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
      "inactive",
    );
    expect(status["workspace_agents_skills::ui-layout"]?.activityState).toBe(
      "inactive",
    );
  });
});
