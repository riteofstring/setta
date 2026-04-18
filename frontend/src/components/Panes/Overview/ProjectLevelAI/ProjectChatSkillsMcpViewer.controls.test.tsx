/* @vitest-environment jsdom */

import { act, type ComponentProps } from "react";
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
import { getSafeLocalStorageAdapter } from "utils/safeLocalStorage";
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

const mockLocalStorageState = vi.hoisted(() => ({
  customProjectChatSlashCommandsByProjectConfigId: {},
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
  default: ({
    "aria-label": ariaLabel,
    onChange,
    value,
  }: {
    "aria-label"?: string;
    onChange?: (value: string) => void;
    value?: string;
  }) => (
    <textarea
      aria-label={ariaLabel}
      data-testid="project-chat-skill-markdown-editor"
      onChange={(event) => onChange?.(event.currentTarget.value)}
      value={value ?? ""}
    />
  ),
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
  useLocalStorage: Object.assign(
    (selector: (state: typeof mockLocalStorageState) => unknown) =>
      selector(mockLocalStorageState),
    {
      setState: (
        updater: (
          state: typeof mockLocalStorageState,
        ) => typeof mockLocalStorageState,
      ) => {
        Object.assign(mockLocalStorageState, updater(mockLocalStorageState));
      },
    },
  ),
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

const skillViewerStorageAdapter = getSafeLocalStorageAdapter(
  "project-chat-skills-mcp-viewer",
);
const skillMarkdownViewerStorageKey =
  "setta.projectChatSkillsMcpViewer.skillMarkdownViewerOpen";
const skillMarkdownViewModeStorageKey =
  "setta.projectChatSkillsMcpViewer.skillMarkdownViewMode";

function okOpenAPIResult<T>(data: T) {
  return {
    data,
    error: undefined,
    response: new Response(null, { status: 200 }),
  };
}

async function settle() {
  await act(async () => {
    await Promise.resolve();
  });
}

async function settleView() {
  await settle();
  await settle();
  await settle();
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

function clickElement(element: Element | null) {
  act(() => {
    element?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function setSkillViewerStorage(args: {
  isOpen: boolean;
  mode: "rendered" | "raw";
}) {
  skillViewerStorageAdapter.setItem(
    skillMarkdownViewerStorageKey,
    args.isOpen ? "true" : "false",
  );
  skillViewerStorageAdapter.setItem(skillMarkdownViewModeStorageKey, args.mode);
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
    Object.assign(mockLocalStorageState, {
      customProjectChatSlashCommandsByProjectConfigId: {},
    });
    skillViewerStorageAdapter.removeItem(skillMarkdownViewerStorageKey);
    skillViewerStorageAdapter.removeItem(skillMarkdownViewModeStorageKey);

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

  async function renderViewer(
    overrides: Partial<ComponentProps<typeof ProjectChatSkillsMcpViewer>> = {},
  ) {
    await act(async () => {
      root.render(
        <ProjectChatSkillsMcpViewer
          projectConfigId="project-alpha"
          chatId="chat-alpha"
          engineConfigId="engine-codex"
          engineType={EngineTypeEnum.external_agent}
          externalAgentToolType={ToolTypeEnum.codex}
          viewMode="skills"
          {...overrides}
        />,
      );
    });
    await settleView();
  }

  function getSkillButton(skillName: string): HTMLButtonElement | null {
    const nameNode = Array.from(
      host.querySelectorAll('[data-testid="skills-mcp-skill-name"]'),
    ).find((element) => element.textContent === skillName);
    return (nameNode?.closest("button") as HTMLButtonElement | null) ?? null;
  }

  function getMarkdownEditor(): HTMLTextAreaElement | null {
    return host.querySelector(
      '[data-testid="project-chat-skill-markdown-editor"]',
    ) as HTMLTextAreaElement | null;
  }

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

  it("creates a custom skill through the owner view, re-sorts the list, and selects the new editor state", async () => {
    const betaSkill = {
      skillId: "user_agents_skills::beta",
      name: "beta",
      rootLabel: "User ~/.agents/skills",
      rootPath: "/home/.agents/skills",
      relativePath: "beta",
      isEditable: true,
      editabilityReason: null,
      description: "Beta skill",
    };
    const createdSkill = {
      skillId: "user_agents_skills::alpha-custom",
      name: "alpha-custom",
      rootLabel: "User ~/.agents/skills",
      rootPath: "/home/.agents/skills",
      relativePath: "alpha-custom",
      isEditable: true,
      editabilityReason: null,
      description: "Alpha custom skill",
    };
    const createdSkillContent =
      "# alpha-custom\n\nDescribe what this skill helps with.\n";

    setSkillViewerStorage({ isOpen: true, mode: "raw" });
    routeMocks.getAppGenSkills.mockResolvedValue(
      okOpenAPIResult({
        customSkillCreateRootActionable: true,
        customSkillCreateRootPath: "/home/.agents/skills",
        skills: [betaSkill],
      }),
    );
    routeMocks.getAppGenSkillContent.mockImplementation(({ body }) =>
      Promise.resolve(
        okOpenAPIResult({
          content: body.skillId === betaSkill.skillId ? "# beta\n\nStable" : "",
          originalSizeBytes: 14,
          skillId: body.skillId,
          truncated: false,
        }),
      ),
    );
    routeMocks.upsertAppGenCustomSkill.mockResolvedValue(
      okOpenAPIResult({
        rootPath: "/home/.agents/skills",
        skill: createdSkill,
        skillContent: {
          content: createdSkillContent,
          originalSizeBytes: createdSkillContent.length,
          skillId: createdSkill.skillId,
          truncated: false,
        },
      }),
    );

    await renderViewer();

    const createInput = host.querySelector(
      '[data-testid="project-chat-custom-skill-relative-path-input"]',
    ) as HTMLInputElement | null;
    const createButton = host.querySelector(
      '[data-testid="project-chat-custom-skill-create"]',
    ) as HTMLButtonElement | null;

    setTextInputValue(createInput!, "alpha-custom");
    await settleView();
    clickElement(createButton);
    await settleView();

    expect(
      Array.from(host.querySelectorAll('[data-testid="skills-mcp-skill-name"]'))
        .map((element) => element.textContent)
        .filter(Boolean),
    ).toEqual(["alpha-custom", "beta"]);
    expect(getSkillButton("alpha-custom")?.dataset.selected).toBe("true");
    expect(getMarkdownEditor()?.value).toBe(createdSkillContent);
    expect(createInput?.value).toBe("");
  });

  it("keeps a stale save response from stealing selection while still replacing the saved draft", async () => {
    const alphaSkill = {
      skillId: "user_agents_skills::alpha-custom",
      name: "alpha-custom",
      rootLabel: "User ~/.agents/skills",
      rootPath: "/home/.agents/skills",
      relativePath: "alpha-custom",
      isEditable: true,
      editabilityReason: null,
      description: "Alpha custom skill",
    };
    const betaSkill = {
      skillId: "user_agents_skills::beta-custom",
      name: "beta-custom",
      rootLabel: "User ~/.agents/skills",
      rootPath: "/home/.agents/skills",
      relativePath: "beta-custom",
      isEditable: true,
      editabilityReason: null,
      description: "Beta custom skill",
    };
    const contentBySkillId = {
      [alphaSkill.skillId]: "# alpha-custom\n\nOriginal",
      [betaSkill.skillId]: "# beta-custom\n\nStable",
    };
    const savedAlphaContent = "# alpha-custom\n\nSaved on server";
    let resolveSave:
      | ((value: ReturnType<typeof okOpenAPIResult>) => void)
      | null = null;

    setSkillViewerStorage({ isOpen: true, mode: "raw" });
    routeMocks.getAppGenSkills.mockResolvedValue(
      okOpenAPIResult({
        customSkillCreateRootActionable: true,
        customSkillCreateRootPath: "/home/.agents/skills",
        skills: [alphaSkill, betaSkill],
      }),
    );
    routeMocks.getAppGenSkillContent.mockImplementation(({ body }) =>
      Promise.resolve(
        okOpenAPIResult({
          content:
            contentBySkillId[body.skillId as keyof typeof contentBySkillId],
          originalSizeBytes:
            contentBySkillId[body.skillId as keyof typeof contentBySkillId]
              .length,
          skillId: body.skillId,
          truncated: false,
        }),
      ),
    );
    routeMocks.upsertAppGenCustomSkill.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSave = resolve;
        }),
    );

    await renderViewer();

    setTextInputValue(getMarkdownEditor()!, "# alpha-custom\n\nLocal draft");
    await settleView();
    clickElement(
      host.querySelector('[data-testid="project-chat-custom-skill-save"]'),
    );
    await settleView();

    clickElement(getSkillButton("beta-custom"));
    await settleView();

    resolveSave?.(
      okOpenAPIResult({
        rootPath: "/home/.agents/skills",
        skill: {
          ...alphaSkill,
          description: "Alpha saved description",
        },
        skillContent: {
          content: savedAlphaContent,
          originalSizeBytes: savedAlphaContent.length,
          skillId: alphaSkill.skillId,
          truncated: false,
        },
      }),
    );
    await settleView();

    expect(getSkillButton("beta-custom")?.dataset.selected).toBe("true");
    expect(getMarkdownEditor()?.value).toBe(
      contentBySkillId[betaSkill.skillId],
    );
    expect(
      host.querySelectorAll('[data-testid="skills-mcp-skill-name"]'),
    ).toHaveLength(2);

    clickElement(getSkillButton("alpha-custom"));
    await settleView();

    expect(getMarkdownEditor()?.value).toBe(savedAlphaContent);
  });

  it("refreshes clean drafts from the server but preserves dirty drafts for the active skill", async () => {
    const alphaSkill = {
      skillId: "user_agents_skills::alpha-custom",
      name: "alpha-custom",
      rootLabel: "User ~/.agents/skills",
      rootPath: "/home/.agents/skills",
      relativePath: "alpha-custom",
      isEditable: true,
      editabilityReason: null,
      description: "Alpha custom skill",
    };
    let alphaContent = "# alpha-custom\n\nOriginal";

    setSkillViewerStorage({ isOpen: true, mode: "raw" });
    routeMocks.getAppGenSkills.mockResolvedValue(
      okOpenAPIResult({
        customSkillCreateRootActionable: true,
        customSkillCreateRootPath: "/home/.agents/skills",
        skills: [alphaSkill],
      }),
    );
    routeMocks.getAppGenSkillContent.mockImplementation(({ body }) =>
      Promise.resolve(
        okOpenAPIResult({
          content: alphaContent,
          originalSizeBytes: alphaContent.length,
          skillId: body.skillId,
          truncated: false,
        }),
      ),
    );

    await renderViewer();

    alphaContent = "# alpha-custom\n\nServer copy";
    clickElement(
      host.querySelector('[data-testid="project-chat-skills-refresh"]'),
    );
    await settleView();
    expect(getMarkdownEditor()?.value).toBe(alphaContent);

    setTextInputValue(getMarkdownEditor()!, "# alpha-custom\n\nLocal edits");
    await settleView();

    alphaContent = "# alpha-custom\n\nFresh server copy";
    clickElement(
      host.querySelector('[data-testid="project-chat-skills-refresh"]'),
    );
    await settleView();

    expect(getMarkdownEditor()?.value).toBe("# alpha-custom\n\nLocal edits");
  });

  it("keeps drafts isolated per skill and renders the active skill draft in preview mode", async () => {
    const alphaSkill = {
      skillId: "user_agents_skills::alpha-custom",
      name: "alpha-custom",
      rootLabel: "User ~/.agents/skills",
      rootPath: "/home/.agents/skills",
      relativePath: "alpha-custom",
      isEditable: true,
      editabilityReason: null,
      description: "Alpha custom skill",
    };
    const betaSkill = {
      skillId: "user_agents_skills::beta-custom",
      name: "beta-custom",
      rootLabel: "User ~/.agents/skills",
      rootPath: "/home/.agents/skills",
      relativePath: "beta-custom",
      isEditable: true,
      editabilityReason: null,
      description: "Beta custom skill",
    };
    const contentBySkillId = {
      [alphaSkill.skillId]: "# alpha-custom\n\nOriginal",
      [betaSkill.skillId]: "# beta-custom\n\nStable",
    };

    setSkillViewerStorage({ isOpen: true, mode: "raw" });
    routeMocks.getAppGenSkills.mockResolvedValue(
      okOpenAPIResult({
        customSkillCreateRootActionable: true,
        customSkillCreateRootPath: "/home/.agents/skills",
        skills: [alphaSkill, betaSkill],
      }),
    );
    routeMocks.getAppGenSkillContent.mockImplementation(({ body }) =>
      Promise.resolve(
        okOpenAPIResult({
          content:
            contentBySkillId[body.skillId as keyof typeof contentBySkillId],
          originalSizeBytes:
            contentBySkillId[body.skillId as keyof typeof contentBySkillId]
              .length,
          skillId: body.skillId,
          truncated: false,
        }),
      ),
    );

    await renderViewer();

    setTextInputValue(getMarkdownEditor()!, "# alpha-custom\n\nUpdated draft");
    await settleView();
    clickElement(
      host.querySelector(
        '[data-testid="project-chat-skill-markdown-view-rendered"]',
      ),
    );
    await settleView();

    expect(host.textContent).toContain("Updated draft");

    clickElement(getSkillButton("beta-custom"));
    await settleView();

    expect(host.textContent).toContain("Stable");

    clickElement(
      host.querySelector(
        '[data-testid="project-chat-skill-markdown-view-raw"]',
      ),
    );
    await settleView();
    setTextInputValue(getMarkdownEditor()!, "# beta-custom\n\nBeta draft");
    await settleView();

    clickElement(getSkillButton("alpha-custom"));
    await settleView();

    expect(getMarkdownEditor()?.value).toBe("# alpha-custom\n\nUpdated draft");
  });

  it("shows the preview placeholder through the owner view when no skill is selected", async () => {
    setSkillViewerStorage({ isOpen: true, mode: "rendered" });
    routeMocks.getAppGenSkills.mockResolvedValue(
      okOpenAPIResult({
        customSkillCreateRootActionable: false,
        customSkillCreateRootPath: null,
        skills: [],
      }),
    );

    await renderViewer();

    expect(host.textContent).toContain("Select a skill to preview SKILL.md.");
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
