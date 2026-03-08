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
  }: {
    projectChatId?: string | null;
  }) => (
    <div
      data-testid="mock-unified-chat-surface"
      data-project-chat-id={projectChatId ?? ""}
    >
      project chat:{projectChatId ?? "global"}
    </div>
  ),
}));

vi.mock("components/Git/GitGraphWindowContent", () => ({
  GitGraphWindowContent: ({
    instanceId,
    showEmbeddedGitPaneToggle = false,
  }: {
    instanceId?: string | null;
    showEmbeddedGitPaneToggle?: boolean;
  }) => (
    <div
      data-testid="mock-git-graph-window-content"
      data-instance-id={instanceId ?? ""}
      data-show-embedded-git-pane-toggle={
        showEmbeddedGitPaneToggle ? "true" : "false"
      }
    >
      git graph
    </div>
  ),
}));

vi.mock("components/Section/Container/SectionWindowSurface", () => ({
  SectionWindowSurface: ({ sectionId }: { sectionId: string }) => (
    <div data-testid="mock-section-window-surface">{sectionId}</div>
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

  it("preserves local chat ids and resized bounds when hydration only changes presentation", () => {
    const previousHydratedWindowsById = {
      "chat-window": {
        instanceId: "chat-window",
        surfaceKind: WindowSpaceSurfaceKindEnum.project_chat,
        sectionIdOrNull: null,
        mode: ChatWindowModeEnum.project_ai_mode,
        title: "Research Chat",
        chatId: "chat-window-1",
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
});
