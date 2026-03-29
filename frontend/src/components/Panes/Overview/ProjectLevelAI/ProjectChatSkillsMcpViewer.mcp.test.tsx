/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  EngineTypeEnum,
  ExternalAgentToolTypeEnum,
} from "utils/generatedTypes";
import { ProjectChatSkillsMcpViewer } from "./ProjectChatSkillsMcpViewer";

const routeMocks = vi.hoisted(() => ({
  getMcpRuntimeStatus: vi.fn(),
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
        transport: "sse",
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

vi.mock("utils/generatedEndpoints", () => ({
  route_get_app_gen_skill_content: vi.fn(),
  route_get_app_gen_skills: vi.fn(),
  route_get_mcp_server_runtime_status: routeMocks.getMcpRuntimeStatus,
  route_reveal_path_in_os_file_explorer: vi.fn(),
  route_upsert_app_gen_custom_skill: vi.fn(),
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
      status: 200,
      data: {
        llmConfigPath: "/tmp/setta_files/llm_config.json",
        activeSettaFilesLocation: "custom",
        servers: [
          {
            serverId: "setta",
            source: "setta_mcp",
            transport: "sse",
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
      },
    });
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
          externalAgentToolType={ExternalAgentToolTypeEnum.codex}
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
});
