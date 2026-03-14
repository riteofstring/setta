import { type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ChatWindowModeEnum,
  WindowSpaceSurfaceKindEnum,
} from "utils/generatedTypes";
import { describe, expect, it, vi } from "vitest";
import { StandaloneWindowSpaceWindowSurface } from "./StandaloneWindowSpaceWindowSurface";

vi.mock("components/ChatWindowing/ProjectChatWindowSurface", () => ({
  ProjectChatWindowSurface: ({
    children,
    title,
  }: {
    children: ReactNode;
    title: string;
  }) => (
    <div data-testid="mock-project-chat-window-surface" data-title={title}>
      {children}
    </div>
  ),
}));

vi.mock("components/ChatWindowing/UnifiedChatSurface", () => ({
  UnifiedChatSurface: ({
    projectChatId,
    surfaceId,
  }: {
    projectChatId?: string | null;
    surfaceId?: string;
  }) => (
    <div
      data-testid="mock-unified-chat-surface"
      data-project-chat-id={projectChatId ?? ""}
      data-project-chat-surface-id={surfaceId ?? ""}
    />
  ),
}));

vi.mock("components/Git/GitGraphWindowContent", () => ({
  GitGraphWindowContent: ({
    instanceId,
    embeddedGitPaneVisible,
  }: {
    instanceId?: string | null;
    embeddedGitPaneVisible?: boolean;
  }) => (
    <div
      data-testid="mock-git-graph-window-content"
      data-instance-id={instanceId ?? ""}
      data-embedded-git-pane-visible={embeddedGitPaneVisible ? "true" : "false"}
    />
  ),
}));

vi.mock("components/Section/Container/SectionWindowSurface", () => ({
  SectionWindowSurface: ({
    sectionId,
    projectChatId,
    projectChatSurfaceId,
  }: {
    sectionId: string;
    projectChatId?: string | null;
    projectChatSurfaceId?: string;
  }) => (
    <div
      data-testid="mock-section-window-surface"
      data-section-id={sectionId}
      data-project-chat-id={projectChatId ?? ""}
      data-project-chat-surface-id={projectChatSurfaceId ?? ""}
    />
  ),
}));

describe("StandaloneWindowSpaceWindowSurface", () => {
  it("renders section windows with the standalone window-space surface id", () => {
    const markup = renderToStaticMarkup(
      <StandaloneWindowSpaceWindowSurface
        window={{
          instanceId: "section-window",
          surfaceKind: WindowSpaceSurfaceKindEnum.section,
          sectionIdOrNull: "section-1",
          mode: ChatWindowModeEnum.project_ai_mode,
          title: "Research Notes",
          chatId: "chat-section-1",
          embeddedGitPaneVisible: false,
          zIndex: 3,
          bounds: {
            x: 0,
            y: 0,
            width: 480,
            height: 320,
          },
        }}
        projectConfigId="project-1"
        windowSpaceId="space-1"
        onFocusWindow={() => undefined}
        onProjectChatIdChange={() => undefined}
        onEmbeddedGitPaneVisibleChange={() => undefined}
        onBlockedErrorCodeChange={() => undefined}
      />,
    );

    expect(markup).toContain('data-testid="mock-section-window-surface"');
    expect(markup).toContain('data-project-chat-id="chat-section-1"');
    expect(markup).toContain(
      'data-project-chat-surface-id="standalone-window-space:project-1:space-1:section-window"',
    );
  });

  it("renders git-graph windows inside the standalone project chat window shell", () => {
    const markup = renderToStaticMarkup(
      <StandaloneWindowSpaceWindowSurface
        window={{
          instanceId: "graph-window",
          surfaceKind: WindowSpaceSurfaceKindEnum.project_chat,
          sectionIdOrNull: null,
          mode: ChatWindowModeEnum.git_graph_mode,
          title: "Git Graph",
          chatId: null,
          embeddedGitPaneVisible: true,
          zIndex: 2,
          bounds: {
            x: 0,
            y: 0,
            width: 480,
            height: 320,
          },
        }}
        projectConfigId="project-1"
        windowSpaceId="space-1"
        onFocusWindow={() => undefined}
        onProjectChatIdChange={() => undefined}
        onEmbeddedGitPaneVisibleChange={() => undefined}
        onBlockedErrorCodeChange={() => undefined}
      />,
    );

    expect(markup).toContain('data-testid="mock-project-chat-window-surface"');
    expect(markup).toContain('data-testid="mock-git-graph-window-content"');
    expect(markup).toContain('data-instance-id="graph-window"');
    expect(markup).toContain('data-embedded-git-pane-visible="true"');
  });

  it("renders project-chat windows with the standalone floating surface id", () => {
    const markup = renderToStaticMarkup(
      <StandaloneWindowSpaceWindowSurface
        window={{
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
            width: 480,
            height: 320,
          },
        }}
        projectConfigId="project-1"
        windowSpaceId="space-1"
        onFocusWindow={() => undefined}
        onProjectChatIdChange={() => undefined}
        onEmbeddedGitPaneVisibleChange={() => undefined}
        onBlockedErrorCodeChange={() => undefined}
      />,
    );

    expect(markup).toContain('data-testid="mock-project-chat-window-surface"');
    expect(markup).toContain('data-testid="mock-unified-chat-surface"');
    expect(markup).toContain('data-project-chat-id="chat-window-1"');
    expect(markup).toContain(
      'data-project-chat-surface-id="standalone-window-space:project-1:space-1:chat-window"',
    );
  });
});
