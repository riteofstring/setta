/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EngineTypeEnum, ToolTypeEnum } from "utils/generatedTypes";
import { ProjectChatSkillsMcpViewer } from "./ProjectChatSkillsMcpViewer";

declare global {
  interface Window {
    __SETTA_CHROME_REPRO_ACTIVE__?: boolean;
  }
}

const routeMocks = vi.hoisted(() => ({
  getAppGenSkillContent: vi.fn(),
  getAppGenSkills: vi.fn(),
  getMcpRuntimeStatus: vi.fn(),
  upsertAppGenCustomSkill: vi.fn(),
}));

const mockAIState = vi.hoisted(() => ({
  chatDetails: {},
  apiKeys: {},
  engineConfigs: [],
  engineConfigsInitialLoadComplete: true,
  externalAgentHealth: [],
  externalAgentHealthInitialLoadComplete: true,
  agentRuns: [],
  agentRunsAuthorityState: "ready",
  allLLMConfigs: {
    configs: {},
    mcpServers: {
      setta: {
        transport: "streamable_http",
        url: "http://127.0.0.1:8019/mcp",
      },
    },
    defaultMcpServerIds: [],
    default_config_id: undefined,
  },
  allLLMConfigsInitialLoadComplete: true,
}));

vi.mock("components/Chat/chatComposerControls", () => ({
  buildChatSlashCommands: () => [],
  buildCustomPromptSlashCommandDefinitions: () => [],
  normalizeSlashCommandToken: (value: string) => value.trim().toLowerCase(),
}));

vi.mock("@uiw/react-codemirror", () => ({
  default: () => null,
}));

vi.mock("components/Utils/CodeMirror/getExtensions", () => ({
  getExtensions: () => [],
}));

vi.mock("components/Utils/CodeMirror/useCodeMirrorStyle", () => ({
  useCodeMirrorStyle: () => null,
}));

vi.mock("components/Utils/Combobox/IdNameCombobox", () => ({
  IdNameCombobox: () => null,
}));

vi.mock("state/actions/ai", async () => {
  const actual =
    await vi.importActual<typeof import("state/actions/ai")>(
      "state/actions/ai",
    );
  return {
    ...actual,
    loadAgentRuns: vi.fn(),
  };
});

vi.mock("state/actions/notifications", () => ({
  addTemporaryNotification: vi.fn(),
}));

vi.mock("state/definitions", () => ({
  useAIStore: (selector: (state: typeof mockAIState) => unknown) =>
    selector(mockAIState),
  useLocalStorage: (
    selector: (state: {
      customProjectChatSlashCommandsByProjectConfigId: Record<string, unknown>;
    }) => unknown,
  ) =>
    selector({
      customProjectChatSlashCommandsByProjectConfigId: {},
    }),
}));

vi.mock("openapi/http", () => ({
  getAppGenSkillContent: routeMocks.getAppGenSkillContent,
  getAppGenSkills: routeMocks.getAppGenSkills,
  getMcpServerRuntimeStatus: routeMocks.getMcpRuntimeStatus,
  revealPathInOsFileExplorer: vi.fn(),
  upsertAppGenCustomSkill: routeMocks.upsertAppGenCustomSkill,
}));

