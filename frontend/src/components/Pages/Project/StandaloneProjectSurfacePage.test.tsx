/* @vitest-environment jsdom */

import { act, useEffect, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import "testUtils/reactRefreshPreamble";
import {
  ChatWindowModeEnum,
  SectionTypeEnum,
  WindowSpaceSurfaceKindEnum,
  createWindowSpaceConfig,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StandaloneProjectSurfacePage } from "./StandaloneProjectSurfacePage";

type MockSectionCore = {
  name: string;
  sharedModifier?: Record<string, unknown>;
};

type MockSectionVariant = {
  impl: string;
  modifier?: Record<string, unknown>;
};

type MockSectionImpl = {
  type: string;
  managed?: boolean;
  children?: string[];
};

type MockProjectState = {
  projectConfig: {
    id: string;
    windowSpaces: Record<string, unknown>;
    windowSpaceIdsBySlug?: Record<string, Array<string>>;
    sectionVariantMap: Record<string, string>;
    sectionIdsByPathSlug?: Record<string, Array<string>>;
  };
  sections: Record<string, MockSectionCore>;
  sectionVariants: Record<string, MockSectionVariant>;
  sectionImpls: Record<string, MockSectionImpl>;
  parentSectionMap: Record<string, string | null>;
};

type MockAIState = {
  activeChatId: string | null | undefined;
  agentRuns: Array<unknown>;
  agentRunsAuthorityState: string;
  chatDetails: Record<string, unknown>;
};

type MockShareSessionState = {
  isDeploymentMode: boolean;
  sharePolicy: {
    allowLLM: boolean;
  } | null;
};

const hoisted = vi.hoisted(() => {
  const state = {
    projectState: {
      projectConfig: {
        id: "project-config-1",
        windowSpaces: {},
        windowSpaceIdsBySlug: {},
        sectionVariantMap: {},
        sectionIdsByPathSlug: {},
      },
      sections: {},
      sectionVariants: {},
      sectionImpls: {},
      parentSectionMap: {},
    } as MockProjectState,
    aiState: {
      activeChatId: "workspace-chat",
      agentRuns: [],
      agentRunsAuthorityState: "ready",
      chatDetails: {},
    } as MockAIState,
    shareSessionState: {
      isDeploymentMode: false,
      sharePolicy: null,
    } as MockShareSessionState,
    projectChatBlockedErrorCode: null as string | null,
    chatHistoryEntries: [] as Array<{ chatId: string; label: string }>,
    loadProjectConfigResult: [true, false] as [boolean, boolean],
  };

  const useProjectStateMock = Object.assign(
    (selector: (nextState: MockProjectState) => unknown) =>
      selector(state.projectState),
    {
      getState: () => state.projectState,
    },
  );

  const useAIStoreMock = Object.assign(
    (selector: (nextState: MockAIState) => unknown) => selector(state.aiState),
    {
      getState: () => state.aiState,
      setState: (
        updater:
          | Partial<MockAIState>
          | ((nextState: MockAIState) => Partial<MockAIState>),
      ) => {
        const nextState =
          typeof updater === "function" ? updater(state.aiState) : updater;
        state.aiState = {
          ...state.aiState,
          ...nextState,
        };
      },
    },
  );

  const useShareSessionMock = Object.assign(
    (selector: (nextState: MockShareSessionState) => unknown) =>
      selector(state.shareSessionState),
    {
      getState: () => state.shareSessionState,
    },
  );

  return {
    state,
    useProjectStateMock,
    useAIStoreMock,
    useShareSessionMock,
  };
});

vi.mock("components/ChatWindowing/UnifiedChatSurface", () => ({
  UnifiedChatSurface: ({
    dataTestId,
    projectChatId,
    setProjectChatId,
    onProjectChatBlockedErrorCodeChange,
  }: {
    dataTestId?: string | undefined;
    projectChatId?: string | null | undefined;
    setProjectChatId?: ((next: string | null) => void) | undefined;
    onProjectChatBlockedErrorCodeChange?:
      | ((errorCode: string | null) => void)
      | undefined;
  }) => (
    <MockUnifiedChatSurface
      dataTestId={dataTestId}
      projectChatId={projectChatId}
      setProjectChatId={setProjectChatId}
      onProjectChatBlockedErrorCodeChange={onProjectChatBlockedErrorCodeChange}
    />
  ),
}));

vi.mock("components/ChatWindowing/ProjectChatWindowSurface", () => ({
  ProjectChatWindowSurface: ({ children }: { children: ReactNode }) => (
    <section
      data-testid="mock-project-chat-window-frame"
      data-chat-window-frame="project-chat"
    >
      {children}
    </section>
  ),
}));

function MockUnifiedChatSurface({
  dataTestId,
  projectChatId,
  setProjectChatId,
  onProjectChatBlockedErrorCodeChange,
}: {
  dataTestId?: string | undefined;
  projectChatId?: string | null | undefined;
  setProjectChatId?: ((next: string | null) => void) | undefined;
  onProjectChatBlockedErrorCodeChange?:
    | ((errorCode: string | null) => void)
    | undefined;
}) {
  useEffect(() => {
    onProjectChatBlockedErrorCodeChange?.(
      hoisted.state.projectChatBlockedErrorCode,
    );
  }, [
    onProjectChatBlockedErrorCodeChange,
    hoisted.state.projectChatBlockedErrorCode,
  ]);

  return (
    <div
      data-testid={dataTestId ?? "mock-unified-chat-surface"}
      data-project-chat-id={projectChatId ?? ""}
    >
      <button
        type="button"
        data-testid="mock-standalone-new-chat"
        onClick={() => {
          setProjectChatId?.(null);
        }}
      >
        New Chat
      </button>
      <button
        type="button"
        data-testid="mock-standalone-select-chat-beta"
        onClick={() => {
          setProjectChatId?.("chat-beta");
        }}
      >
        Select chat beta
      </button>
    </div>
  );
}

vi.mock("components/Section/Container/SectionWindowSurface", () => ({
  SectionWindowSurface: ({
    bodyOverride,
    onProjectChatBlockedErrorCodeChange,
  }: {
    bodyOverride?: ReactNode | undefined;
    onProjectChatBlockedErrorCodeChange?:
      | ((errorCode: string | null) => void)
      | undefined;
  }) => {
    useEffect(() => {
      onProjectChatBlockedErrorCodeChange?.(
        hoisted.state.projectChatBlockedErrorCode,
      );
    }, [
      onProjectChatBlockedErrorCodeChange,
      hoisted.state.projectChatBlockedErrorCode,
    ]);
    return (
      <div
        data-testid="mock-section-window-surface"
        data-has-body-override={String(bodyOverride !== undefined)}
      />
    );
  },
}));

vi.mock("components/Utils/FloatingBox", () => ({
  FloatingBox: () => <div data-testid="mock-floating-box" />,
}));

vi.mock("gpuFlow/mouseLocation", () => ({
  useAddMouseLocationListener: () => undefined,
}));

vi.mock("plugins/runtime", () => ({
  usePluginRuntimeBootstrap: () => undefined,
}));

vi.mock("components/Utils/CodeMirror/useCodeMirrorStyleLoader", () => ({
  useCodeMirrorStyleLoader: () => undefined,
}));

vi.mock("state/actions/chatHistory", () => ({
  buildChatHistoryEntries: () => hoisted.state.chatHistoryEntries,
}));

vi.mock("state/definitions", () => ({
  useAIStore: hoisted.useAIStoreMock,
  useProjectState: hoisted.useProjectStateMock,
  useShareSession: hoisted.useShareSessionMock,
}));

vi.mock("state/hooks/project", () => ({
  useLoadProjectConfig: () => hoisted.state.loadProjectConfigResult,
}));

vi.mock("../LoadingSpinner", () => ({
  LoadingSpinner: () => <div data-testid="mock-loading-spinner" />,
}));

vi.mock("../NotFound/NotFound", () => ({
  NotFound: ({
    title = "Not Found",
    description,
  }: {
    title?: string;
    description?: string;
  }) => (
    <div data-testid="mock-not-found">
      <h1>{title}</h1>
      {description ? <p>{description}</p> : null}
    </div>
  ),
}));

vi.mock("./StandaloneWindowSpaceSurface", () => ({
  StandaloneWindowSpaceSurface: ({
    onProjectChatBlockedErrorCodeChange,
  }: {
    onProjectChatBlockedErrorCodeChange?:
      | ((errorCode: string | null) => void)
      | undefined;
  }) => {
    useEffect(() => {
      onProjectChatBlockedErrorCodeChange?.(
        hoisted.state.projectChatBlockedErrorCode,
      );
    }, [
      onProjectChatBlockedErrorCodeChange,
      hoisted.state.projectChatBlockedErrorCode,
    ]);
    return <div data-testid="mock-standalone-window-space-surface" />;
  },
}));

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="mock-location-path">{location.pathname}</div>;
}

