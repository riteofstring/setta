import { describe, expect, it } from "vitest";

import {
  createAllLLMConfigs,
  createEngineConfig,
  createExternalAgentPreflightStatus,
  createLLMConfig,
} from "utils/generatedTypes";
import {
  buildSlashCommandsByEngine,
  filterSkills,
  groupMcpServersByConfigPath,
  groupSkillsByRootPath,
  parseMcpServerRuntimeStatuses,
  resolveMcpServerStatus,
  toRuntimeStatusByServerId,
} from "./projectChatSkillsMcpViewerUtils";

describe("projectChatSkillsMcpViewerUtils", () => {
  it("filters skills by name/path/root/description", () => {
    const rows = [
      {
        skillId: "workspace_skills::ui-layout",
        name: "ui-layout",
        rootLabel: "Workspace skills",
        rootPath: "/workspace/skills",
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
        skillId: "user_codex_skills::frontend-design",
        name: "frontend-design",
        rootLabel: "User ~/.codex/skills",
        rootPath: "/home/.codex/skills",
        relativePath: "frontend-design",
        description: "Create polished frontend interfaces.",
      },
      {
        skillId: "workspace_skills::setta-cli",
        name: "setta-cli",
        rootLabel: "Workspace skills",
        rootPath: "/workspace/skills",
        relativePath: "setta-cli",
        description: "Project-local CLI helpers.",
      },
      {
        skillId: "user_codex_skills::.system/skill-installer",
        name: "skill-installer",
        rootLabel: "User ~/.codex/skills",
        rootPath: "/home/.codex/skills",
        relativePath: ".system/skill-installer",
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
      externalRuntimeServers: [
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

  it("normalizes legacy per-server MCP runtime statuses from structured content", () => {
    const statuses = parseMcpServerRuntimeStatuses({
      structuredContent: {
        servers: [
          {
            serverId: "figma-desktop",
            state: "available",
            quickInfo: "Connected",
            registeredToolCount: 8,
            issue: null,
          },
          {
            serverId: "pencil",
            state: "unavailable",
            quickInfo: "Unavailable: command not found",
            registeredToolCount: 0,
            issue: "command not found",
          },
        ],
      },
    });

    expect(statuses).toEqual({
      "figma-desktop": {
        state: "connected",
        quickInfo: "Connected",
        registeredToolCount: 8,
        issue: null,
        missingEnvVar: null,
      },
      pencil: {
        state: "error",
        quickInfo: "Unavailable: command not found",
        registeredToolCount: 0,
        issue: "command not found",
        missingEnvVar: null,
      },
    });
  });

  it("parses per-server MCP runtime statuses from text content payloads", () => {
    const statuses = parseMcpServerRuntimeStatuses({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            servers: [
              {
                serverId: "playwriter",
                state: "retrying",
                quickInfo: "Retrying connection",
                registeredToolCount: 0,
                issue: "timeout",
              },
            ],
          }),
        },
      ],
    });

    expect(statuses).toEqual({
      playwriter: {
        state: "retrying",
        quickInfo: "Retrying connection",
        registeredToolCount: 0,
        issue: "timeout",
        missingEnvVar: null,
      },
    });
  });

  it("returns null for malformed MCP runtime status payloads", () => {
    const statuses = parseMcpServerRuntimeStatuses({
      structuredContent: {
        servers: [
          {
            state: "available",
          },
        ],
      },
    });

    expect(statuses).toBeNull();
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
        lastError: null,
        missingEnvVar: null,
        toolCount: 8,
      },
      {
        serverId: "broken-server",
        state: "error",
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
        quickInfo: "Error: missing env var OPENAI_API_KEY | command not found | 0 tools",
        registeredToolCount: 0,
        issue: "command not found",
        missingEnvVar: "OPENAI_API_KEY",
      },
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
    const allLLMConfigs = createAllLLMConfigs({
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
      createExternalAgentPreflightStatus({
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
      "/model",
      "/permissions",
      "/search",
      "/help",
    ]);
    expect(rows[1]?.engineId).toBe("engine-codex");
    expect(rows[1]?.commands.map((entry) => entry.command)).toEqual([
      "/new",
      "/resume",
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
        id: "engine-opencode",
        name: "OpenCode",
        engineType: "external_agent",
        externalAgentConfigId: "external-opencode",
      }),
    ];
    const allLLMConfigs = createAllLLMConfigs({
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
      createExternalAgentPreflightStatus({
        configId: "external-opencode",
        name: "OpenCode Agent",
        toolType: "opencode",
        runMode: "app_server",
        available: false,
        supported: true,
        issues: ["cli missing"],
      }),
    ];
    const rows = buildSlashCommandsByEngine({
      engineConfigs,
      allLLMConfigs,
      apiKeys: {},
      externalAgentHealth,
      externalAgentHealthInitialLoadComplete: true,
    });

    expect(rows).toHaveLength(2);
    expect(rows[0]?.commands.map((entry) => entry.command)).toEqual([
      "/new",
      "/resume",
      "/model",
      "/help",
    ]);
    expect(rows[1]?.commands.map((entry) => entry.command)).toEqual([
      "/new",
      "/resume",
      "/model",
      "/help",
    ]);
  });
});
