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

type MockProjectState = {
  projectChatWindowing: ReturnType<typeof createProjectChatWindowingState>;
};

let mockProjectState: MockProjectState = {
  projectChatWindowing: createProjectChatWindowingState(),
};

vi.mock("state/definitions", () => ({
  useProjectState: (selector: (state: MockProjectState) => unknown) =>
    selector(mockProjectState),
}));

describe("UnifiedChatSurface", () => {
  beforeEach(() => {
    mockProjectState = {
      projectChatWindowing: createProjectChatWindowingState(),
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
    expect(markup).toContain('data-testid="mock-section-chat"');
    expect(markup).toContain("section chat:section-123");
    expect(markup).not.toContain('data-testid="mock-project-chat"');
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

  it("renders a placeholder when canvas-backed chat is externalized to floating", () => {
    mockProjectState = {
      projectChatWindowing: createProjectChatWindowingState({
        order: ["project-chat-window-1"],
        instancesById: {
          "project-chat-window-1": {
            instanceId: "project-chat-window-1",
            placement: ChatWindowPlacementEnum.floating,
            sectionIdOrNull: "section-123",
            isClosed: false,
            isMinimized: false,
          },
        },
      }),
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
    expect(markup).toContain("Chat moved to floating window");
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
});
