import { renderToStaticMarkup } from "react-dom/server";
import {
  ChatWindowModeEnum,
  ChatWindowPlacementEnum,
  createProjectChatWindowingState,
} from "utils/generatedTypes";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UnifiedChatSurface } from "./UnifiedChatSurface";

vi.mock("components/Panes/Overview/ProjectLevelAI/ProjectChat", () => ({
  ProjectChat: () => <div data-testid="mock-project-chat">project chat</div>,
}));

vi.mock("components/Section/Layouts/ChatArea", () => ({
  ChatArea: ({ sectionId }: { sectionId: string }) => (
    <div data-testid="mock-section-chat">section chat:{sectionId}</div>
  ),
}));

vi.mock("components/Git/GitGraphWindowContent", () => ({
  GitGraphWindowContent: () => (
    <div data-testid="mock-git-graph-window-content">git graph</div>
  ),
}));

type MockProjectState = {
  projectChatWindowing: ReturnType<typeof createProjectChatWindowingState>;
  sections: Record<
    string,
    {
      name: string;
      displayName?: string;
    }
  >;
};

let mockProjectState: MockProjectState = {
  projectChatWindowing: createProjectChatWindowingState(),
  sections: {},
};

vi.mock("state/definitions", () => ({
  useProjectState: (selector: (state: MockProjectState) => unknown) =>
    selector(mockProjectState),
}));

