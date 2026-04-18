/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createAllConfigs,
  createEngineConfig,
  createLLMConfig,
  EngineTypeEnum,
  ToolTypeEnum,
} from "utils/generatedTypes";
import { ProjectChatSkillsMcpViewer } from "./ProjectChatSkillsMcpViewer";

const routeMocks = vi.hoisted(() => ({
  getAppGenSkillContent: vi.fn(),
  getAppGenSkills: vi.fn(),
  getMcpRuntimeStatus: vi.fn(),
  upsertAppGenCustomSkill: vi.fn(),
}));

const aiActionMocks = vi.hoisted(() => ({
  loadAgentRuns: vi.fn(),
}));

const mockAIState = vi.hoisted(() => ({
  chatDetails: {},
  apiKeys: {},
  engineConfigs: [],
  engineConfigsInitialLoadComplete: true,
  externalAgentHealth: [],
  externalAgentHealthInitialLoadComplete: true,
  agentRuns: [],
  agentRunsInitialLoadComplete: true,
  agentRunsAuthorityState: "ready",
  allLLMConfigs: {
    configs: {},
    mcpServers: {},
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
    loadAgentRuns: aiActionMocks.loadAgentRuns,
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

function buildExternalAgentHealth(overrides: Record<string, unknown> = {}) {
  return {
    available: true,
    baseUrl: null,
    cliVersion: null,
    configId: "external-codex",
    envVars: {
      missing: [],
      present: [],
    },
    issues: [],
    name: "Codex Agent",
    runMode: "app_server",
    sdkVersion: null,
    supported: true,
    toolType: "codex",
    workingDir: null,
    ...overrides,
  };
}

async function settle() {
  await act(async () => {
    await Promise.resolve();
  });
}

function setTextInputValue(
  element: HTMLInputElement | HTMLTextAreaElement,
  value: string,
) {
  act(() => {
    const prototype =
      element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    const valueSetter = Object.getOwnPropertyDescriptor(
      prototype,
      "value",
    )?.set;
    valueSetter?.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

describe("ProjectChatSkillsMcpViewer controls", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);

    aiActionMocks.loadAgentRuns.mockReset();
    routeMocks.getAppGenSkillContent.mockReset();
    routeMocks.getAppGenSkills.mockReset();
    routeMocks.getMcpRuntimeStatus.mockReset();
    routeMocks.upsertAppGenCustomSkill.mockReset();

    Object.assign(mockAIState, {
      chatDetails: {},
      apiKeys: {},
      engineConfigs: [],
      engineConfigsInitialLoadComplete: true,
      externalAgentHealth: [],
      externalAgentHealthInitialLoadComplete: true,
      agentRuns: [],
      agentRunsInitialLoadComplete: true,
      agentRunsAuthorityState: "ready",
      allLLMConfigs: {
        configs: {},
        mcpServers: {},
        defaultMcpServerIds: [],
        default_config_id: undefined,
      },
      allLLMConfigsInitialLoadComplete: true,
    });

    routeMocks.getAppGenSkills.mockResolvedValue({
      data: {
        customSkillCreateRootActionable: false,
        customSkillCreateRootPath: null,
        skills: [],
      },
      error: undefined,
      response: new Response(null, { status: 200 }),
    });
    routeMocks.getAppGenSkillContent.mockResolvedValue({
      data: {
        content: "",
        originalSizeBytes: 0,
        skillId: "",
        truncated: false,
      },
      error: undefined,
      response: new Response(null, { status: 200 }),
    });
    routeMocks.getMcpRuntimeStatus.mockResolvedValue({
      data: {
        llmConfigPath: "/tmp/setta_files/llm_config.json",
        activeSettaFilesLocation: "custom",
        servers: [],
        externalServers: [],
        resolvedServers: [],
      },
      error: undefined,
      response: new Response(null, { status: 200 }),
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
  });

  it("keeps custom skill creation disabled when the backend does not expose a writable root", async () => {
    routeMocks.getAppGenSkills.mockResolvedValue({
      data: {
        customSkillCreateRootActionable: false,
        customSkillCreateRootPath: null,
        skills: [],
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
          viewMode="skills"
        />,
      );
    });
    await settle();

    const input = host.querySelector(
      '[data-testid="project-chat-custom-skill-relative-path-input"]',
    ) as HTMLInputElement | null;
    const button = host.querySelector(
      '[data-testid="project-chat-custom-skill-create"]',
    ) as HTMLButtonElement | null;

    expect(button?.disabled).toBe(true);
    expect(
      host.querySelector('[data-testid="project-chat-custom-skill-root-path"]')
        ?.textContent,
    ).toContain("Custom skills root unavailable.");

    setTextInputValue(input!, "new-skill");
    await settle();

    expect(button?.disabled).toBe(true);
  });

  it("enables custom skill creation after skills load exposes a writable root and the user enters a name", async () => {
    routeMocks.getAppGenSkills.mockResolvedValue({
      data: {
        customSkillCreateRootActionable: true,
        customSkillCreateRootPath: "/home/.agents/skills",
        skills: [],
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
          viewMode="skills"
        />,
      );
    });
    await settle();

    const input = host.querySelector(
      '[data-testid="project-chat-custom-skill-relative-path-input"]',
    ) as HTMLInputElement | null;
    const button = host.querySelector(
      '[data-testid="project-chat-custom-skill-create"]',
    ) as HTMLButtonElement | null;

    expect(button?.disabled).toBe(true);

    setTextInputValue(input!, "new-skill");
    await settle();

    expect(button?.disabled).toBe(false);
    expect(
      host.querySelector('[data-testid="project-chat-custom-skill-root-path"]')
        ?.textContent,
    ).toContain("/home/.agents/skills");
  });

  it("does not hydrate slash-command agent runs outside the slash commands view", async () => {
    mockAIState.agentRunsInitialLoadComplete = false;
    mockAIState.engineConfigs = [
      createEngineConfig({
        id: "engine-codex",
        name: "Codex Agent",
        engineType: "external_agent",
        externalAgentConfigId: "external-codex",
      }),
    ];
    mockAIState.externalAgentHealth = [buildExternalAgentHealth()];

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
    await settle();

    expect(aiActionMocks.loadAgentRuns).not.toHaveBeenCalled();
  });

  it("loads external-agent slash authority and keeps add disabled until that authority is ready", async () => {
    mockAIState.agentRunsInitialLoadComplete = false;
    mockAIState.agentRunsAuthorityState = "loading";
    mockAIState.engineConfigs = [
      createEngineConfig({
        id: "engine-codex",
        name: "Codex Agent",
        engineType: "external_agent",
        externalAgentConfigId: "external-codex",
      }),
    ];
    mockAIState.externalAgentHealth = [buildExternalAgentHealth()];

    await act(async () => {
      root.render(
        <ProjectChatSkillsMcpViewer
          projectConfigId="project-alpha"
          chatId="chat-alpha"
          engineConfigId="engine-codex"
          engineType={EngineTypeEnum.external_agent}
          externalAgentToolType={ToolTypeEnum.codex}
          viewMode="slash_commands"
        />,
      );
    });
    await settle();

    const commandInput = host.querySelector(
      '[data-testid="project-chat-custom-slash-command-input"]',
    ) as HTMLInputElement | null;
    const promptInput = host.querySelector(
      '[data-testid="project-chat-custom-slash-prompt-input"]',
    ) as HTMLTextAreaElement | null;
    const addButton = host.querySelector(
      '[data-testid="project-chat-custom-slash-add"]',
    ) as HTMLButtonElement | null;

    setTextInputValue(commandInput!, "/project-status");
    setTextInputValue(promptInput!, "Summarize project status.");
    await settle();

    expect(aiActionMocks.loadAgentRuns).toHaveBeenCalledTimes(1);
    expect(addButton?.disabled).toBe(true);
    expect(host.textContent).toContain(
      "Command names stay disabled until native command authority is loaded for this project.",
    );
  });

  it("allows custom slash creation without agent-run authority when no external-agent engine exists", async () => {
    mockAIState.agentRunsInitialLoadComplete = false;
    mockAIState.agentRunsAuthorityState = "loading";
    mockAIState.engineConfigs = [
      createEngineConfig({
        id: "engine-setta",
        name: "Setta",
        engineType: "setta_llm",
        settaLlmConfigId: "cfg-openai",
      }),
    ];
    mockAIState.allLLMConfigs = createAllConfigs({
      configs: {
        "cfg-openai": createLLMConfig({
          id: "cfg-openai",
          model: "gpt-5",
          provider: "openai",
          api_key_env: "OPENAI_API_KEY",
        }),
      },
      defaultMcpServerIds: [],
      mcpServers: {},
    });
    mockAIState.apiKeys = {
      OPENAI_API_KEY: "secret",
    };

    await act(async () => {
      root.render(
        <ProjectChatSkillsMcpViewer
          projectConfigId="project-alpha"
          chatId="chat-alpha"
          engineConfigId="engine-setta"
          engineType={EngineTypeEnum.setta_llm}
          externalAgentToolType={null}
          viewMode="slash_commands"
        />,
      );
    });
    await settle();

    const commandInput = host.querySelector(
      '[data-testid="project-chat-custom-slash-command-input"]',
    ) as HTMLInputElement | null;
    const promptInput = host.querySelector(
      '[data-testid="project-chat-custom-slash-prompt-input"]',
    ) as HTMLTextAreaElement | null;
    const addButton = host.querySelector(
      '[data-testid="project-chat-custom-slash-add"]',
    ) as HTMLButtonElement | null;

    setTextInputValue(commandInput!, "/project-status");
    setTextInputValue(promptInput!, "Summarize project status.");
    await settle();

    expect(aiActionMocks.loadAgentRuns).not.toHaveBeenCalled();
    expect(addButton?.disabled).toBe(false);
    expect(host.textContent).toContain(
      "Command names must be unique and cannot collide with built-in or discovered agent-native commands.",
    );
  });
});
