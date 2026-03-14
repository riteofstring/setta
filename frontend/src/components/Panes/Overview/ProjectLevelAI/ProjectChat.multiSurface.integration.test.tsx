/* @vitest-environment jsdom */

import { act, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildStandaloneWindowSpaceProjectChatSurfaceId,
  buildWorkspaceProjectChatWindowSurfaceId,
} from "components/ChatWindowing/projectChatSurfaceIds";
import {
  useAIStore,
  useLocalStorage,
  useProjectState,
} from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  AgentRunStatusEnum,
  EngineTypeEnum,
  createAgentRun,
  createAllLLMConfigs,
  createAssistantChatMessage,
  createEngineConfig,
  createMessageTextContent,
  createProjectConfig,
  createUserChatMessage,
} from "utils/generatedTypes";
import { ProjectChat } from "./ProjectChat";

vi.mock("components/AppHeader/FollowAIToggleButton", () => ({
  FollowAIToggleButton: () => <button type="button">Follow AI</button>,
}));

vi.mock("components/Utils/FloatingBox", () => ({
  getFloatingBoxHandlers: () => ({}),
}));

vi.mock("components/Utils/atoms/popover/standardpopover", () => ({
  StandardPopover: ({
    trigger,
    children,
  }: {
    trigger: ReactNode;
    children: ReactNode;
  }) => (
    <div>
      {trigger}
      <div>{children}</div>
    </div>
  ),
}));

