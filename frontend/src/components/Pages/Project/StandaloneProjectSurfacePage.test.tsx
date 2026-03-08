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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StandaloneProjectSurfacePage } from "./StandaloneProjectSurfacePage";

type MockProjectState = {
  projectConfig: {
    id: string;
    windowSpaces: Record<string, unknown>;
  };
};

type MockAIState = {
  activeChatId: string | null | undefined;
  agentRuns: Array<unknown>;
  agentRunsAuthorityState: string;
  chatDetails: Record<string, unknown>;
};

const hoisted = vi.hoisted(() => {
  const state = {
    projectState: {
      projectConfig: {
        id: "project-config-1",
        windowSpaces: {},
      },
    } as MockProjectState,
    aiState: {
      activeChatId: "workspace-chat",
      agentRuns: [],
      agentRunsAuthorityState: "ready",
      chatDetails: {},
    } as MockAIState,
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

  return {
    state,
    useProjectStateMock,
    useAIStoreMock,
  };
});

vi.mock("components/ChatWindowing/UnifiedChatSurface", () => ({
  UnifiedChatSurface: ({
    dataTestId,
    projectChatId,
    setProjectChatId,
    onProjectChatBlockedErrorCodeChange,
  }: {
    dataTestId?: string;
    projectChatId?: string | null;
    setProjectChatId?: (next: string | null) => void;
    onProjectChatBlockedErrorCodeChange?: (errorCode: string | null) => void;
  }) => (
    <MockUnifiedChatSurface
      dataTestId={dataTestId}
      projectChatId={projectChatId}
      setProjectChatId={setProjectChatId}
      onProjectChatBlockedErrorCodeChange={onProjectChatBlockedErrorCodeChange}
    />
  ),
}));

function MockUnifiedChatSurface({
  dataTestId,
  projectChatId,
  setProjectChatId,
  onProjectChatBlockedErrorCodeChange,
}: {
  dataTestId?: string;
  projectChatId?: string | null;
  setProjectChatId?: (next: string | null) => void;
  onProjectChatBlockedErrorCodeChange?: (errorCode: string | null) => void;
}) {
  useEffect(() => {
    onProjectChatBlockedErrorCodeChange?.(
      hoisted.state.projectChatBlockedErrorCode,
    );
  }, [onProjectChatBlockedErrorCodeChange]);

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

vi.mock("components/Section/Container/ManyNestedSections", () => ({
  MaybeManyNestedSections: () => (
    <div data-testid="mock-many-nested-sections" />
  ),
}));

vi.mock("components/Section/Container/SectionWindowSurface", () => ({
  SectionWindowSurface: () => <div data-testid="mock-section-window-surface" />,
}));

vi.mock("components/Utils/FloatingBox", () => ({
  FloatingBox: () => <div data-testid="mock-floating-box" />,
}));

vi.mock("forks/dnd-kit/SectionDndContext", () => ({
  SectionDndContext: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("forks/xyflow/core/utils/mouseLocation", () => ({
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
  StandaloneWindowSpaceSurface: () => (
    <div data-testid="mock-standalone-window-space-surface" />
  ),
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

describe("StandaloneProjectSurfacePage", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    hoisted.state.projectState = {
      projectConfig: {
        id: "project-config-1",
        windowSpaces: {},
      },
    };
    hoisted.state.aiState = {
      activeChatId: "workspace-chat",
      agentRuns: [],
      agentRunsAuthorityState: "ready",
      chatDetails: {},
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
});