describe("UnifiedChatSurface", () => {
  beforeEach(() => {
    mockProjectState = {
      projectChatWindowing: createProjectChatWindowingState(),
      sections: {},
    };
  });

  it("renders project chat for project-ai mode", () => {
    const markup = renderToStaticMarkup(
      <UnifiedChatSurface
        mode={ChatWindowModeEnum.project_ai_mode}
        host={ChatWindowPlacementEnum.bottom_docked}
      />,
    );

    expect(markup).toContain('data-chat-surface-mode="project_ai_mode"');
    expect(markup).toContain('data-chat-surface-host="bottom_docked"');
    expect(markup).toContain('data-testid="mock-project-chat"');
    expect(markup).not.toContain('data-testid="mock-section-chat"');
  });

  it("uses the section body shell for canvas-hosted project-ai mode", () => {
    const markup = renderToStaticMarkup(
      <UnifiedChatSurface
        mode={ChatWindowModeEnum.project_ai_mode}
        host="section_layout"
        sectionId="section-123"
      />,
    );

    expect(markup).toContain('data-chat-surface-mode="project_ai_mode"');
    expect(markup).toContain('data-chat-surface-host="section_layout"');
    expect(markup).toContain("section-main-full-w");
    expect(markup).toContain("overflow-hidden");
    expect(markup).toContain('data-testid="mock-project-chat"');
  });

  it("renders section chat for section mode with section id", () => {
    const markup = renderToStaticMarkup(
      <UnifiedChatSurface
        mode={ChatWindowModeEnum.section_mode}
        host="section_layout"
        sectionId="section-123"
      />,
    );

    expect(markup).toContain('data-chat-surface-mode="section_mode"');
    expect(markup).toContain('data-chat-surface-host="section_layout"');
    expect(markup).toContain("section-main-full-w");
    expect(markup).toContain('data-testid="mock-section-chat"');
    expect(markup).toContain("section chat:section-123");
    expect(markup).not.toContain('data-testid="mock-project-chat"');
  });

  it("renders git graph content for git-graph mode with section host chrome", () => {
    const markup = renderToStaticMarkup(
      <UnifiedChatSurface
        mode={ChatWindowModeEnum.git_graph_mode}
        host="section_layout"
        sectionId="section-123"
      />,
    );

    expect(markup).toContain('data-chat-surface-mode="git_graph_mode"');
    expect(markup).toContain('data-chat-surface-host="section_layout"');
    expect(markup).toContain('data-testid="mock-git-graph-window-content"');
    expect(markup).not.toContain('data-testid="mock-section-chat"');
    expect(markup).not.toContain('data-testid="mock-project-chat"');
  });

  it("uses the standalone host chrome for standalone project chat", () => {
    const markup = renderToStaticMarkup(
      <UnifiedChatSurface
        mode={ChatWindowModeEnum.project_ai_mode}
        host="standalone_page"
      />,
    );

    expect(markup).toContain('data-chat-surface-host="standalone_page"');
    expect(markup).toContain('data-testid="mock-project-chat"');
    expect(markup).not.toContain("section-main-full-w");
    expect(markup).not.toContain("rounded-2xl");
    expect(markup).not.toContain("border-setta-200");
  });

  it("shows a clear warning when section mode is missing section id", () => {
    const markup = renderToStaticMarkup(
      <UnifiedChatSurface
        mode={ChatWindowModeEnum.section_mode}
        host="section_layout"
      />,
    );

    expect(markup).toContain('role="alert"');
    expect(markup).toContain("Section chat surface is missing a section id.");
    expect(markup).not.toContain('data-testid="mock-section-chat"');
  });

  it("renders a placeholder when canvas-backed chat is externalized to another host", () => {
    mockProjectState = {
      projectChatWindowing: createProjectChatWindowingState({
        order: ["project-chat-window-1"],
        instancesById: {
          "project-chat-window-1": {
            instanceId: "project-chat-window-1",
            placement: ChatWindowPlacementEnum.bottom_docked,
            sectionIdOrNull: "section-123",
            isClosed: false,
            isMinimized: false,
          },
        },
      }),
      sections: {
        "section-123": { name: "Section Chat" },
      },
    };
    const markup = renderToStaticMarkup(
      <UnifiedChatSurface
        mode={ChatWindowModeEnum.section_mode}
        host="section_layout"
        sectionId="section-123"
      />,
    );

    expect(markup).toContain(
      'data-testid="project-chat-canvas-floating-placeholder"',
    );
    expect(markup).toContain("section-main-full-w");
    expect(markup).toContain("moved to a window");
    expect(markup).not.toContain('data-testid="mock-section-chat"');
  });

  it("keeps the floating placeholder for project-ai mode section surfaces", () => {
    mockProjectState = {
      projectChatWindowing: createProjectChatWindowingState({
        order: ["project-chat-window-1"],
        instancesById: {
          "project-chat-window-1": {
            instanceId: "project-chat-window-1",
            placement: ChatWindowPlacementEnum.floating,
            sectionIdOrNull: "section-123",
            mode: ChatWindowModeEnum.project_ai_mode,
            isClosed: false,
            isMinimized: false,
          },
        },
      }),
      sections: {
        "section-123": { name: "Section Chat" },
      },
    };

    const markup = renderToStaticMarkup(
      <UnifiedChatSurface
        mode={ChatWindowModeEnum.project_ai_mode}
        host="section_layout"
        sectionId="section-123"
      />,
    );

    expect(markup).toContain(
      'data-testid="project-chat-canvas-floating-placeholder"',
    );
    expect(markup).toContain("section-main-full-w");
    expect(markup).not.toContain('data-testid="mock-project-chat"');
  });

  it("bypasses canvas placeholders for standalone section chat surfaces", () => {
    mockProjectState = {
      projectChatWindowing: createProjectChatWindowingState({
        order: ["project-chat-window-1"],
        instancesById: {
          "project-chat-window-1": {
            instanceId: "project-chat-window-1",
            placement: ChatWindowPlacementEnum.floating,
            sectionIdOrNull: "section-123",
            mode: ChatWindowModeEnum.section_mode,
            isClosed: false,
            isMinimized: false,
          },
        },
      }),
      sections: {
        "section-123": { name: "Section Chat" },
      },
    };

    const markup = renderToStaticMarkup(
      <UnifiedChatSurface
        mode={ChatWindowModeEnum.section_mode}
        host="standalone_page"
        sectionId="section-123"
      />,
    );

    expect(markup).toContain('data-chat-surface-host="standalone_page"');
    expect(markup).toContain('data-testid="mock-section-chat"');
    expect(markup).not.toContain(
      'data-testid="project-chat-canvas-floating-placeholder"',
    );
  });
});
