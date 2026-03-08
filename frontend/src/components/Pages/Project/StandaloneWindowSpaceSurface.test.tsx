import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ChatWindowModeEnum,
  WindowSpaceSurfaceKindEnum,
  createWindowSpaceConfig,
} from "utils/generatedTypes";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  StandaloneWindowSpaceSurface,
  applyStandaloneWindowSpaceHydration,
  mergeHydratedStandaloneWindows,
} from "./StandaloneWindowSpaceSurface";

type MockProjectState = {
  sections: Record<string, { name: string }>;
};

let mockProjectState: MockProjectState = {
  sections: {},
};

vi.mock("state/definitions", () => ({
  useProjectState: (
    selector: (state: MockProjectState) => unknown,
    _equalityFn?: unknown,
  ) => selector(mockProjectState),
}));

vi.mock("components/ChatWindowing/ProjectChatWindowSurface", () => ({
  ProjectChatWindowSurface: ({
    title,
    children,
  }: {
    title: string;
    children: ReactNode;
  }) => (
    <div data-testid="mock-project-chat-window-surface">
      <span>{title}</span>
      {children}
    </div>
  ),
}));

vi.mock("components/ChatWindowing/UnifiedChatSurface", () => ({
  UnifiedChatSurface: ({
    projectChatId,
    mode,
    setProjectChatId,
  }: {
    projectChatId?: string | null;
    mode?: string;
    setProjectChatId?: (next: string | null) => void;
  }) => (
    <div
      data-testid="mock-unified-chat-surface"
      data-project-chat-id={projectChatId ?? ""}
      data-chat-surface-mode={mode ?? ""}
    >
      project chat:{projectChatId ?? "global"}
      {setProjectChatId ? (
        <button
          type="button"
          data-testid="mock-set-project-chat-id"
          onClick={() => {
            setProjectChatId("chat-local-override");
          }}
        >
          Set local chat
        </button>
      ) : null}
    </div>
  ),
}));

vi.mock("components/Git/GitGraphWindowContent", () => ({
  GitGraphWindowContent: ({
    instanceId,
    showEmbeddedGitPaneToggle = false,
    embeddedGitPaneVisible = false,
  }: {
    instanceId?: string | null;
    showEmbeddedGitPaneToggle?: boolean;
    embeddedGitPaneVisible?: boolean;
  }) => (
    <div
      data-testid="mock-git-graph-window-content"
      data-instance-id={instanceId ?? ""}
      data-show-embedded-git-pane-toggle={
        showEmbeddedGitPaneToggle ? "true" : "false"
      }
      data-embedded-git-pane-visible={embeddedGitPaneVisible ? "true" : "false"}
    >
      git graph
    </div>
  ),
}));

vi.mock("components/Section/Container/SectionWindowSurface", () => ({
  SectionWindowSurface: ({
    sectionId,
    chatModeOverride,
    projectChatId,
    setProjectChatId,
  }: {
    sectionId: string;
    chatModeOverride?: string;
    projectChatId?: string | null;
    setProjectChatId?: (next: string | null) => void;
  }) => (
    <div
      data-testid="mock-section-window-surface"
      data-section-id={sectionId}
      data-chat-mode-override={chatModeOverride ?? ""}
      data-project-chat-id={projectChatId ?? ""}
      data-project-chat-controlled={setProjectChatId ? "true" : "false"}
    >
      {sectionId}
    </div>
  ),
}));