describe("ProjectChatSkillsMcpViewer MCP rendering", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    routeMocks.getMcpRuntimeStatus.mockReset();
    routeMocks.getMcpRuntimeStatus.mockResolvedValue({
      data: {
        llmConfigPath: "/tmp/setta_files/llm_config.json",
        activeSettaFilesLocation: "custom",
        servers: [
          {
            serverId: "setta",
            source: "setta_mcp",
            transport: "streamable_http",
            endpoint: "http://127.0.0.1:8019/mcp",
            state: "connected",
            lastAttemptAt: null,
            lastConnectedAt: null,
            lastFailureAt: null,
            consecutiveFailures: 0,
            lastError: null,
            missingEnvVar: null,
            toolCount: 8,
          },
        ],
        externalServers: [],
        resolvedServers: [
          {
            serverId: "setta",
            transport: "streamable_http",
            endpoint: "http://127.0.0.1:8019/mcp",
            state: "connected",
            lastAttemptAt: null,
            lastConnectedAt: null,
            lastFailureAt: null,
            consecutiveFailures: 0,
            lastError: null,
            missingEnvVar: null,
            toolCount: 8,
            quickInfo: "Connected: 8 tools",
          },
        ],
      },
      error: undefined,
      response: new Response(null, { status: 200 }),
    });
    window.__SETTA_CHROME_REPRO_ACTIVE__ = false;
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
  });

  it("renders connected tool counts inline for MCP servers", async () => {
    await act(async () => {
      root.render(
        <ProjectChatSkillsMcpViewer
          projectConfigId="project-alpha"
          chatId="chat-alpha"
          engineConfigId="engine-codex"
          engineType={EngineTypeEnum.external_agent}
          externalAgentToolType={ToolTypeEnum.codex}
          viewMode="mcp"
        />,
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    const serverStatus = host.querySelector(
      '[data-testid="skills-mcp-server-status"]',
    );
    expect(serverStatus?.textContent).toContain("Connected: 8 tools");
  });

  it("shows live external runtime transport when chat context is absent", async () => {
    routeMocks.getMcpRuntimeStatus.mockResolvedValue({
      data: {
        llmConfigPath: "/tmp/setta_files/llm_config.json",
        activeSettaFilesLocation: "custom",
        servers: [
          {
            serverId: "setta",
            source: "setta_mcp",
            transport: "streamable_http",
            endpoint: "http://127.0.0.1:8019/mcp",
            state: "connected",
            lastAttemptAt: null,
            lastConnectedAt: null,
            lastFailureAt: null,
            consecutiveFailures: 0,
            lastError: null,
            missingEnvVar: null,
            toolCount: 8,
          },
        ],
        externalServers: [
          {
            serverId: "setta",
            source: "external_runtime",
            transport: "streamable_http",
            endpoint: "http://127.0.0.1:8019/mcp",
            state: "connected",
            lastAttemptAt: null,
            lastConnectedAt: null,
            lastFailureAt: null,
            consecutiveFailures: 0,
            lastError: null,
            missingEnvVar: null,
            toolCount: 8,
          },
        ],
        resolvedServers: [
          {
            serverId: "setta",
            transport: "streamable_http",
            endpoint: "http://127.0.0.1:8019/mcp",
            state: "connected",
            lastAttemptAt: null,
            lastConnectedAt: null,
            lastFailureAt: null,
            consecutiveFailures: 0,
            lastError: null,
            missingEnvVar: null,
            toolCount: 8,
            quickInfo: "Connected: 8 tools",
          },
        ],
      },
      error: undefined,
      response: new Response(null, { status: 200 }),
    });

    await act(async () => {
      root.render(
        <ProjectChatSkillsMcpViewer
          projectConfigId="project-alpha"
          chatId={null}
          engineConfigId="engine-codex"
          engineType={EngineTypeEnum.external_agent}
          externalAgentToolType={ToolTypeEnum.codex}
          viewMode="mcp"
        />,
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(host.textContent).toContain("streamable_http");
    expect(host.textContent).not.toContain("sse · http://127.0.0.1:8019/mcp");
  });

  it("keeps the row connected when external runtime status is still unknown", async () => {
    routeMocks.getMcpRuntimeStatus.mockResolvedValue({
      data: {
        llmConfigPath: "/tmp/setta_files/llm_config.json",
        activeSettaFilesLocation: "custom",
        servers: [
          {
            serverId: "setta",
            source: "setta_mcp",
            transport: "streamable_http",
            endpoint: "http://127.0.0.1:8019/mcp",
            state: "connected",
            lastAttemptAt: null,
            lastConnectedAt: null,
            lastFailureAt: null,
            consecutiveFailures: 0,
            lastError: null,
            missingEnvVar: null,
            toolCount: 79,
          },
        ],
        externalServers: [
          {
            serverId: "setta",
            source: "external_runtime",
            transport: "streamable_http",
            endpoint: "http://127.0.0.1:8019/mcp",
            state: "unknown",
            lastAttemptAt: null,
            lastConnectedAt: null,
            lastFailureAt: null,
            consecutiveFailures: 0,
            lastError: null,
            missingEnvVar: null,
            toolCount: 79,
          },
        ],
        resolvedServers: [
          {
            serverId: "setta",
            transport: "streamable_http",
            endpoint: "http://127.0.0.1:8019/mcp",
            state: "connected",
            lastAttemptAt: null,
            lastConnectedAt: null,
            lastFailureAt: null,
            consecutiveFailures: 0,
            lastError: null,
            missingEnvVar: null,
            toolCount: 79,
            quickInfo: "Connected: 79 tools",
          },
        ],
      },
      error: undefined,
      response: new Response(null, { status: 200 }),
    });

    await act(async () => {
      root.render(
        <ProjectChatSkillsMcpViewer
          projectConfigId="project-alpha"
          chatId="chat-alpha"
          engineConfigId="engine-codex"
          engineType={EngineTypeEnum.external_agent}
          externalAgentToolType={ToolTypeEnum.codex}
          viewMode="mcp"
        />,
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    const serverStatus = host.querySelector(
      '[data-testid="skills-mcp-server-status"]',
    );
    const serverDot = host.querySelector('[aria-label="Connected: 79 tools"]');
    expect(host.textContent).toContain("streamable_http");
    expect(serverStatus?.textContent).toContain("Connected: 79 tools");
    expect(serverDot).not.toBeNull();
  });

  it("uses configured transport and setta tool count when claude runtime status is partial", async () => {
    routeMocks.getMcpRuntimeStatus.mockResolvedValue({
      data: {
        llmConfigPath: "/tmp/setta_files/llm_config.json",
        activeSettaFilesLocation: "custom",
        servers: [
          {
            serverId: "setta",
            source: "setta_mcp",
            transport: "streamable_http",
            endpoint: "http://127.0.0.1:8019/mcp",
            state: "connected",
            lastAttemptAt: null,
            lastConnectedAt: null,
            lastFailureAt: null,
            consecutiveFailures: 0,
            lastError: null,
            missingEnvVar: null,
            toolCount: 79,
          },
        ],
        externalServers: [
          {
            serverId: "setta",
            source: "external_runtime",
            transport: "",
            endpoint: "",
            state: "connected",
            lastAttemptAt: null,
            lastConnectedAt: null,
            lastFailureAt: null,
            consecutiveFailures: 0,
            lastError: null,
            missingEnvVar: null,
            toolCount: 0,
          },
        ],
        resolvedServers: [
          {
            serverId: "setta",
            transport: "streamable_http",
            endpoint: "http://127.0.0.1:8019/mcp",
            state: "connected",
            lastAttemptAt: null,
            lastConnectedAt: null,
            lastFailureAt: null,
            consecutiveFailures: 0,
            lastError: null,
            missingEnvVar: null,
            toolCount: 79,
            quickInfo: "Connected: 79 tools",
          },
        ],
      },
      error: undefined,
      response: new Response(null, { status: 200 }),
    });

    await act(async () => {
      root.render(
        <ProjectChatSkillsMcpViewer
          projectConfigId="project-alpha"
          chatId="chat-alpha"
          engineConfigId="engine-claude-code"
          engineType={EngineTypeEnum.external_agent}
          externalAgentToolType={ToolTypeEnum.claude_code}
          viewMode="mcp"
        />,
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    const serverStatus = host.querySelector(
      '[data-testid="skills-mcp-server-status"]',
    );
    expect(host.textContent).toContain("streamable_http");
    expect(host.textContent).toContain("http://127.0.0.1:8019/mcp");
    expect(serverStatus?.textContent).toContain("Connected: 79 tools");
  });

  it("publishes MCP runtime status app-state snapshots during repro capture", async () => {
    window.__SETTA_CHROME_REPRO_ACTIVE__ = true;
    const postSpy = vi.spyOn(window, "postMessage");

    await act(async () => {
      root.render(
        <ProjectChatSkillsMcpViewer
          projectConfigId="project-alpha"
          chatId="chat-alpha"
          engineConfigId="engine-codex"
          engineType={EngineTypeEnum.external_agent}
          externalAgentToolType={ToolTypeEnum.codex}
          viewMode="mcp"
        />,
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(postSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "app-state",
        kind: "mcp-runtime-status",
        payload: expect.objectContaining({
          projectConfigId: "project-alpha",
          chatId: "chat-alpha",
          engineConfigId: "engine-codex",
          response: expect.objectContaining({
            llmConfigPath: "/tmp/setta_files/llm_config.json",
            activeSettaFilesLocation: "custom",
            servers: expect.any(Array),
            externalServers: expect.any(Array),
            resolvedServers: expect.any(Array),
          }),
        }),
      }),
      "*",
    );
  });
});
