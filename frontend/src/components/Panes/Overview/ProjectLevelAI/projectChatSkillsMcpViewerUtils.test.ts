import { describe, expect, it } from "vitest";

import type { HttpapiExternalAgentPreflightStatus } from "openapi/http";
import {
  createAgentRun,
  createAllConfigs,
  createEngineConfig,
  createLLMConfig,
} from "utils/generatedTypes";
import { buildAppGenerationSlashCommandDefinitions } from "../../../../../../plugins/setta-json-render-app-gen/frontend/src/appSubsystemChatUi";
import {
  buildReservedSlashCommandTokens,
  buildSkillStatusBySkillId,
  buildSlashCommandsByEngine,
  collectAgentNativeSlashCommandTokensFromEntries,
  filterSkills,
  groupMcpServersByConfigPath,
  groupSkillsByRootPath,
  reconcileCustomSlashCommands,
  resolveAgentNativeSlashCommandsByEngineId,
  resolveMcpServerStatus,
  resolveVisibleAgentNativeSlashCommandsByEngineId,
  toRuntimeStatusByServerId,
} from "./projectChatSkillsMcpViewerUtils";

const APP_GENERATION_SLASH_COMMANDS =
  buildAppGenerationSlashCommandDefinitions();

function buildExternalAgentPreflightStatus(
  overrides: Partial<HttpapiExternalAgentPreflightStatus> = {},
): HttpapiExternalAgentPreflightStatus {
  return {
    available: true,
    baseUrl: null,
    cliVersion: null,
    configId: "external-agent-config",
    envVars: {
      missing: [],
      present: [],
    },
    issues: [],
    name: "Codex",
    runMode: "subprocess",
    sdkVersion: null,
    supported: true,
    toolType: "codex",
    workingDir: null,
    ...overrides,
  };
}