function NavigateButton({ to }: { to: string }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      data-testid={`mock-navigate-${to}`}
      onClick={() => {
        navigate(to);
      }}
    >
      Navigate
    </button>
  );
}

function click(node: Element | null): void {
  if (!(node instanceof HTMLElement)) {
    throw new Error("Expected clickable element.");
  }
  node.click();
}

function createChatSectionFixture({
  sectionId,
  sectionName,
  managed,
}: {
  sectionId: string;
  sectionName: string;
  managed: boolean;
}) {
  const variantId = `${sectionId}-variant`;
  const implId = `${sectionId}-impl`;
  return {
    sectionId,
    core: {
      name: sectionName,
      sharedModifier: {},
    } satisfies MockSectionCore,
    variantId,
    variant: {
      impl: implId,
      modifier: {},
    } satisfies MockSectionVariant,
    implId,
    impl: {
      type: SectionTypeEnum.Chat,
      managed,
    } satisfies MockSectionImpl,
  };
}

function createTextSectionFixture({
  sectionId,
  sectionName,
}: {
  sectionId: string;
  sectionName: string;
}) {
  const variantId = `${sectionId}-variant`;
  const implId = `${sectionId}-impl`;
  return {
    sectionId,
    core: {
      name: sectionName,
      sharedModifier: {},
    } satisfies MockSectionCore,
    variantId,
    variant: {
      impl: implId,
      modifier: {},
    } satisfies MockSectionVariant,
    implId,
    impl: {
      type: SectionTypeEnum.TextBlock,
    } satisfies MockSectionImpl,
  };
}