describe("StandaloneWindowSpaceSurface", () => {
  beforeEach(() => {
    mockProjectState = {
      sections: {
        "section-1": { name: "Research Notes" },
      },
    };
  });

  it("renders saved project chat, git graph, and section windows", () => {
    const markup = renderToStaticMarkup(
      <StandaloneWindowSpaceSurface
        windowSpace={createWindowSpaceConfig({
          id: "space-id",
          name: "Research Board",
          windowsById: {
            "chat-window": {
              surfaceKind: WindowSpaceSurfaceKindEnum.project_chat,
              sectionIdOrNull: null,
              mode: ChatWindowModeEnum.project_ai_mode,
              title: "Research Chat",
              chatId: "chat-window-1",
              zIndex: 1,
              normalizedBounds: {
                x: 0,
                y: 0,
                width: 0.5,
                height: 0.5,
              },
            },
            "graph-window": {
              surfaceKind: WindowSpaceSurfaceKindEnum.project_chat,
              sectionIdOrNull: null,
              mode: ChatWindowModeEnum.git_graph_mode,
              title: null,
              chatId: null,
              zIndex: 2,
              normalizedBounds: {
                x: 0,
                y: 0.5,
                width: 0.5,
                height: 0.5,
              },
            },
            "section-window": {
              surfaceKind: WindowSpaceSurfaceKindEnum.section,
              sectionIdOrNull: "section-1",
              mode: ChatWindowModeEnum.section_mode,
              title: null,
              chatId: null,
              zIndex: 3,
              normalizedBounds: {
                x: 0.5,
                y: 0,
                width: 0.5,
                height: 0.75,
              },
            },
          },
          order: ["chat-window", "graph-window", "section-window"],
        })}
      />,
    );

    expect(markup).toContain('data-testid="standalone-window-space-surface"');
    expect(markup).toContain('data-testid="standalone-window-space-window"');
    expect(markup).toContain('data-testid="mock-project-chat-window-surface"');
    expect(markup).toContain('data-testid="mock-unified-chat-surface"');
    expect(markup).toContain('data-project-chat-id="chat-window-1"');
    expect(markup).toContain('data-testid="mock-git-graph-window-content"');
    expect(markup).toContain('data-show-embedded-git-pane-toggle="true"');
    expect(markup).toContain('data-testid="mock-section-window-surface"');
  });

  it("passes saved mode and chat identity into standalone section windows", () => {
    const markup = renderToStaticMarkup(
      <StandaloneWindowSpaceSurface
        windowSpace={createWindowSpaceConfig({
          id: "space-id",
          name: "Research Board",
          windowsById: {
            "section-window": {
              surfaceKind: WindowSpaceSurfaceKindEnum.section,
              sectionIdOrNull: "section-1",
              mode: ChatWindowModeEnum.project_ai_mode,
              title: null,
              chatId: "chat-section-1",
              zIndex: 3,
              normalizedBounds: {
                x: 0,
                y: 0,
                width: 0.5,
                height: 0.75,
              },
            },
          },
          order: ["section-window"],
        })}
      />,
    );

    expect(markup).toContain('data-testid="mock-section-window-surface"');
    expect(markup).toContain('data-chat-mode-override="project_ai_mode"');
    expect(markup).toContain('data-project-chat-id="chat-section-1"');
    expect(markup).toContain('data-project-chat-controlled="true"');
  });

  it("renders shared resize handles for snapped window-space layouts", () => {
    const markup = renderToStaticMarkup(
      <StandaloneWindowSpaceSurface
        windowSpace={createWindowSpaceConfig({
          id: "space-id",
          name: "Research Board",
          windowsById: {
            "left-window": {
              surfaceKind: WindowSpaceSurfaceKindEnum.project_chat,
              sectionIdOrNull: null,
              mode: ChatWindowModeEnum.project_ai_mode,
              title: null,
              chatId: null,
              zIndex: 1,
              normalizedBounds: {
                x: 0,
                y: 0,
                width: 0.5,
                height: 1,
              },
            },
            "right-window": {
              surfaceKind: WindowSpaceSurfaceKindEnum.project_chat,
              sectionIdOrNull: null,
              mode: ChatWindowModeEnum.project_ai_mode,
              title: null,
              chatId: null,
              zIndex: 2,
              normalizedBounds: {
                x: 0.5,
                y: 0,
                width: 0.5,
                height: 1,
              },
            },
          },
          order: ["left-window", "right-window"],
        })}
      />,
    );

    expect(markup).toContain(
      'data-testid="standalone-window-space-resize-handle"',
    );
    expect(markup).toContain('data-resize-axis="vertical"');
    expect(markup).toContain("z-index:24");
  });

  it("shows an empty-state message when the saved space has no windows", () => {
    const markup = renderToStaticMarkup(
      <StandaloneWindowSpaceSurface
        windowSpace={createWindowSpaceConfig({
          id: "space-id",
          name: "Research Board",
          windowsById: {},
          order: [],
        })}
      />,
    );

    expect(markup).toContain(
      "This window space does not have any saved floating windows.",
    );
  });

  it("resets standalone git-pane visibility when a different saved space reuses the same window id", () => {
    const previousHydratedWindowsById = {
      "graph-window": {
        instanceId: "graph-window",
        surfaceKind: WindowSpaceSurfaceKindEnum.project_chat,
        sectionIdOrNull: null,
        mode: ChatWindowModeEnum.git_graph_mode,
        title: "Git Graph",
        chatId: null,
        embeddedGitPaneVisible: false,
        zIndex: 1,
        bounds: {
          x: 0,
          y: 0,
          width: 900,
          height: 520,
        },
      },
    };
    const currentWindowsById = {
      "graph-window": {
        ...previousHydratedWindowsById["graph-window"],
        embeddedGitPaneVisible: true,
      },
    };
    const nextHydratedWindowsById = {
      "graph-window": {
        ...previousHydratedWindowsById["graph-window"],
      },
    };

    expect(
      applyStandaloneWindowSpaceHydration({
        currentWindowsById,
        previousHydratedWindowsById,
        nextHydratedWindowsById,
        previousWindowSpaceId: "space-a",
        nextWindowSpaceId: "space-b",
      }),
    ).toEqual({
      nextLocalWindowsById: nextHydratedWindowsById,
      nextPreviousHydratedWindowsById: nextHydratedWindowsById,
      nextWindowSpaceId: "space-b",
      resetLocalState: true,
    });
  });

  it("preserves local chat ids and resized bounds when hydration only changes presentation", () => {
    const previousHydratedWindowsById = {
      "chat-window": {
        instanceId: "chat-window",
        surfaceKind: WindowSpaceSurfaceKindEnum.project_chat,
        sectionIdOrNull: null,
        mode: ChatWindowModeEnum.project_ai_mode,
        title: "Research Chat",
        chatId: "chat-window-1",
        embeddedGitPaneVisible: false,
        zIndex: 1,
        bounds: {
          x: 0,
          y: 0,
          width: 900,
          height: 520,
        },
      },
    };
    const currentWindowsById = {
      "chat-window": {
        ...previousHydratedWindowsById["chat-window"],
        chatId: "chat-window-2",
        zIndex: 7,
        bounds: {
          x: 12,
          y: 24,
          width: 840,
          height: 460,
        },
      },
    };
    const nextHydratedWindowsById = {
      "chat-window": {
        ...previousHydratedWindowsById["chat-window"],
        title: "Renamed Chat",
        bounds: {
          x: 0,
          y: 0,
          width: 720,
          height: 440,
        },
      },
    };

    expect(
      mergeHydratedStandaloneWindows(
        currentWindowsById,
        previousHydratedWindowsById,
        nextHydratedWindowsById,
      ),
    ).toEqual({
      "chat-window": {
        instanceId: "chat-window",
        surfaceKind: WindowSpaceSurfaceKindEnum.project_chat,
        sectionIdOrNull: null,
        mode: ChatWindowModeEnum.project_ai_mode,
        title: "Renamed Chat",
        chatId: "chat-window-2",
        embeddedGitPaneVisible: false,
        zIndex: 7,
        bounds: {
          x: 12,
          y: 24,
          width: 840,
          height: 460,
        },
      },
    });
  });

  it("preserves local chat state when the same saved window space rehydrates", () => {
    const previousHydratedWindowsById = {
      "chat-window": {
        instanceId: "chat-window",
        surfaceKind: WindowSpaceSurfaceKindEnum.project_chat,
        sectionIdOrNull: null,
        mode: ChatWindowModeEnum.project_ai_mode,
        title: "Research Chat",
        chatId: "chat-window-1",
        embeddedGitPaneVisible: false,
        zIndex: 1,
        bounds: {
          x: 0,
          y: 0,
          width: 900,
          height: 520,
        },
      },
    };
    const currentWindowsById = {
      "chat-window": {
        ...previousHydratedWindowsById["chat-window"],
        chatId: "chat-local-override",
        zIndex: 7,
      },
    };
    const nextHydratedWindowsById = {
      "chat-window": {
        ...previousHydratedWindowsById["chat-window"],
        title: "Renamed Chat",
        bounds: {
          x: 0,
          y: 0,
          width: 720,
          height: 440,
        },
      },
    };

    expect(
      applyStandaloneWindowSpaceHydration({
        currentWindowsById,
        previousHydratedWindowsById,
        nextHydratedWindowsById,
        previousWindowSpaceId: "space-id",
        nextWindowSpaceId: "space-id",
      }),
    ).toEqual({
      nextLocalWindowsById: {
        "chat-window": {
          instanceId: "chat-window",
          surfaceKind: WindowSpaceSurfaceKindEnum.project_chat,
          sectionIdOrNull: null,
          mode: ChatWindowModeEnum.project_ai_mode,
          title: "Renamed Chat",
          chatId: "chat-local-override",
          embeddedGitPaneVisible: false,
          zIndex: 7,
          bounds: {
            x: 0,
            y: 0,
            width: 720,
            height: 440,
          },
        },
      },
      nextPreviousHydratedWindowsById: nextHydratedWindowsById,
      nextWindowSpaceId: "space-id",
      resetLocalState: false,
    });
  });

  it("resets standalone local state when switching to a different saved layout", () => {
    const previousHydratedWindowsById = {
      "chat-window": {
        instanceId: "chat-window",
        surfaceKind: WindowSpaceSurfaceKindEnum.project_chat,
        sectionIdOrNull: null,
        mode: ChatWindowModeEnum.project_ai_mode,
        title: "Research Chat",
        chatId: "chat-window-1",
        embeddedGitPaneVisible: false,
        zIndex: 1,
        bounds: {
          x: 0,
          y: 0,
          width: 900,
          height: 520,
        },
      },
    };
    const currentWindowsById = {
      "chat-window": {
        ...previousHydratedWindowsById["chat-window"],
        chatId: "chat-local-override",
      },
    };
    const nextHydratedWindowsById = {
      "other-window": {
        instanceId: "other-window",
        surfaceKind: WindowSpaceSurfaceKindEnum.project_chat,
        sectionIdOrNull: null,
        mode: ChatWindowModeEnum.project_ai_mode,
        title: "Other Chat",
        chatId: "chat-window-9",
        embeddedGitPaneVisible: false,
        zIndex: 2,
        bounds: {
          x: 20,
          y: 20,
          width: 640,
          height: 420,
        },
      },
    };

    expect(
      applyStandaloneWindowSpaceHydration({
        currentWindowsById,
        previousHydratedWindowsById,
        nextHydratedWindowsById,
        previousWindowSpaceId: "space-id",
        nextWindowSpaceId: "space-id-2",
      }),
    ).toEqual({
      nextLocalWindowsById: nextHydratedWindowsById,
      nextPreviousHydratedWindowsById: nextHydratedWindowsById,
      nextWindowSpaceId: "space-id-2",
      resetLocalState: true,
    });
  });
});
