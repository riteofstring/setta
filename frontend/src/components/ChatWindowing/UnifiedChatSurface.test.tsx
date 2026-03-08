import { renderToStaticMarkup } from "react-dom/server";
import {
  ChatWindowModeEnum,
  ChatWindowPlacementEnum,
  createProjectChatWindowingState,
} from "utils/generatedTypes";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UnifiedChatSurface } from "./UnifiedChatSurface";

vi.mock("components/Panes/Overview/ProjectLevelAI/ProjectChat", () => ({
  ProjectChat: ({
    chatId,
    setChatId,
  }: {
    chatId?: string | null;
    setChatId?: unknown;
  }) => (
    <div
      data-testid="mock-project-chat"
      data-project-chat-id={chatId ?? ""}
      data-project-chat-controlled={setChatId ? "true" : "false"}
    >
      project chat:{chatId ?? "global"}
    </div>
  ),
}));

vi.mock("components/Section/Layouts/ChatArea", () => ({
  ChatArea: ({
    sectionId,
    surfaceId,
    controlledChatId,
    setControlledChatId,
  }: {
    sectionId: string;
    surfaceId?: string;
    controlledChatId?: string | null;
    setControlledChatId?: unknown;
  }) => (
    <div
      data-testid="mock-section-chat"
      data-surface-id={surfaceId ?? ""}
      data-controlled-chat-id={controlledChatId ?? ""}
      data-controlled-chat={setControlledChatId ? "true" : "false"}
    >
      section chat:{sectionId}
    </div>
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
    expect(markup).toContain('data-project-chat-id=""');
    expect(markup).not.toContain('data-testid="mock-section-chat"');
  });

  it("uses the section body shell for canvas-hosted project-ai mode", () => {
    mockProjectState = {
      projectChatWindowing: createProjectChatWindowingState({
        order: ["project-chat-window-1"],
        instancesById: {
          "project-chat-window-1": {
            instanceId: "project-chat-window-1",
            placement: ChatWindowPlacementEnum.canvas_section,
            sectionIdOrNull: "section-123",
            mode: ChatWindowModeEnum.project_ai_mode,
            chatId: null,
            isClosed: false,
            isMinimized: false,
          },
        },
      }),
      sections: {},
    };

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

  it("uses the authoritative section binding for canvas-hosted project-ai mode", () => {
    mockProjectState = {
      projectChatWindowing: createProjectChatWindowingState({
        order: ["project-chat-window-1"],
        instancesById: {
          "project-chat-window-1": {
            instanceId: "project-chat-window-1",
            placement: ChatWindowPlacementEnum.canvas_section,
            sectionIdOrNull: "section-123",
            mode: ChatWindowModeEnum.project_ai_mode,
            chatId: "section-thread",
            isClosed: false,
            isMinimized: false,
          },
        },
      }),
      sections: {},
    };

    const markup = renderToStaticMarkup(
      <UnifiedChatSurface
        mode={ChatWindowModeEnum.project_ai_mode}
        host="section_layout"
        sectionId="section-123"
      />,
    );

    expect(markup).toContain('data-project-chat-id="section-thread"');
    expect(markup).toContain('data-project-chat-controlled="true"');
    expect(markup).not.toContain("project chat:global");
  });

  it("uses the authoritative section binding for standalone section routes", () => {
    mockProjectState = {
      projectChatWindowing: createProjectChatWindowingState({
        order: ["project-chat-window-1"],
        instancesById: {
          "project-chat-window-1": {
            instanceId: "project-chat-window-1",
            placement: ChatWindowPlacementEnum.floating,
            sectionIdOrNull: "section-123",
            mode: ChatWindowModeEnum.project_ai_mode,
            chatId: "section-thread",
            isClosed: false,
            isMinimized: false,
          },
        },
      }),
      sections: {},
    };

    const markup = renderToStaticMarkup(
      <UnifiedChatSurface
        mode={ChatWindowModeEnum.project_ai_mode}
        host="standalone_page"
        sectionId="section-123"
      />,
    );

    expect(markup).toContain('data-project-chat-id="section-thread"');
    expect(markup).toContain('data-project-chat-controlled="true"');
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

  it("keeps workspace section-mode surfaces bound to section state", () => {
    const markup = renderToStaticMarkup(
      <UnifiedChatSurface
        mode={ChatWindowModeEnum.section_mode}
        host={ChatWindowPlacementEnum.floating}
        sectionId="section-123"
      />,
    );

    expect(markup).toContain('data-controlled-chat-id=""');
    expect(markup).toContain('data-controlled-chat="false"');
  });

  it("forwards surface ownership to section-mode chat hosts", () => {
    const markup = renderToStaticMarkup(
      <UnifiedChatSurface
        mode={ChatWindowModeEnum.section_mode}
        host="section_layout"
        sectionId="section-123"
        surfaceId="workspace-section:project-1:section-123"
      />,
    );

    expect(markup).toContain(
      'data-surface-id="workspace-section:project-1:section-123"',
    );
  });

  it("forwards controlled chat ownership to section-mode chat hosts", () => {
    const markup = renderToStaticMarkup(
      <UnifiedChatSurface
        mode={ChatWindowModeEnum.section_mode}
        host="standalone_page"
        sectionId="section-123"
        surfaceId="standalone-window-space:project-1:space-1:window-1"
        projectChatId="saved-thread"
        setProjectChatId={() => {}}
      />,
    );

    expect(markup).toContain('data-controlled-chat-id="saved-thread"');
    expect(markup).toContain('data-controlled-chat="true"');
  });

  it("shows a clear warning when git-graph mode is routed through the wrong surface", () => {
    const markup = renderToStaticMarkup(
      <UnifiedChatSurface
        mode={ChatWindowModeEnum.git_graph_mode}
        host="section_layout"
        sectionId="section-123"
      />,
    );

    expect(markup).toContain('role="alert"');
    expect(markup).toContain('data-chat-surface-mode="git_graph_mode"');
    expect(markup).toContain('data-chat-surface-host="section_layout"');
    expect(markup).toContain(
      "Git graph surfaces must render via GitGraphWindowContent(instanceId).",
    );
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

  it("passes a window-scoped project chat id through to the project chat surface", () => {
    const markup = renderToStaticMarkup(
      <div>
        <UnifiedChatSurface
          mode={ChatWindowModeEnum.project_ai_mode}
          host={ChatWindowPlacementEnum.floating}
          projectChatId="chat-alpha"
          setProjectChatId={() => {}}
        />
        <UnifiedChatSurface
          mode={ChatWindowModeEnum.project_ai_mode}
          host={ChatWindowPlacementEnum.bottom_docked}
          projectChatId="chat-beta"
          setProjectChatId={() => {}}
        />
      </div>,
    );

    expect(markup).toContain('data-project-chat-id="chat-alpha"');
    expect(markup).toContain('data-project-chat-id="chat-beta"');
    expect(markup).toContain("project chat:chat-alpha");
    expect(markup).toContain("project chat:chat-beta");
    expect(markup).toContain('data-project-chat-controlled="true"');
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

  it("shows a clear warning when project-ai mode is missing a section binding", () => {
    const markup = renderToStaticMarkup(
      <UnifiedChatSurface
        mode={ChatWindowModeEnum.project_ai_mode}
        host="standalone_page"
        sectionId="section-123"
      />,
    );

    expect(markup).toContain('role="alert"');
    expect(markup).toContain(
      "Section project chat surface is missing a project chat binding.",
    );
    expect(markup).not.toContain('data-testid="mock-project-chat"');
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

  it("keeps the canvas placeholder when the external chat window is minimized", () => {
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
            isMinimized: true,
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
    expect(markup).not.toContain('data-testid="mock-project-chat"');
  });

  it("keeps the canvas placeholder when the external chat window is closed", () => {
    mockProjectState = {
      projectChatWindowing: createProjectChatWindowingState({
        order: ["project-chat-window-1"],
        instancesById: {
          "project-chat-window-1": {
            instanceId: "project-chat-window-1",
            placement: ChatWindowPlacementEnum.floating,
            sectionIdOrNull: "section-123",
            mode: ChatWindowModeEnum.section_mode,
            isClosed: true,
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
    expect(markup).not.toContain('data-testid="mock-section-chat"');
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