vi.mock("components/Utils/Combobox/IdNameCombobox", () => ({
  IdNameCombobox: ({
    allItems,
    value,
    onSelectedItemChange,
    inputDivId,
    placeholder,
  }: {
    allItems: Array<{ items: Array<{ id: string; name: string }> }>;
    value: string | null;
    onSelectedItemChange: (next: string | null) => void;
    inputDivId?: string;
    placeholder?: string;
  }) => {
    const items = allItems.flatMap((group) => group.items);
    return (
      <select
        data-testid={inputDivId ?? placeholder ?? "mock-combobox"}
        value={value ?? ""}
        onChange={(event) => {
          onSelectedItemChange(event.currentTarget.value || null);
        }}
      >
        <option value="">none</option>
        {items.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
    );
  },
}));

vi.mock("components/Params/ParamUIs/SwitchInput", () => ({
  SwitchInput: ({
    value,
    onChange,
  }: {
    value: boolean;
    onChange: (next: boolean) => void;
  }) => (
    <button
      type="button"
      data-testid="mock-switch-input"
      onClick={() => {
        onChange(!value);
      }}
    >
      {value ? "on" : "off"}
    </button>
  ),
}));

vi.mock("re-resizable", () => ({
  Resizable: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("./ProjectAISettings", () => ({
  ProjectAISettings: () => (
    <div data-testid="mock-project-ai-settings">AI settings</div>
  ),
}));

vi.mock("./ProjectChatSkillsMcpViewer", () => ({
  ProjectChatSkillsMcpViewer: ({ viewMode }: { viewMode: string }) => (
    <div data-testid={`mock-project-chat-aux-${viewMode}`}>{viewMode}</div>
  ),
}));

vi.mock("./useHydrateAgenticState", () => ({
  useHydrateAgenticState: () => undefined,
}));

vi.mock("./useHydrateLLMState", () => ({
  useHydrateLLMState: () => undefined,
}));

vi.mock("./ProjectChatHistory", () => ({
  ProjectChatHistory: ({
    chatId,
    inline,
  }: {
    chatId: string | null | undefined;
    inline?: boolean;
  }) => (
    <div
      data-testid={
        inline
          ? "mock-project-chat-history-inline"
          : "mock-project-chat-history-full"
      }
      data-chat-id={chatId ?? ""}
    >
      history
    </div>
  ),
}));

vi.mock("./ProjectChatCore", async () => {
  const actual =
    await vi.importActual<typeof import("./ProjectChatCore")>(
      "./ProjectChatCore",
    );
  const { useAIStore } = await import("state/definitions");
  return {
    ...actual,
    ProjectChatCore: ({
      surfaceId,
      chatId,
      engineConfigId,
    }: {
      surfaceId: string;
      chatId: string | null | undefined;
      engineConfigId: string | null;
    }) => {
      const details = useAIStore((state) => {
        if (chatId === null) {
          return (
            state.pendingChatDetailsBySurfaceId[surfaceId] ?? {
              messages: [],
            }
          );
        }
        if (typeof chatId !== "string") {
          return { messages: [] };
        }
        return state.chatDetails[chatId] ?? { messages: [] };
      });
      const renderedText = details.messages
        .flatMap((message) =>
          message.content
            .filter((part) => part.type === "text")
            .map((part) => part.text),
        )
        .join(" | ");
      return (
        <div
          data-testid={`mock-project-chat-core-${surfaceId}`}
          data-chat-id={chatId ?? ""}
          data-engine-id={engineConfigId ?? ""}
        >
          {renderedText}
        </div>
      );
    },
  };
});

function buildManagedChatRun({
  chatId,
  engineConfigId,
  projectConfigId,
}: {
  chatId: string;
  engineConfigId: string;
  projectConfigId: string;
}) {
  return createAgentRun({
    id: `run-${chatId}`,
    status: AgentRunStatusEnum.completed,
    startedAt: "2026-03-07T00:00:00Z",
    finishedAt: "2026-03-07T00:00:01Z",
    inputs: {
      runType: "llm_chat",
      projectConfigId,
      chatId,
      engineConfigId,
      messages: [],
    },
    outputs: {},
  });
}

function createChatMessage(text: string) {
  return createAssistantChatMessage({
    content: [createMessageTextContent({ text })],
    attachments: [],
  });
}

function createUserMessage(text: string) {
  return createUserChatMessage({
    content: [createMessageTextContent({ text })],
    attachments: [],
  });
}

function Harness() {
  const [chatA, setChatA] = useState<string | null | undefined>("chat-a");
  const [chatB, setChatB] = useState<string | null | undefined>("chat-b");

  return (
    <div>
      <section data-testid="surface-a">
        <ProjectChat
          surfaceId="surface-a"
          chatId={chatA}
          setChatId={setChatA}
        />
      </section>
      <section data-testid="surface-b">
        <ProjectChat
          surfaceId="surface-b"
          chatId={chatB}
          setChatId={setChatB}
        />
      </section>
    </div>
  );
}

function SharedThreadHarness() {
  const [chatA, setChatA] = useState<string | null | undefined>("chat-a");
  const [chatB, setChatB] = useState<string | null | undefined>("chat-a");

  return (
    <div>
      <section data-testid="surface-a">
        <ProjectChat
          surfaceId="surface-a"
          chatId={chatA}
          setChatId={setChatA}
        />
      </section>
      <section data-testid="surface-b">
        <ProjectChat
          surfaceId="surface-b"
          chatId={chatB}
          setChatId={setChatB}
        />
      </section>
    </div>
  );
}

function SharedWindowInstanceHarness() {
  const [workspaceChatId, setWorkspaceChatId] = useState<
    string | null | undefined
  >("chat-a");
  const [standaloneChatId, setStandaloneChatId] = useState<
    string | null | undefined
  >("chat-a");

  return (
    <div>
      <section data-testid="workspace-window-surface">
        <ProjectChat
          surfaceId={buildWorkspaceProjectChatWindowSurfaceId(
            "project-1",
            "project-chat-window-1",
          )}
          chatId={workspaceChatId}
          setChatId={setWorkspaceChatId}
        />
      </section>
      <section data-testid="standalone-window-surface">
        <ProjectChat
          surfaceId={buildStandaloneWindowSpaceProjectChatSurfaceId(
            "project-1",
            "window-space-1",
            "project-chat-window-1",
          )}
          chatId={standaloneChatId}
          setChatId={setStandaloneChatId}
        />
      </section>
    </div>
  );
}

function ProjectScopedDraftHarness() {
  const projectConfigId = useProjectState((state) => state.projectConfig.id);
  const [chatId, setChatId] = useState<string | null | undefined>(null);

  return (
    <section data-testid="project-scoped-draft-surface">
      <ProjectChat
        surfaceId={buildWorkspaceProjectChatWindowSurfaceId(
          projectConfigId,
          "project-chat-window-1",
        )}
        chatId={chatId}
        setChatId={setChatId}
      />
    </section>
  );
}

function ReusedSurfaceHarness({
  surfaceId,
  chatId,
}: {
  surfaceId: string;
  chatId: string | null | undefined;
}) {
  const [controlledChatId, setControlledChatId] = useState<
    string | null | undefined
  >(chatId);

  return (
    <section data-testid="reused-surface">
      <ProjectChat
        surfaceId={surfaceId}
        chatId={controlledChatId}
        setChatId={setControlledChatId}
      />
    </section>
  );
}

describe("ProjectChat multi-surface state ownership", () => {
  let host: HTMLDivElement;
  let root: Root;
  let originalGetBoundingClientRect: typeof HTMLElement.prototype.getBoundingClientRect;

  beforeEach(async () => {
    resetProjectStores();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    useProjectState.setState((state) => {
      state.projectConfig = createProjectConfig({ id: "project-1" });
    });
    useLocalStorage.setState({
      overviewWidth: 1200,
      projectChatAuxViewByProjectConfigId: {},
      projectChatThreadAssignmentsByProjectConfigId: {},
      projectChatThreadGroupsByProjectConfigId: {},
    });
    useAIStore.setState({
      apiKeys: { openai: "token" },
      apiKeysAuthoritative: true,
      apiKeysInitialLoadComplete: true,
      allLLMConfigs: createAllLLMConfigs({
        default_config_id: "llm-a",
        configs: {
          "llm-a": {
            id: "llm-a",
            model: "gpt-4o-mini",
            provider: "openai",
            base_url: null,
            api_key_env: null,
            other_params: null,
            mcpServerIds: [],
            temporary: false,
          },
          "llm-b": {
            id: "llm-b",
            model: "gpt-4.1-mini",
            provider: "openai",
            base_url: null,
            api_key_env: null,
            other_params: null,
            mcpServerIds: [],
            temporary: false,
          },
        },
      }),
      allLLMConfigsInitialLoadComplete: true,
      externalAgentHealth: [],
      externalAgentHealthInitialLoadComplete: true,
      engineConfigs: [
        createEngineConfig({
          id: "engine-a",
          name: "Engine A",
          engineType: EngineTypeEnum.setta_llm,
          settaLlmConfigId: "llm-a",
        }),
        createEngineConfig({
          id: "engine-b",
          name: "Engine B",
          engineType: EngineTypeEnum.setta_llm,
          settaLlmConfigId: "llm-b",
        }),
      ],
      engineConfigsInitialLoadComplete: true,
      engineConfigsLoadError: null,
      transcriptionProfiles: [],
      transcriptionProfilesInitialLoadComplete: true,
      agentRuns: [
        buildManagedChatRun({
          chatId: "chat-a",
          engineConfigId: "engine-a",
          projectConfigId: "project-1",
        }),
        buildManagedChatRun({
          chatId: "chat-b",
          engineConfigId: "engine-b",
          projectConfigId: "project-1",
        }),
      ],
      agentRunsAuthorityState: "ready",
      agentRunsInitialLoadComplete: true,
      chatDetails: {
        "chat-a": {
          messages: [
            createUserMessage("Alpha seed"),
            createChatMessage("Alpha reply"),
          ],
          toolCallArguments: {},
          waitingForResponse: false,
          llmConfig: null,
          contextUsage: null,
        },
        "chat-b": {
          messages: [
            createUserMessage("Beta seed"),
            createChatMessage("Beta reply"),
          ],
          toolCallArguments: {},
          waitingForResponse: false,
          llmConfig: null,
          contextUsage: null,
        },
      },
      pendingChatDetailsBySurfaceId: {},
    });
    (globalThis as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver =
      class ResizeObserver {
        disconnect() {}
        observe() {}
        unobserve() {}
      } as typeof ResizeObserver;
    originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect =
      function getBoundingClientRect() {
        return {
          x: 0,
          y: 0,
          width: 1200,
          height: 800,
          top: 0,
          right: 1200,
          bottom: 800,
          left: 0,
          toJSON() {
            return null;
          },
        } as DOMRect;
      };

    await act(async () => {
      root.render(<Harness />);
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    host.remove();
    resetProjectStores();
  });

  it("keeps engine provenance isolated per controlled surface", () => {
    const surfaceA = host.querySelector('[data-testid="surface-a"]');
    const surfaceB = host.querySelector('[data-testid="surface-b"]');
    if (!surfaceA || !surfaceB) {
      throw new Error("Expected both project chat surfaces.");
    }

    const coreA = surfaceA.querySelector(
      '[data-testid="mock-project-chat-core-surface-a"]',
    );
    const coreB = surfaceB.querySelector(
      '[data-testid="mock-project-chat-core-surface-b"]',
    );
    expect(coreA?.getAttribute("data-engine-id")).toBe("engine-a");
    expect(coreB?.getAttribute("data-engine-id")).toBe("engine-b");
  });

  it("keeps continue-in-new-thread draft seeds isolated per surface", async () => {
    const surfaceA = host.querySelector('[data-testid="surface-a"]');
    const surfaceB = host.querySelector('[data-testid="surface-b"]');
    if (!surfaceA || !surfaceB) {
      throw new Error("Expected both project chat surfaces.");
    }

    const engineSelectA = surfaceA.querySelector(
      '[data-testid="project-ai-engine-combobox"]',
    ) as HTMLSelectElement | null;
    const engineSelectB = surfaceB.querySelector(
      '[data-testid="project-ai-engine-combobox"]',
    ) as HTMLSelectElement | null;
    if (!engineSelectA || !engineSelectB) {
      throw new Error("Expected engine selectors.");
    }

    await act(async () => {
      engineSelectA.value = "engine-b";
      engineSelectA.dispatchEvent(new Event("change", { bubbles: true }));
      engineSelectB.value = "engine-a";
      engineSelectB.dispatchEvent(new Event("change", { bubbles: true }));
    });

    const continueButtonA = surfaceA.querySelector(
      '[data-testid="project-chat-engine-switch-continue-button"]',
    ) as HTMLButtonElement | null;
    const continueButtonB = surfaceB.querySelector(
      '[data-testid="project-chat-engine-switch-continue-button"]',
    ) as HTMLButtonElement | null;
    if (!continueButtonA || !continueButtonB) {
      throw new Error("Expected continue-in-new-thread buttons.");
    }

    await act(async () => {
      continueButtonA.click();
      continueButtonB.click();
    });

    const coreA = surfaceA.querySelector(
      '[data-testid="mock-project-chat-core-surface-a"]',
    );
    const coreB = surfaceB.querySelector(
      '[data-testid="mock-project-chat-core-surface-b"]',
    );
    expect(coreA?.textContent ?? "").toContain("Alpha seed");
    expect(coreA?.textContent ?? "").not.toContain("Beta seed");
    expect(coreB?.textContent ?? "").toContain("Beta seed");
    expect(coreB?.textContent ?? "").not.toContain("Alpha seed");
  });

  it("keeps a new-thread draft isolated when two surfaces start on the same chat", async () => {
    await act(async () => {
      root.render(<SharedThreadHarness />);
    });

    const surfaceA = host.querySelector('[data-testid="surface-a"]');
    const surfaceB = host.querySelector('[data-testid="surface-b"]');
    if (!surfaceA || !surfaceB) {
      throw new Error("Expected both project chat surfaces.");
    }

    const engineSelectA = surfaceA.querySelector(
      '[data-testid="project-ai-engine-combobox"]',
    ) as HTMLSelectElement | null;
    if (!engineSelectA) {
      throw new Error("Expected engine selector for surface A.");
    }

    await act(async () => {
      engineSelectA.value = "engine-b";
      engineSelectA.dispatchEvent(new Event("change", { bubbles: true }));
    });

    const continueButtonA = surfaceA.querySelector(
      '[data-testid="project-chat-engine-switch-continue-button"]',
    ) as HTMLButtonElement | null;
    if (!continueButtonA) {
      throw new Error("Expected continue-in-new-thread button for surface A.");
    }

    await act(async () => {
      continueButtonA.click();
    });

    const coreA = surfaceA.querySelector(
      '[data-testid="mock-project-chat-core-surface-a"]',
    );
    const coreB = surfaceB.querySelector(
      '[data-testid="mock-project-chat-core-surface-b"]',
    );
    expect(coreA?.textContent ?? "").toContain("Alpha seed");
    expect(coreA?.getAttribute("data-chat-id")).toBe("");
    expect(coreB?.textContent ?? "").toContain("Alpha seed");
    expect(coreB?.textContent ?? "").toContain("Alpha reply");
    expect(coreB?.getAttribute("data-chat-id")).toBe("chat-a");
    expect(
      useAIStore.getState().pendingChatDetailsBySurfaceId["surface-b"],
    ).toBeUndefined();
  });

  it("writes aux-view selections to store authority and restores them after remount", async () => {
    const surfaceA = host.querySelector('[data-testid="surface-a"]');
    if (!surfaceA) {
      throw new Error("Expected the first project chat surface.");
    }
    const openSkillsButton = surfaceA.querySelector(
      '[data-testid="project-chat-settings-open-skills"]',
    ) as HTMLButtonElement | null;
    if (!openSkillsButton) {
      throw new Error("Expected project chat aux-view buttons.");
    }

    await act(async () => {
      openSkillsButton.click();
    });
    expect(
      useLocalStorage.getState().projectChatAuxViewByProjectConfigId,
    ).toEqual({
      "project-1": "skills",
    });

    const mcpTab = host.querySelector(
      '[data-testid="project-chat-aux-tab-mcp"]',
    ) as HTMLButtonElement | null;
    if (!mcpTab) {
      throw new Error("Expected the MCP aux-view tab.");
    }

    await act(async () => {
      mcpTab.click();
    });
    expect(
      useLocalStorage.getState().projectChatAuxViewByProjectConfigId,
    ).toEqual({
      "project-1": "mcp",
    });

    await act(async () => {
      root.render(<div />);
    });
    await act(async () => {
      root.render(<Harness />);
    });

    expect(
      host.querySelector('[data-testid="mock-project-chat-aux-mcp"]'),
    ).not.toBeNull();
  });

  it("writes thread visibility preferences to the AI store and keeps a wide-layout close after remount", async () => {
    const surfaceA = host.querySelector('[data-testid="surface-a"]');
    if (!surfaceA) {
      throw new Error("Expected the first project chat surface.");
    }
    const toggleThreadsButton = surfaceA.querySelector(
      'button[aria-label="View Threads"]',
    ) as HTMLButtonElement | null;
    if (!toggleThreadsButton) {
      throw new Error("Expected the project chat threads toggle.");
    }

    expect(useAIStore.getState().viewThreads).toBe(true);
    expect(
      useAIStore.getState().projectChatThreadsExplicitlyClosedAtLargeWidth,
    ).toBe(false);

    await act(async () => {
      toggleThreadsButton.click();
    });

    expect(useAIStore.getState().viewThreads).toBe(false);
    expect(
      useAIStore.getState().projectChatThreadsExplicitlyClosedAtLargeWidth,
    ).toBe(true);

    await act(async () => {
      root.render(<div />);
    });
    await act(async () => {
      root.render(<Harness />);
    });

    expect(
      host.querySelector('[data-testid="mock-project-chat-history-inline"]'),
    ).toBeNull();
    expect(useAIStore.getState().viewThreads).toBe(false);
  });

  it("keeps pending draft state isolated when workspace and standalone hosts reuse the same window id", async () => {
    await act(async () => {
      root.render(<SharedWindowInstanceHarness />);
    });

    const workspaceSurface = host.querySelector(
      '[data-testid="workspace-window-surface"]',
    );
    const standaloneSurface = host.querySelector(
      '[data-testid="standalone-window-surface"]',
    );
    if (!workspaceSurface || !standaloneSurface) {
      throw new Error("Expected both reused-window-id project chat surfaces.");
    }

    const workspaceEngineSelect = workspaceSurface.querySelector(
      '[data-testid="project-ai-engine-combobox"]',
    ) as HTMLSelectElement | null;
    if (!workspaceEngineSelect) {
      throw new Error("Expected engine selector for workspace surface.");
    }

    // The two surfaces intentionally reuse the same saved instance id, so the
    // pending draft bucket must stay keyed by the host-qualified surface id.
    await act(async () => {
      workspaceEngineSelect.value = "engine-b";
      workspaceEngineSelect.dispatchEvent(
        new Event("change", { bubbles: true }),
      );
    });

    const workspaceContinueButton = workspaceSurface.querySelector(
      '[data-testid="project-chat-engine-switch-continue-button"]',
    ) as HTMLButtonElement | null;
    if (!workspaceContinueButton) {
      throw new Error("Expected continue-in-new-thread button for workspace.");
    }

    await act(async () => {
      workspaceContinueButton.click();
    });

    const workspaceSurfaceId = buildWorkspaceProjectChatWindowSurfaceId(
      "project-1",
      "project-chat-window-1",
    );
    const standaloneSurfaceId = buildStandaloneWindowSpaceProjectChatSurfaceId(
      "project-1",
      "window-space-1",
      "project-chat-window-1",
    );
    const pendingSurfaceIds = Object.keys(
      useAIStore.getState().pendingChatDetailsBySurfaceId,
    );
    expect(pendingSurfaceIds).toContain(workspaceSurfaceId);
    expect(pendingSurfaceIds).not.toContain("project-chat-window-1");
    expect(
      useAIStore.getState().pendingChatDetailsBySurfaceId[standaloneSurfaceId],
    ).toBeUndefined();
  });

  it("keeps reused workspace surface ids isolated across project switches", async () => {
    const projectOneSurfaceId = buildWorkspaceProjectChatWindowSurfaceId(
      "project-1",
      "project-chat-window-1",
    );
    useAIStore.setState({
      pendingChatDetailsBySurfaceId: {
        [projectOneSurfaceId]: {
          messages: [createUserMessage("Project one pending draft")],
          toolCallArguments: {},
          waitingForResponse: true,
          llmConfig: null,
          contextUsage: null,
        },
      },
    });

    await act(async () => {
      root.render(<ProjectScopedDraftHarness />);
    });

    const projectOneCore = host.querySelector(
      `[data-testid="mock-project-chat-core-${projectOneSurfaceId}"]`,
    );
    expect(projectOneCore?.textContent ?? "").toContain(
      "Project one pending draft",
    );

    await act(async () => {
      useProjectState.setState((state) => {
        state.projectConfig = createProjectConfig({ id: "project-2" });
      });
    });

    const projectTwoSurfaceId = buildWorkspaceProjectChatWindowSurfaceId(
      "project-2",
      "project-chat-window-1",
    );
    const projectTwoCore = host.querySelector(
      `[data-testid="mock-project-chat-core-${projectTwoSurfaceId}"]`,
    );
    expect(projectTwoCore?.textContent ?? "").not.toContain(
      "Project one pending draft",
    );
    expect(
      useAIStore.getState().pendingChatDetailsBySurfaceId[projectTwoSurfaceId],
    ).toBeUndefined();
    expect(
      useAIStore.getState().pendingChatDetailsBySurfaceId[projectOneSurfaceId],
    ).toBeDefined();
  });

  it("keeps threads and aux views project-scoped across surfaces", async () => {
    const surfaceA = host.querySelector('[data-testid="surface-a"]');
    const surfaceB = host.querySelector('[data-testid="surface-b"]');
    if (!surfaceA || !surfaceB) {
      throw new Error("Expected both project chat surfaces.");
    }

    const threadsButtonA = surfaceA.querySelector(
      '[aria-label="View Threads"]',
    ) as HTMLButtonElement | null;
    if (!threadsButtonA) {
      throw new Error("Expected threads toggle for surface A.");
    }

    await act(async () => {
      threadsButtonA.click();
    });

    expect(
      surfaceA.querySelector('[data-testid^="mock-project-chat-history"]'),
    ).not.toBeNull();
    expect(
      surfaceB.querySelector('[data-testid^="mock-project-chat-history"]'),
    ).not.toBeNull();

    const skillsButtonA = surfaceA.querySelector(
      '[data-testid="project-chat-settings-open-skills"]',
    ) as HTMLButtonElement | null;
    if (!skillsButtonA) {
      throw new Error("Expected skills button for surface A.");
    }

    await act(async () => {
      skillsButtonA.click();
    });

    expect(
      surfaceA.querySelector('[data-testid="mock-project-chat-aux-skills"]'),
    ).not.toBeNull();
    expect(
      surfaceB.querySelector('[data-testid="mock-project-chat-aux-skills"]'),
    ).not.toBeNull();
  });

  it("resets surface-local UI state when the same host is rebound to a new surface id", async () => {
    await act(async () => {
      root.render(
        <ReusedSurfaceHarness surfaceId="surface-a" chatId="chat-a" />,
      );
    });

    const surface = host.querySelector('[data-testid="reused-surface"]');
    if (!surface) {
      throw new Error("Expected reused project chat surface.");
    }

    const engineSelect = surface.querySelector(
      '[data-testid="project-ai-engine-combobox"]',
    ) as HTMLSelectElement | null;
    if (!engineSelect) {
      throw new Error("Expected reusable surface controls.");
    }

    await act(async () => {
      engineSelect.value = "engine-b";
      engineSelect.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(engineSelect.value).toBe("engine-b");

    await act(async () => {
      root.render(
        <ReusedSurfaceHarness surfaceId="surface-b" chatId="chat-a" />,
      );
    });

    const reboundSurface = host.querySelector('[data-testid="reused-surface"]');
    if (!reboundSurface) {
      throw new Error("Expected rebound project chat surface.");
    }

    const reboundEngineSelect = reboundSurface.querySelector(
      '[data-testid="project-ai-engine-combobox"]',
    ) as HTMLSelectElement | null;
    if (!reboundEngineSelect) {
      throw new Error("Expected rebound engine selector.");
    }

    expect(reboundEngineSelect.value).toBe("engine-a");
  });

  it("steps to the next conversation match when the filter input receives Enter", async () => {
    useAIStore.setState((state) => ({
      chatDetails: {
        ...state.chatDetails,
        "chat-a": {
          messages: [
            createUserMessage("queue alpha"),
            createChatMessage("reply with no match"),
            createAssistantChatMessage({
              content: [createMessageTextContent({ text: "queue beta" })],
              attachments: [],
            }),
          ],
          toolCallArguments: {},
          waitingForResponse: false,
          llmConfig: null,
          contextUsage: null,
        },
      },
    }));

    await act(async () => {
      root.render(<Harness />);
    });

    const surfaceA = host.querySelector('[data-testid="surface-a"]');
    if (!surfaceA) {
      throw new Error("Expected the first project chat surface.");
    }

    const filterInput = surfaceA.querySelector(
      '[data-testid="project-chat-conversation-filter-input"]',
    ) as HTMLInputElement | null;
    if (!filterInput) {
      throw new Error("Expected the conversation filter input.");
    }

    const inputValueSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    if (!inputValueSetter) {
      throw new Error("Expected the input value setter.");
    }

    await act(async () => {
      inputValueSetter.call(filterInput, "queue");
      filterInput.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const filterContainer = surfaceA.querySelector(
      '[data-testid="project-chat-conversation-filter"]',
    );
    expect(filterContainer?.textContent ?? "").toContain("1/2");

    await act(async () => {
      filterInput.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });

    expect(filterContainer?.textContent ?? "").toContain("2/2");
  });
});