describe("projectChatSkillsMcpViewerUtils", () => {
  it("filters skills by name/path/root/description", () => {
    const rows = [
      {
        skillId: "workspace_skills::ui-layout",
        name: "ui-layout",
        rootLabel: "Workspace skills",
        rootPath: "/workspace/skills",
        relativePath: "ui-layout",
        isEditable: false,
        editabilityReason: null,
        description: "Create dense dashboard layouts.",
      },
      {
        skillId: "user_agents_skills::build-tools",
        name: "build-tools",
        rootLabel: "User ~/.agents/skills",
        rootPath: "/home/.agents/skills",
        relativePath: "build-tools",
        isEditable: true,
        editabilityReason: null,
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
        skillId: "user_codex_skills::frontend-design",
        name: "frontend-design",
        rootLabel: "User ~/.codex/skills",
        rootPath: "/home/.codex/skills",
        relativePath: "frontend-design",
        isEditable: false,
        editabilityReason: null,
        description: "Create polished frontend interfaces.",
      },
      {
        skillId: "workspace_skills::setta-cli",
        name: "setta-cli",
        rootLabel: "Workspace skills",
        rootPath: "/workspace/skills",
        relativePath: "setta-cli",
        isEditable: false,
        editabilityReason: null,
        description: "Project-local CLI helpers.",
      },
      {
        skillId: "user_codex_skills::.system/skill-installer",
        name: "skill-installer",
        rootLabel: "User ~/.codex/skills",
        rootPath: "/home/.codex/skills",
        relativePath: ".system/skill-installer",
        isEditable: false,
        editabilityReason: null,
        description: "Install curated skills.",
      },
    ];

    const groups = groupSkillsByRootPath(rows);
    expect(groups).toHaveLength(2);
    expect(groups[0]?.rootPath).toBe("/home/.codex/skills");
    expect(groups[0]?.skills.map((skill) => skill.skillId)).toEqual([
      "user_codex_skills::.system/skill-installer",
      "user_codex_skills::frontend-design",
    ]);
    expect(groups[1]?.rootPath).toBe("/workspace/skills");
  });

  it("keeps codex skill activity unknown when only prompt text references a skill token", () => {
    const statuses = buildSkillStatusBySkillId({
      skills: [
        {
          skillId: "workspace_agents_skills::frontend-design",
          name: "frontend-design",
          rootLabel: "Workspace .agents/skills",
          rootPath: "/workspace/.agents/skills",
          relativePath: "frontend-design",
          isEditable: true,
          editabilityReason: null,
          description: "Create polished frontend interfaces.",
        },
      ],
      engineType: "external_agent",
      externalAgentToolType: "codex",
      messages: [
        {
          id: "user-1",
          role: "user",
          content: [
            {
              type: "text",
              text: "Please use $frontend-design for this task.",
            },
          ],
          attachments: [],
        },
      ],
    });

    expect(
      statuses["workspace_agents_skills::frontend-design"]?.activityState,
    ).toBe("unknown");
    expect(
      statuses["workspace_agents_skills::frontend-design"]?.activitySource,
    ).toBeNull();
  });

  it("marks codex skills active when structured skill tool invocations exist", () => {
    const statuses = buildSkillStatusBySkillId({
      skills: [
        {
          skillId: "workspace_agents_skills::frontend-design",
          name: "frontend-design",
          rootLabel: "Workspace .agents/skills",
          rootPath: "/workspace/.agents/skills",
          relativePath: "frontend-design",
          isEditable: true,
          editabilityReason: null,
          description: "Create polished frontend interfaces.",
        },
      ],
      engineType: "external_agent",
      externalAgentToolType: "codex",
      messages: [
        {
          id: "assistant-1",
          role: "assistant",
          content: [],
          attachments: [],
          tool_calls: [
            {
              id: "tool-call-1",
              type: "function",
              function: {
                name: "skill/frontend-design",
                arguments: {},
              },
            },
          ],
        },
      ],
    });

    expect(
      statuses["workspace_agents_skills::frontend-design"]?.activityState,
    ).toBe("active");
    expect(
      statuses["workspace_agents_skills::frontend-design"]?.activitySource,
    ).toBe("codex_skill_tool");
  });

  it("marks codex skills active when tool messages carry structured skill arguments", () => {
    const statuses = buildSkillStatusBySkillId({
      skills: [
        {
          skillId: "workspace_agents_skills::frontend-design",
          name: "frontend-design",
          rootLabel: "Workspace .agents/skills",
          rootPath: "/workspace/.agents/skills",
          relativePath: "frontend-design",
          isEditable: true,
          editabilityReason: null,
          description: "Create polished frontend interfaces.",
        },
      ],
      engineType: "external_agent",
      externalAgentToolType: "codex",
      messages: [
        {
          id: "tool-1",
          role: "tool",
          tool_name: "mcp__codex__skill",
          arguments: JSON.stringify({
            skillName: "frontend-design",
          }),
          content: [],
          attachments: [],
        },
      ],
    });

    expect(
      statuses["workspace_agents_skills::frontend-design"]?.activityState,
    ).toBe("active");
    expect(
      statuses["workspace_agents_skills::frontend-design"]?.activitySource,
    ).toBe("codex_skill_tool");
  });

  it("fails closed when multiple skills match the same runtime identifier", () => {
    const statuses = buildSkillStatusBySkillId({
      skills: [
        {
          skillId: "workspace_agents_skills::triage",
          name: "triage",
          rootLabel: "Workspace .agents/skills",
          rootPath: "/workspace/.agents/skills",
          relativePath: "triage",
          isEditable: true,
          editabilityReason: null,
          description: "Workspace triage instructions.",
        },
        {
          skillId: "user_agents_skills::triage",
          name: "triage",
          rootLabel: "User ~/.agents/skills",
          rootPath: "/home/.agents/skills",
          relativePath: "triage",
          isEditable: true,
          editabilityReason: null,
          description: "User triage instructions.",
        },
      ],
      engineType: "external_agent",
      externalAgentToolType: "codex",
      messages: [
        {
          id: "assistant-1",
          role: "assistant",
          content: [],
          attachments: [],
          tool_calls: [
            {
              id: "tool-call-1",
              type: "function",
              function: {
                name: "skill/triage",
                arguments: {},
              },
            },
          ],
        },
      ],
    });

    expect(statuses["workspace_agents_skills::triage"]?.activityState).toBe(
      "unknown",
    );
    expect(
      statuses["workspace_agents_skills::triage"]?.activitySource,
    ).toBeNull();
    expect(statuses["user_agents_skills::triage"]?.activityState).toBe(
      "unknown",
    );
    expect(statuses["user_agents_skills::triage"]?.activitySource).toBeNull();
  });

  it("keeps cross-ecosystem duplicates active only for the applicable codex root", () => {
    const statuses = buildSkillStatusBySkillId({
      skills: [
        {
          skillId: "workspace_agents_skills::triage",
          name: "triage",
          rootLabel: "Workspace .agents/skills",
          rootPath: "/workspace/.agents/skills",
          relativePath: "triage",
          isEditable: true,
          editabilityReason: null,
          description: "Codex triage instructions.",
        },
        {
          skillId: "workspace_claude_skills::triage",
          name: "triage",
          rootLabel: "Workspace .claude/skills",
          rootPath: "/workspace/.claude/skills",
          relativePath: "triage",
          isEditable: false,
          editabilityReason: null,
          description: "Claude triage instructions.",
        },
      ],
      engineType: "external_agent",
      externalAgentToolType: "codex",
      messages: [
        {
          id: "assistant-1",
          role: "assistant",
          content: [],
          attachments: [],
          tool_calls: [
            {
              id: "tool-call-1",
              type: "function",
              function: {
                name: "skill/triage",
                arguments: {},
              },
            },
          ],
        },
      ],
    });

    expect(statuses["workspace_agents_skills::triage"]?.activityState).toBe(
      "active",
    );
    expect(statuses["workspace_agents_skills::triage"]?.activitySource).toBe(
      "codex_skill_tool",
    );
    expect(statuses["workspace_claude_skills::triage"]?.activityState).toBe(
      "inactive",
    );
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

  it("labels explicit setta_files roots as custom", () => {
    const groups = groupMcpServersByConfigPath({
      mcpServers: {
        figma: {
          transport: "streamable_http",
          url: "http://127.0.0.1:3845/mcp",
        },
      },
      mcpConfigPath: "/tmp/workspace/setta_files_dev/llm_config.json",
      settaFilesLocation: "custom",
    });

    expect(groups).toHaveLength(1);
    expect(groups[0]?.configLabel).toBe("Active custom setta_files root");
  });

  it("appends external runtime servers as a separate group", () => {
    const groups = groupMcpServersByConfigPath({
      mcpServers: {
        figma: {
          transport: "streamable_http",
          url: "http://127.0.0.1:3845/mcp",
        },
      },
      mcpConfigPath: "/tmp/workspace/setta_files_dev/llm_config.json",
      settaFilesLocation: "custom",
      runtimeServers: [
        {
          serverId: "codex-remote",
          transport: "sse",
          endpoint: "http://127.0.0.1:9999/mcp",
        },
      ],
    });

    expect(groups).toHaveLength(2);
    expect(groups[0]?.configLabel).toBe("Active custom setta_files root");
    expect(groups[1]?.configLabel).toBe("Active external runtime");
    expect(groups[1]?.servers[0]?.serverId).toBe("codex-remote");
  });

  it("prefers live external runtime transport for configured servers", () => {
    const groups = groupMcpServersByConfigPath({
      mcpServers: {
        setta: {
          transport: "sse",
          url: "http://127.0.0.1:8019/mcp",
        },
      },
      mcpConfigPath: "/tmp/workspace/setta_files/llm_config.json",
      settaFilesLocation: "local",
      runtimeServers: [
        {
          serverId: "setta",
          transport: "streamable_http",
          endpoint: "http://127.0.0.1:8019/mcp",
        },
      ],
    });

    expect(groups).toHaveLength(1);
    expect(groups[0]?.configLabel).toBe("Active local setta_files");
    expect(groups[0]?.servers).toEqual([
      {
        serverId: "setta",
        transport: "streamable_http",
        endpoint: "http://127.0.0.1:8019/mcp",
      },
    ]);
  });

  it("marks runtime connected servers as available", () => {
    const status = resolveMcpServerStatus({
      serverId: "figma-desktop",
      endpoint: "http://127.0.0.1:3845/mcp",
      runtimeStatusByServerId: {
        "figma-desktop": {
          state: "connected",
          quickInfo: "Available: connected with 8 tools.",
          registeredToolCount: 8,
          issue: null,
          missingEnvVar: null,
        },
      },
      runtimeStatusLoading: false,
      runtimeStatusError: null,
    });

    expect(status.color).toBe("green");
    expect(status.quickInfo).toContain("connected with 8 tools");
  });

  it("marks runtime error servers as unavailable", () => {
    const status = resolveMcpServerStatus({
      serverId: "pencil",
      endpoint: "/Applications/Pencil.app/Contents/Resources/app.asar",
      runtimeStatusByServerId: {
        pencil: {
          state: "error",
          quickInfo: "Unavailable: command not found",
          registeredToolCount: 0,
          issue: "command not found",
          missingEnvVar: null,
        },
      },
      runtimeStatusLoading: false,
      runtimeStatusError: null,
    });

    expect(status.color).toBe("red");
    expect(status.quickInfo).toContain("command not found");
  });

  it("marks runtime connecting servers as yellow", () => {
    const status = resolveMcpServerStatus({
      serverId: "figma-desktop",
      endpoint: "http://127.0.0.1:3845/mcp",
      runtimeStatusByServerId: {
        "figma-desktop": {
          state: "connecting",
          quickInfo: "Connecting...",
          registeredToolCount: 0,
          issue: null,
          missingEnvVar: null,
        },
      },
      runtimeStatusLoading: false,
      runtimeStatusError: null,
    });

    expect(status.color).toBe("yellow");
    expect(status.quickInfo).toContain("Connecting");
  });

  it("marks runtime lookup failures as unknown status", () => {
    const status = resolveMcpServerStatus({
      serverId: "pencil",
      endpoint: "/Applications/Pencil.app/Contents/Resources/app.asar",
      runtimeStatusByServerId: null,
      runtimeStatusLoading: false,
      runtimeStatusError: "unknown MCP server 'pencil'",
    });

    expect(status.color).toBe("yellow");
    expect(status.quickInfo).toContain("Status unknown");
  });

  it("marks per-server runtime mapping gaps as unknown", () => {
    const status = resolveMcpServerStatus({
      serverId: "figma-desktop",
      endpoint: "http://127.0.0.1:3845/mcp",
      runtimeStatusByServerId: {},
      runtimeStatusLoading: false,
      runtimeStatusError: null,
    });

    expect(status.color).toBe("yellow");
    expect(status.quickInfo).toContain("not reported");
  });

  it("maps typed runtime status arrays to runtime status lookup maps", () => {
    const runtimeStatuses = toRuntimeStatusByServerId([
      {
        serverId: "figma-desktop",
        state: "connected",
        quickInfo: "Connected: 8 tools",
        lastError: null,
        missingEnvVar: null,
        toolCount: 8,
      },
      {
        serverId: "broken-server",
        state: "error",
        quickInfo:
          "Error: missing env var OPENAI_API_KEY | command not found | 0 tools",
        lastError: "command not found",
        missingEnvVar: "OPENAI_API_KEY",
        toolCount: 0,
      },
    ]);

    expect(runtimeStatuses).toEqual({
      "figma-desktop": {
        state: "connected",
        quickInfo: "Connected: 8 tools",
        registeredToolCount: 8,
        issue: null,
        missingEnvVar: null,
      },
      "broken-server": {
        state: "error",
        quickInfo:
          "Error: missing env var OPENAI_API_KEY | command not found | 0 tools",
        registeredToolCount: 0,
        issue: "command not found",
        missingEnvVar: "OPENAI_API_KEY",
      },
    });
  });

  it("treats non-canonical runtime server states as unknown", () => {
    const runtimeStatuses = toRuntimeStatusByServerId([
      {
        serverId: "legacy-state-server",
        state: "available",
        lastError: null,
        missingEnvVar: null,
        toolCount: 3,
      },
    ]);

    expect(runtimeStatuses["legacy-state-server"]?.state).toBe("unknown");
    expect(runtimeStatuses["legacy-state-server"]?.quickInfo).toBe(
      "Unknown: 3 tools",
    );
  });

  it("synthesizes runtime quick info from issue details when the backend omits it", () => {
    const runtimeStatuses = toRuntimeStatusByServerId([
      {
        serverId: "disabled-server",
        state: "disabled",
        lastError: "disabled by config",
        missingEnvVar: "OPENAI_API_KEY",
        toolCount: 0,
      },
    ]);

    expect(runtimeStatuses["disabled-server"]).toEqual({
      state: "disabled",
      quickInfo:
        "Disabled: missing env var OPENAI_API_KEY | disabled by config | 0 tools",
      registeredToolCount: 0,
      issue: "disabled by config",
      missingEnvVar: "OPENAI_API_KEY",
    });
  });

  it("uses backend-resolved rows directly for shared server ids", () => {
    const runtimeStatuses = toRuntimeStatusByServerId([
      {
        serverId: "shared",
        state: "connected",
        quickInfo: "Connected: 79 tools",
        lastError: null,
        missingEnvVar: null,
        toolCount: 79,
      },
    ]);
    expect(Object.keys(runtimeStatuses)).toEqual(["shared"]);

    const status = resolveMcpServerStatus({
      serverId: "shared",
      endpoint: "http://127.0.0.1:8000/mcp",
      runtimeStatusByServerId: runtimeStatuses,
      runtimeStatusLoading: false,
      runtimeStatusError: null,
    });

    expect(status.color).toBe("green");
    expect(status.quickInfo).toBe("Connected: 79 tools");
  });

  it("uses backend-resolved transport and endpoint for configured rows", () => {
    const groups = groupMcpServersByConfigPath({
      mcpServers: {
        setta: {
          transport: "sse",
          url: "http://127.0.0.1:8019/mcp",
        },
      },
      mcpConfigPath: "/tmp/setta_files/llm_config.json",
      settaFilesLocation: "custom",
      runtimeServers: [
        {
          serverId: "setta",
          transport: "streamable_http",
          endpoint: "http://127.0.0.1:8019/mcp",
        },
      ],
    });

    expect(groups[0]?.servers[0]).toEqual({
      serverId: "setta",
      transport: "streamable_http",
      endpoint: "http://127.0.0.1:8019/mcp",
    });
  });

  it("builds slash commands by engine using setta/external availability", () => {
    const engineConfigs = [
      createEngineConfig({
        id: "engine-setta",
        name: "Setta",
        engineType: "setta_llm",
        settaLlmConfigId: "cfg-openai",
      }),
      createEngineConfig({
        id: "engine-codex",
        name: "Codex Agent",
        engineType: "external_agent",
        externalAgentConfigId: "external-codex",
      }),
    ];
    const allLLMConfigs = createAllConfigs({
      configs: {
        "cfg-openai": createLLMConfig({
          id: "cfg-openai",
          model: "gpt-5",
          provider: "openai",
          api_key_env: "OPENAI_API_KEY",
        }),
      },
    });
    const externalAgentHealth = [
      buildExternalAgentPreflightStatus({
        configId: "external-codex",
        name: "Codex Agent",
        toolType: "codex",
        runMode: "app_server",
        available: true,
        supported: true,
      }),
    ];
    const rows = buildSlashCommandsByEngine({
      engineConfigs,
      appGenerationSlashCommands: APP_GENERATION_SLASH_COMMANDS,
      allLLMConfigs,
      apiKeys: { OPENAI_API_KEY: "secret" },
      externalAgentHealth,
      externalAgentHealthInitialLoadComplete: true,
    });

    expect(rows).toHaveLength(2);
    expect(rows[0]?.engineId).toBe("engine-setta");
    expect(rows[0]?.commands.map((entry) => entry.command)).toEqual([
      "/new",
      "/resume",
      "/app-json",
      "/app-image",
      "/app-prompt",
      "/app-mcp",
      "/model",
      "/permissions",
      "/search",
      "/help",
    ]);
    expect(rows[1]?.engineId).toBe("engine-codex");
    expect(rows[1]?.commands.map((entry) => entry.command)).toEqual([
      "/new",
      "/resume",
      "/app-json",
      "/app-image",
      "/app-prompt",
      "/app-mcp",
      "/model",
      "/permissions",
      "/help",
    ]);
  });

  it("omits permission and search commands when required dependencies are unavailable", () => {
    const engineConfigs = [
      createEngineConfig({
        id: "engine-setta",
        name: "Setta",
        engineType: "setta_llm",
      }),
      createEngineConfig({
        id: "engine-codex",
        name: "Codex",
        engineType: "external_agent",
        externalAgentConfigId: "external-codex",
      }),
    ];
    const allLLMConfigs = createAllConfigs({
      configs: {
        "cfg-anthropic": createLLMConfig({
          id: "cfg-anthropic",
          model: "claude-sonnet",
          provider: "anthropic",
          api_key_env: "ANTHROPIC_API_KEY",
        }),
      },
    });
    const externalAgentHealth = [
      buildExternalAgentPreflightStatus({
        configId: "external-codex",
        name: "Codex Agent",
        toolType: "codex",
        runMode: "app_server",
        available: false,
        supported: true,
        issues: ["cli missing"],
      }),
    ];
    const rows = buildSlashCommandsByEngine({
      engineConfigs,
      appGenerationSlashCommands: APP_GENERATION_SLASH_COMMANDS,
      allLLMConfigs,
      apiKeys: {},
      externalAgentHealth,
      externalAgentHealthInitialLoadComplete: true,
    });

    expect(rows).toHaveLength(2);
    expect(rows[0]?.commands.map((entry) => entry.command)).toEqual([
      "/new",
      "/resume",
      "/app-json",
      "/app-image",
      "/app-prompt",
      "/app-mcp",
      "/model",
      "/help",
    ]);
    expect(rows[1]?.commands.map((entry) => entry.command)).toEqual([
      "/new",
      "/resume",
      "/app-json",
      "/app-image",
      "/app-prompt",
      "/app-mcp",
      "/model",
      "/help",
    ]);
  });

  it("collects normalized agent-native slash tokens from authoritative run metadata", () => {
    const tokens = collectAgentNativeSlashCommandTokensFromEntries(
      resolveAgentNativeSlashCommandsByEngineId({
        runs: [
          createAgentRun({
            id: "run-1",
            inputs: {
              projectConfigId: "project-a",
            },
            outputs: {
              metadata: {
                engineConfigId: "engine-live",
                agentNativeSlashCommands: [" /triage ", "/help", 1],
              },
            },
          }),
          createAgentRun({
            id: "run-2",
            inputs: {
              projectConfigId: "project-a",
            },
            outputs: {
              metadata: {
                engineConfigId: "engine-second",
                agentNativeSlashCommands: ["/TRIAGE", "/ship"],
              },
            },
          }),
          createAgentRun({
            id: "run-ignored",
            inputs: {
              projectConfigId: "project-b",
            },
            outputs: {
              metadata: {
                engineConfigId: "engine-live",
                agentNativeSlashCommands: ["/ignored"],
              },
            },
          }),
        ],
        projectConfigId: "project-a",
        engineConfigIds: ["engine-live", "engine-second"],
      }),
    );

    expect(tokens).toEqual(["/triage", "/help", "/ship"]);
  });

  it("scopes authoritative runtime native slash tokens to the active engine ids", () => {
    const tokens = collectAgentNativeSlashCommandTokensFromEntries(
      resolveAgentNativeSlashCommandsByEngineId({
        runs: [
          createAgentRun({
            id: "run-foreign-engine",
            inputs: {
              projectConfigId: "project-a",
            },
            outputs: {
              metadata: {
                engineConfigId: "engine-foreign",
                agentNativeSlashCommands: ["/deploy"],
              },
            },
          }),
          createAgentRun({
            id: "run-live-engine",
            inputs: {
              projectConfigId: "project-a",
            },
            outputs: {
              metadata: {
                engineConfigId: "engine-live",
                agentNativeSlashCommands: ["/help"],
              },
            },
          }),
        ],
        projectConfigId: "project-a",
        engineConfigIds: ["engine-live"],
      }),
    );

    expect(tokens).toEqual(["/help"]);
  });

  it("ignores authoritative runtime native slash commands from other projects", () => {
    const tokens = collectAgentNativeSlashCommandTokensFromEntries(
      resolveAgentNativeSlashCommandsByEngineId({
        runs: [
          createAgentRun({
            id: "run-project-a",
            inputs: {
              projectConfigId: "project-a",
            },
            outputs: {
              metadata: {
                engineConfigId: "engine-live",
                agentNativeSlashCommands: ["/ship"],
              },
            },
          }),
        ],
        projectConfigId: "project-b",
        engineConfigIds: ["engine-live"],
      }),
    );

    expect(tokens).toEqual([]);
  });

  it("hides native slash entries until runtime authority is ready", () => {
    const visible = resolveVisibleAgentNativeSlashCommandsByEngineId({
      agentRunsAuthorityState: "terminal_error",
      runtimeEntries: {},
    });

    expect(visible).toEqual({});
  });

  it("keeps the newest authoritative runtime metadata per engine across the full run list", () => {
    const resolved = resolveAgentNativeSlashCommandsByEngineId({
      runs: [
        createAgentRun({
          id: "run-project-a-old",
          startedAt: "2026-02-01T00:00:00Z",
          finishedAt: "2026-02-01T00:00:01Z",
          inputs: {
            projectConfigId: "project-a",
          },
          outputs: {
            metadata: {
              engineConfigId: "engine-live",
              agentNativeSlashCommands: ["/old"],
            },
          },
        }),
        createAgentRun({
          id: "run-project-a-new",
          startedAt: "2026-02-02T00:00:00Z",
          finishedAt: "2026-02-02T00:00:01Z",
          inputs: {
            projectConfigId: "project-a",
          },
          outputs: {
            metadata: {
              engineConfigId: "engine-live",
              agentNativeSlashCommands: ["/deploy"],
            },
          },
        }),
      ],
      projectConfigId: "project-a",
      engineConfigIds: ["engine-live"],
    });

    expect(resolved).toEqual({
      "engine-live": {
        commands: ["/deploy"],
        status: "available",
        statusDetail: null,
      },
    });
  });

  it("preserves explicit authoritative native slash status details without commands", () => {
    const resolved = resolveAgentNativeSlashCommandsByEngineId({
      runs: [
        createAgentRun({
          id: "run-project-a-error",
          inputs: {
            projectConfigId: "project-a",
          },
          outputs: {
            metadata: {
              engineConfigId: "engine-live",
              agentNativeSlashCommands: [],
              agentNativeSlashCommandsStatus: "error",
              agentNativeSlashCommandsStatusDetail: "tool discovery failed",
            },
          },
        }),
      ],
      projectConfigId: "project-a",
      engineConfigIds: ["engine-live"],
    });

    expect(resolved).toEqual({
      "engine-live": {
        commands: [],
        status: "error",
        statusDetail: "tool discovery failed",
      },
    });
  });

  it("reconciles colliding custom commands against managed and native reserved tokens", () => {
    const reservedTokens = buildReservedSlashCommandTokens({
      managedCommands: [
        {
          command: "/new",
          action: "new",
          summary: "Start a new thread.",
        },
      ],
      engineCommandGroups: [
        {
          commands: [
            {
              command: "/permissions",
              action: "permissions",
              summary: "Set permissions mode.",
            },
          ],
        },
      ],
      discoveredNativeSlashCommands: ["/triage"],
    });

    const reconciled = reconcileCustomSlashCommands({
      customCommands: [
        {
          command: "/triage",
          action: "custom_prompt",
          summary: "Run a saved custom prompt.",
          promptTemplate: "Custom triage",
        },
        {
          command: "/project-status",
          action: "custom_prompt",
          summary: "Run a saved custom prompt.",
          promptTemplate: "Status report",
        },
      ],
      reservedTokens,
    });

    expect(Array.from(reconciled.conflictingCommandTokens)).toEqual([
      "/triage",
    ]);
    expect(reconciled.executableCommands.map((entry) => entry.command)).toEqual(
      ["/project-status"],
    );
  });
});