function createGroupSectionFixture({
  sectionId,
  sectionName,
  children = [],
}: {
  sectionId: string;
  sectionName: string;
  children?: string[];
}) {
  const variantId = `${sectionId}-variant`;
  const implId = `${sectionId}-impl`;
  return {
    sectionId,
    core: {
      name: sectionName,
      sharedModifier: {},
    } satisfies MockSectionCore,
    variantId,
    variant: {
      impl: implId,
      modifier: {},
    } satisfies MockSectionVariant,
    implId,
    impl: {
      type: SectionTypeEnum.Group,
      children,
    } satisfies MockSectionImpl,
  };
}

describe("StandaloneProjectSurfacePage", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    hoisted.state.projectState = {
      projectConfig: {
        id: "project-config-1",
        windowSpaces: {},
        sectionVariantMap: {},
      },
      sections: {},
      sectionVariants: {},
      sectionImpls: {},
      parentSectionMap: {},
    };
    hoisted.state.aiState = {
      activeChatId: "workspace-chat",
      agentRuns: [],
      agentRunsAuthorityState: "ready",
      chatDetails: {},
    };
    hoisted.state.shareSessionState = {
      isDeploymentMode: false,
      sharePolicy: null,
    };
    hoisted.state.projectChatBlockedErrorCode = null;
    hoisted.state.chatHistoryEntries = [
      { chatId: "chat-alpha", label: "Alpha Chat" },
      { chatId: "chat-beta", label: "Beta Chat" },
    ];
    hoisted.state.loadProjectConfigResult = [true, false];
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("uses the standalone route as the authoritative project chat owner", async () => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/demo/chat/chat-alpha"]}>
          <Routes>
            <Route
              path="/:projectConfigName/chat"
              element={<StandaloneProjectSurfacePage />}
            />
            <Route
              path="/:projectConfigName/chat/:chatId"
              element={<StandaloneProjectSurfacePage />}
            />
          </Routes>
          <LocationProbe />
        </MemoryRouter>,
      );
    });

    const initialSurface = host.querySelector(
      '[data-testid="standalone-project-chat-thread-surface"]',
    );
    expect(initialSurface?.getAttribute("data-project-chat-id")).toBe(
      "chat-alpha",
    );
    expect(hoisted.useAIStoreMock.getState().activeChatId).toBe(
      "workspace-chat",
    );

    await act(async () => {
      click(host.querySelector('[data-testid="mock-standalone-new-chat"]'));
    });

    const routeSurface = host.querySelector(
      '[data-testid="standalone-project-chat-surface"]',
    );
    expect(routeSurface?.getAttribute("data-project-chat-id")).toBe("");
    expect(
      host
        .querySelector('[data-testid="mock-location-path"]')
        ?.textContent?.trim(),
    ).toBe("/demo/chat");
    expect(hoisted.useAIStoreMock.getState().activeChatId).toBe(
      "workspace-chat",
    );

    await act(async () => {
      click(
        host.querySelector('[data-testid="mock-standalone-select-chat-beta"]'),
      );
    });

    const updatedSurface = host.querySelector(
      '[data-testid="standalone-project-chat-thread-surface"]',
    );
    expect(updatedSurface?.getAttribute("data-project-chat-id")).toBe(
      "chat-beta",
    );
    expect(
      host
        .querySelector('[data-testid="mock-location-path"]')
        ?.textContent?.trim(),
    ).toBe("/demo/chat/chat-beta");
    expect(hoisted.useAIStoreMock.getState().activeChatId).toBe(
      "workspace-chat",
    );
  });

  it("still mounts the standalone thread surface when local history is empty", async () => {
    hoisted.state.chatHistoryEntries = [];

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/demo/chat/missing-thread"]}>
          <Routes>
            <Route
              path="/:projectConfigName/chat/:chatId"
              element={<StandaloneProjectSurfacePage />}
            />
          </Routes>
        </MemoryRouter>,
      );
    });

    expect(
      host.querySelector(
        '[data-testid="standalone-project-chat-thread-surface"]',
      ),
    ).not.toBeNull();
    expect(host.textContent).not.toContain("Thread Not Found");
    expect(hoisted.useAIStoreMock.getState().activeChatId).toBe(
      "workspace-chat",
    );
  });

  it("wraps standalone project chat routes in the shared project chat frame", async () => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/demo/chat"]}>
          <Routes>
            <Route
              path="/:projectConfigName/chat"
              element={<StandaloneProjectSurfacePage />}
            />
          </Routes>
        </MemoryRouter>,
      );
    });

    const standaloneSurface = host.querySelector(
      '[data-testid="standalone-project-chat-surface"]',
    );
    expect(standaloneSurface).not.toBeNull();
    expect(
      standaloneSurface?.closest('[data-chat-window-frame="project-chat"]'),
    ).not.toBeNull();
  });

  it("shows standalone thread not found only after hydration reports chat_not_found", async () => {
    hoisted.state.chatHistoryEntries = [];
    hoisted.state.projectChatBlockedErrorCode = "chat_not_found";

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/demo/chat/missing-thread"]}>
          <Routes>
            <Route
              path="/:projectConfigName/chat/:chatId"
              element={<StandaloneProjectSurfacePage />}
            />
          </Routes>
        </MemoryRouter>,
      );
    });

    expect(host.textContent).toContain("Thread Not Found");
    expect(hoisted.useAIStoreMock.getState().activeChatId).toBe(
      "workspace-chat",
    );
    expect(
      host.querySelector(
        '[data-testid="standalone-project-chat-thread-surface"]',
      ),
    ).toBeNull();
  });

  it("fails closed for blank standalone thread routes before hydration", async () => {
    hoisted.state.chatHistoryEntries = [];
    hoisted.state.projectChatBlockedErrorCode = null;

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/demo/chat/%20"]}>
          <Routes>
            <Route
              path="/:projectConfigName/chat/:chatId"
              element={<StandaloneProjectSurfacePage />}
            />
          </Routes>
        </MemoryRouter>,
      );
    });

    expect(
      host.querySelector(
        '[data-testid="standalone-project-chat-thread-not-found"]',
      ),
    ).not.toBeNull();
    expect(
      host.querySelector('[data-testid="standalone-project-chat-surface"]'),
    ).toBeNull();
    expect(
      host.querySelector(
        '[data-testid="standalone-project-chat-thread-surface"]',
      ),
    ).toBeNull();
    expect(host.textContent).toContain("Thread Not Found");
  });

  it("clears a stale thread-not-found block when navigating to a different thread in the same mounted tab", async () => {
    hoisted.state.chatHistoryEntries = [];
    hoisted.state.projectChatBlockedErrorCode = "chat_not_found";

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/demo/chat/missing-thread"]}>
          <Routes>
            <Route
              path="/:projectConfigName/chat"
              element={<StandaloneProjectSurfacePage />}
            />
            <Route
              path="/:projectConfigName/chat/:chatId"
              element={<StandaloneProjectSurfacePage />}
            />
          </Routes>
          <NavigateButton to="/demo/chat/chat-alpha" />
        </MemoryRouter>,
      );
    });

    expect(host.textContent).toContain("Thread Not Found");

    hoisted.state.projectChatBlockedErrorCode = null;

    await act(async () => {
      click(
        host.querySelector(
          '[data-testid="mock-navigate-/demo/chat/chat-alpha"]',
        ),
      );
    });

    const surface = host.querySelector(
      '[data-testid="standalone-project-chat-thread-surface"]',
    );
    expect(surface).not.toBeNull();
    expect(surface?.getAttribute("data-project-chat-id")).toBe("chat-alpha");
    expect(host.textContent).not.toContain("Thread Not Found");
  });

  it("clears a stale thread-not-found block when navigating to the same thread in a different project config", async () => {
    hoisted.state.chatHistoryEntries = [];
    hoisted.state.projectChatBlockedErrorCode = "chat_not_found";
    hoisted.state.projectState.projectConfig.id = "project-config-1";

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/demo-a/chat/shared-thread"]}>
          <Routes>
            <Route
              path="/:projectConfigName/chat/:chatId"
              element={<StandaloneProjectSurfacePage />}
            />
          </Routes>
          <NavigateButton to="/demo-b/chat/shared-thread" />
        </MemoryRouter>,
      );
    });

    expect(host.textContent).toContain("Thread Not Found");

    hoisted.state.projectState.projectConfig.id = "project-config-2";
    hoisted.state.projectChatBlockedErrorCode = null;

    await act(async () => {
      click(
        host.querySelector(
          '[data-testid="mock-navigate-/demo-b/chat/shared-thread"]',
        ),
      );
    });

    const surface = host.querySelector(
      '[data-testid="standalone-project-chat-thread-surface"]',
    );
    expect(surface).not.toBeNull();
    expect(surface?.getAttribute("data-project-chat-id")).toBe("shared-thread");
    expect(host.textContent).not.toContain("Thread Not Found");
  });

  it("fails closed for standalone project chat routes when deployment policy disallows LLM access", async () => {
    hoisted.state.shareSessionState = {
      isDeploymentMode: true,
      sharePolicy: {
        allowLLM: false,
      },
    };

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/demo/chat/chat-alpha"]}>
          <Routes>
            <Route
              path="/:projectConfigName/chat"
              element={<StandaloneProjectSurfacePage />}
            />
            <Route
              path="/:projectConfigName/chat/:chatId"
              element={<StandaloneProjectSurfacePage />}
            />
          </Routes>
        </MemoryRouter>,
      );
    });

    expect(
      host.querySelector('[data-testid="standalone-managed-chat-blocked"]'),
    ).not.toBeNull();
    expect(
      host.querySelector(
        '[data-testid="standalone-project-chat-thread-surface"]',
      ),
    ).toBeNull();
    expect(host.textContent).toContain("Managed Chat Unavailable");
    expect(host.textContent).toContain("does not allow LLM access");
  });

  it("fails closed for standalone window-space routes that would mount managed chat when deployment policy disallows LLM access", async () => {
    hoisted.state.shareSessionState = {
      isDeploymentMode: true,
      sharePolicy: {
        allowLLM: false,
      },
    };
    hoisted.state.projectState = {
      projectConfig: {
        id: "project-config-1",
        windowSpaces: {
          "space-1": createWindowSpaceConfig({
            id: "space-1",
            name: "Research Board",
            windowsById: {
              "chat-window": {
                surfaceKind: WindowSpaceSurfaceKindEnum.project_chat,
                sectionIdOrNull: null,
                mode: ChatWindowModeEnum.project_ai_mode,
                title: "Research Chat",
                chatId: null,
                embeddedGitPaneVisible: false,
                zIndex: 1,
                normalizedBounds: {
                  x: 0,
                  y: 0,
                  width: 0.5,
                  height: 0.5,
                },
              },
            },
            order: ["chat-window"],
          }),
        },
        windowSpaceIdsBySlug: {
          research_board: ["space-1"],
        },
        sectionVariantMap: {},
        sectionIdsByPathSlug: {},
      },
      sections: {},
      sectionVariants: {},
      sectionImpls: {},
      parentSectionMap: {},
    };

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/demo/windowspace/research_board"]}>
          <Routes>
            <Route
              path="/:projectConfigName/windowspace/:windowSpaceSlug"
              element={<StandaloneProjectSurfacePage />}
            />
          </Routes>
        </MemoryRouter>,
      );
    });

    expect(
      host.querySelector('[data-testid="standalone-managed-chat-blocked"]'),
    ).not.toBeNull();
    expect(
      host.querySelector(
        '[data-testid="mock-standalone-window-space-surface"]',
      ),
    ).toBeNull();
  });

  it("keeps standalone scriptable chat section routes available when deployment policy disallows managed chat", async () => {
    const scriptableChat = createChatSectionFixture({
      sectionId: "section-scriptable",
      sectionName: "scriptable_chat",
      managed: false,
    });
    hoisted.state.shareSessionState = {
      isDeploymentMode: true,
      sharePolicy: {
        allowLLM: false,
      },
    };
    hoisted.state.projectState = {
      projectConfig: {
        id: "project-config-1",
        windowSpaces: {},
        windowSpaceIdsBySlug: {},
        sectionVariantMap: {
          [scriptableChat.sectionId]: scriptableChat.variantId,
        },
        sectionIdsByPathSlug: {
          scriptable_chat: [scriptableChat.sectionId],
        },
      },
      sections: {
        [scriptableChat.sectionId]: scriptableChat.core,
      },
      sectionVariants: {
        [scriptableChat.variantId]: scriptableChat.variant,
      },
      sectionImpls: {
        [scriptableChat.implId]: scriptableChat.impl,
      },
      parentSectionMap: {},
    };

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/demo/section/scriptable_chat"]}>
          <Routes>
            <Route
              path="/:projectConfigName/section/:sectionSlug"
              element={<StandaloneProjectSurfacePage />}
            />
          </Routes>
        </MemoryRouter>,
      );
    });

    expect(
      host.querySelector('[data-testid="standalone-section-surface"]'),
    ).not.toBeNull();
    expect(
      host.querySelector('[data-testid="standalone-managed-chat-blocked"]'),
    ).toBeNull();
  });

  it("does not mount standalone nested section DOM for group section routes", async () => {
    const groupSection = createGroupSectionFixture({
      sectionId: "section-group",
      sectionName: "group_section",
      children: ["child-a", "child-b"],
    });
    hoisted.state.projectState = {
      projectConfig: {
        id: "project-config-1",
        windowSpaces: {},
        windowSpaceIdsBySlug: {},
        sectionVariantMap: {
          [groupSection.sectionId]: groupSection.variantId,
        },
        sectionIdsByPathSlug: {
          group_section: [groupSection.sectionId],
        },
      },
      sections: {
        [groupSection.sectionId]: groupSection.core,
      },
      sectionVariants: {
        [groupSection.variantId]: groupSection.variant,
      },
      sectionImpls: {
        [groupSection.implId]: groupSection.impl,
      },
      parentSectionMap: {},
    };

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/demo/section/group_section"]}>
          <Routes>
            <Route
              path="/:projectConfigName/section/:sectionSlug"
              element={<StandaloneProjectSurfacePage />}
            />
          </Routes>
        </MemoryRouter>,
      );
    });

    const surface = host.querySelector(
      '[data-testid="mock-section-window-surface"]',
    );
    expect(surface).not.toBeNull();
    expect(surface?.getAttribute("data-has-body-override")).toBe("false");
  });

  it("fails closed for standalone window spaces with managed section-mode chat windows when deployment policy disallows managed chat", async () => {
    const managedChat = createChatSectionFixture({
      sectionId: "section-managed",
      sectionName: "managed_chat",
      managed: true,
    });
    hoisted.state.shareSessionState = {
      isDeploymentMode: true,
      sharePolicy: {
        allowLLM: false,
      },
    };
    hoisted.state.projectState = {
      projectConfig: {
        id: "project-config-1",
        windowSpaces: {
          "space-1": createWindowSpaceConfig({
            id: "space-1",
            name: "Managed Space",
            windowsById: {
              "managed-window": {
                surfaceKind: WindowSpaceSurfaceKindEnum.section,
                sectionIdOrNull: managedChat.sectionId,
                mode: ChatWindowModeEnum.section_mode,
                title: "Managed Chat",
                chatId: null,
                embeddedGitPaneVisible: false,
                zIndex: 1,
                normalizedBounds: {
                  x: 0,
                  y: 0,
                  width: 0.5,
                  height: 0.5,
                },
              },
            },
            order: ["managed-window"],
          }),
        },
        windowSpaceIdsBySlug: {
          managed_space: ["space-1"],
        },
        sectionVariantMap: {
          [managedChat.sectionId]: managedChat.variantId,
        },
        sectionIdsByPathSlug: {},
      },
      sections: {
        [managedChat.sectionId]: managedChat.core,
      },
      sectionVariants: {
        [managedChat.variantId]: managedChat.variant,
      },
      sectionImpls: {
        [managedChat.implId]: managedChat.impl,
      },
      parentSectionMap: {},
    };

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/demo/windowspace/managed_space"]}>
          <Routes>
            <Route
              path="/:projectConfigName/windowspace/:windowSpaceSlug"
              element={<StandaloneProjectSurfacePage />}
            />
          </Routes>
        </MemoryRouter>,
      );
    });

    expect(
      host.querySelector('[data-testid="standalone-managed-chat-blocked"]'),
    ).not.toBeNull();
    expect(
      host.querySelector(
        '[data-testid="mock-standalone-window-space-surface"]',
      ),
    ).toBeNull();
  });

  it("keeps mixed standalone window spaces available when at least one window remains allowed", async () => {
    const managedChat = createChatSectionFixture({
      sectionId: "section-managed",
      sectionName: "managed_chat",
      managed: true,
    });
    const scriptableChat = createChatSectionFixture({
      sectionId: "section-scriptable",
      sectionName: "scriptable_chat",
      managed: false,
    });
    hoisted.state.shareSessionState = {
      isDeploymentMode: true,
      sharePolicy: {
        allowLLM: false,
      },
    };
    hoisted.state.projectState = {
      projectConfig: {
        id: "project-config-1",
        windowSpaces: {
          "space-1": createWindowSpaceConfig({
            id: "space-1",
            name: "Mixed Space",
            windowsById: {
              "managed-window": {
                surfaceKind: WindowSpaceSurfaceKindEnum.project_chat,
                sectionIdOrNull: null,
                mode: ChatWindowModeEnum.project_ai_mode,
                title: "Managed Chat",
                chatId: "managed-thread",
                embeddedGitPaneVisible: false,
                zIndex: 1,
                normalizedBounds: {
                  x: 0,
                  y: 0,
                  width: 0.33,
                  height: 0.5,
                },
              },
              "scriptable-window": {
                surfaceKind: WindowSpaceSurfaceKindEnum.section,
                sectionIdOrNull: scriptableChat.sectionId,
                mode: ChatWindowModeEnum.section_mode,
                title: "Scriptable Chat",
                chatId: null,
                embeddedGitPaneVisible: false,
                zIndex: 2,
                normalizedBounds: {
                  x: 0.33,
                  y: 0,
                  width: 0.34,
                  height: 0.5,
                },
              },
              "managed-section-window": {
                surfaceKind: WindowSpaceSurfaceKindEnum.section,
                sectionIdOrNull: managedChat.sectionId,
                mode: ChatWindowModeEnum.section_mode,
                title: "Managed Section Chat",
                chatId: null,
                embeddedGitPaneVisible: false,
                zIndex: 3,
                normalizedBounds: {
                  x: 0.67,
                  y: 0,
                  width: 0.33,
                  height: 0.5,
                },
              },
            },
            order: [
              "managed-window",
              "scriptable-window",
              "managed-section-window",
            ],
          }),
        },
        windowSpaceIdsBySlug: {
          mixed_space: ["space-1"],
        },
        sectionVariantMap: {
          [managedChat.sectionId]: managedChat.variantId,
          [scriptableChat.sectionId]: scriptableChat.variantId,
        },
        sectionIdsByPathSlug: {},
      },
      sections: {
        [managedChat.sectionId]: managedChat.core,
        [scriptableChat.sectionId]: scriptableChat.core,
      },
      sectionVariants: {
        [managedChat.variantId]: managedChat.variant,
        [scriptableChat.variantId]: scriptableChat.variant,
      },
      sectionImpls: {
        [managedChat.implId]: managedChat.impl,
        [scriptableChat.implId]: scriptableChat.impl,
      },
      parentSectionMap: {},
    };

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/demo/windowspace/mixed_space"]}>
          <Routes>
            <Route
              path="/:projectConfigName/windowspace/:windowSpaceSlug"
              element={<StandaloneProjectSurfacePage />}
            />
          </Routes>
        </MemoryRouter>,
      );
    });

    expect(
      host.querySelector(
        '[data-testid="mock-standalone-window-space-surface"]',
      ),
    ).not.toBeNull();
    expect(
      host.querySelector('[data-testid="standalone-managed-chat-blocked"]'),
    ).toBeNull();
  });

  it("keeps standalone window spaces with only scriptable chat and git graph windows available when deployment policy disallows managed chat", async () => {
    const scriptableChat = createChatSectionFixture({
      sectionId: "section-scriptable",
      sectionName: "scriptable_chat",
      managed: false,
    });
    const textSection = createTextSectionFixture({
      sectionId: "section-text",
      sectionName: "notes",
    });
    hoisted.state.shareSessionState = {
      isDeploymentMode: true,
      sharePolicy: {
        allowLLM: false,
      },
    };
    hoisted.state.projectState = {
      projectConfig: {
        id: "project-config-1",
        windowSpaces: {
          "space-1": createWindowSpaceConfig({
            id: "space-1",
            name: "Scriptable Space",
            windowsById: {
              "graph-window": {
                surfaceKind: WindowSpaceSurfaceKindEnum.project_chat,
                sectionIdOrNull: null,
                mode: ChatWindowModeEnum.git_graph_mode,
                title: "Git Graph",
                chatId: null,
                embeddedGitPaneVisible: false,
                zIndex: 1,
                normalizedBounds: {
                  x: 0,
                  y: 0,
                  width: 0.5,
                  height: 0.5,
                },
              },
              "scriptable-window": {
                surfaceKind: WindowSpaceSurfaceKindEnum.section,
                sectionIdOrNull: scriptableChat.sectionId,
                mode: ChatWindowModeEnum.section_mode,
                title: "Scriptable Chat",
                chatId: null,
                embeddedGitPaneVisible: false,
                zIndex: 2,
                normalizedBounds: {
                  x: 0.5,
                  y: 0,
                  width: 0.5,
                  height: 0.5,
                },
              },
            },
            order: ["graph-window", "scriptable-window"],
          }),
        },
        windowSpaceIdsBySlug: {
          scriptable_space: ["space-1"],
        },
        sectionVariantMap: {
          [scriptableChat.sectionId]: scriptableChat.variantId,
          [textSection.sectionId]: textSection.variantId,
        },
        sectionIdsByPathSlug: {},
      },
      sections: {
        [scriptableChat.sectionId]: scriptableChat.core,
        [textSection.sectionId]: textSection.core,
      },
      sectionVariants: {
        [scriptableChat.variantId]: scriptableChat.variant,
        [textSection.variantId]: textSection.variant,
      },
      sectionImpls: {
        [scriptableChat.implId]: scriptableChat.impl,
        [textSection.implId]: textSection.impl,
      },
      parentSectionMap: {},
    };

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/demo/windowspace/scriptable_space"]}>
          <Routes>
            <Route
              path="/:projectConfigName/windowspace/:windowSpaceSlug"
              element={<StandaloneProjectSurfacePage />}
            />
          </Routes>
        </MemoryRouter>,
      );
    });

    expect(
      host.querySelector(
        '[data-testid="mock-standalone-window-space-surface"]',
      ),
    ).not.toBeNull();
    expect(
      host.querySelector('[data-testid="standalone-managed-chat-blocked"]'),
    ).toBeNull();
  });

  it("fails closed after hydration reports llm_disallowed for a standalone project chat route", async () => {
    hoisted.state.projectChatBlockedErrorCode = "llm_disallowed";

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/demo/chat/chat-alpha"]}>
          <Routes>
            <Route
              path="/:projectConfigName/chat/:chatId"
              element={<StandaloneProjectSurfacePage />}
            />
          </Routes>
        </MemoryRouter>,
      );
    });

    expect(
      host.querySelector('[data-testid="standalone-managed-chat-blocked"]'),
    ).not.toBeNull();
    expect(
      host.querySelector(
        '[data-testid="standalone-project-chat-thread-surface"]',
      ),
    ).toBeNull();
  });

  it("clears a stale llm_disallowed block when navigating to the same thread in a different project config", async () => {
    hoisted.state.projectChatBlockedErrorCode = "llm_disallowed";
    hoisted.state.projectState.projectConfig.id = "project-config-1";

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/demo-a/chat/shared-thread"]}>
          <Routes>
            <Route
              path="/:projectConfigName/chat/:chatId"
              element={<StandaloneProjectSurfacePage />}
            />
          </Routes>
          <NavigateButton to="/demo-b/chat/shared-thread" />
        </MemoryRouter>,
      );
    });

    expect(
      host.querySelector('[data-testid="standalone-managed-chat-blocked"]'),
    ).not.toBeNull();

    hoisted.state.projectState.projectConfig.id = "project-config-2";
    hoisted.state.projectChatBlockedErrorCode = null;

    await act(async () => {
      click(
        host.querySelector(
          '[data-testid="mock-navigate-/demo-b/chat/shared-thread"]',
        ),
      );
    });

    const surface = host.querySelector(
      '[data-testid="standalone-project-chat-thread-surface"]',
    );
    expect(surface).not.toBeNull();
    expect(surface?.getAttribute("data-project-chat-id")).toBe("shared-thread");
    expect(
      host.querySelector('[data-testid="standalone-managed-chat-blocked"]'),
    ).toBeNull();
  });

  it("reopens a standalone project chat route when deployment policy allows LLM again on the same mounted page", async () => {
    hoisted.state.shareSessionState = {
      isDeploymentMode: true,
      sharePolicy: {
        allowLLM: true,
      },
    };
    hoisted.state.projectChatBlockedErrorCode = "llm_disallowed";

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/demo/chat/chat-alpha"]}>
          <Routes>
            <Route
              path="/:projectConfigName/chat/:chatId"
              element={<StandaloneProjectSurfacePage />}
            />
          </Routes>
        </MemoryRouter>,
      );
    });

    expect(
      host.querySelector('[data-testid="standalone-managed-chat-blocked"]'),
    ).not.toBeNull();

    hoisted.state.shareSessionState = {
      isDeploymentMode: true,
      sharePolicy: {
        allowLLM: false,
      },
    };
    hoisted.state.projectChatBlockedErrorCode = null;

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/demo/chat/chat-alpha"]}>
          <Routes>
            <Route
              path="/:projectConfigName/chat/:chatId"
              element={<StandaloneProjectSurfacePage />}
            />
          </Routes>
        </MemoryRouter>,
      );
    });

    expect(
      host.querySelector('[data-testid="standalone-managed-chat-blocked"]'),
    ).not.toBeNull();

    hoisted.state.shareSessionState = {
      isDeploymentMode: true,
      sharePolicy: {
        allowLLM: true,
      },
    };

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/demo/chat/chat-alpha"]}>
          <Routes>
            <Route
              path="/:projectConfigName/chat/:chatId"
              element={<StandaloneProjectSurfacePage />}
            />
          </Routes>
        </MemoryRouter>,
      );
    });

    expect(
      host.querySelector('[data-testid="standalone-managed-chat-blocked"]'),
    ).toBeNull();
    const surface = host.querySelector(
      '[data-testid="standalone-project-chat-thread-surface"]',
    );
    expect(surface).not.toBeNull();
    expect(surface?.getAttribute("data-project-chat-id")).toBe("chat-alpha");
  });

  it("reopens a managed standalone window-space route when deployment policy allows LLM again", async () => {
    hoisted.state.shareSessionState = {
      isDeploymentMode: true,
      sharePolicy: {
        allowLLM: true,
      },
    };
    hoisted.state.projectState = {
      projectConfig: {
        id: "project-config-1",
        windowSpaces: {
          "space-1": createWindowSpaceConfig({
            id: "space-1",
            name: "Research Board",
            windowsById: {
              "chat-window": {
                surfaceKind: WindowSpaceSurfaceKindEnum.project_chat,
                sectionIdOrNull: null,
                mode: ChatWindowModeEnum.project_ai_mode,
                title: "Research Chat",
                chatId: null,
                embeddedGitPaneVisible: false,
                zIndex: 1,
                normalizedBounds: {
                  x: 0,
                  y: 0,
                  width: 0.5,
                  height: 0.5,
                },
              },
            },
            order: ["chat-window"],
          }),
        },
        windowSpaceIdsBySlug: {
          research_board: ["space-1"],
        },
        sectionVariantMap: {},
        sectionIdsByPathSlug: {},
      },
      sections: {},
      sectionVariants: {},
      sectionImpls: {},
      parentSectionMap: {},
    };

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/demo/windowspace/research_board"]}>
          <Routes>
            <Route
              path="/:projectConfigName/windowspace/:windowSpaceSlug"
              element={<StandaloneProjectSurfacePage />}
            />
          </Routes>
        </MemoryRouter>,
      );
    });

    expect(
      host.querySelector(
        '[data-testid="mock-standalone-window-space-surface"]',
      ),
    ).not.toBeNull();

    hoisted.state.shareSessionState = {
      isDeploymentMode: true,
      sharePolicy: {
        allowLLM: false,
      },
    };

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/demo/windowspace/research_board"]}>
          <Routes>
            <Route
              path="/:projectConfigName/windowspace/:windowSpaceSlug"
              element={<StandaloneProjectSurfacePage />}
            />
          </Routes>
        </MemoryRouter>,
      );
    });

    expect(
      host.querySelector('[data-testid="standalone-managed-chat-blocked"]'),
    ).not.toBeNull();

    hoisted.state.shareSessionState = {
      isDeploymentMode: true,
      sharePolicy: {
        allowLLM: true,
      },
    };

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/demo/windowspace/research_board"]}>
          <Routes>
            <Route
              path="/:projectConfigName/windowspace/:windowSpaceSlug"
              element={<StandaloneProjectSurfacePage />}
            />
          </Routes>
        </MemoryRouter>,
      );
    });

    expect(
      host.querySelector('[data-testid="standalone-managed-chat-blocked"]'),
    ).toBeNull();
    expect(
      host.querySelector(
        '[data-testid="mock-standalone-window-space-surface"]',
      ),
    ).not.toBeNull();
  });
});
