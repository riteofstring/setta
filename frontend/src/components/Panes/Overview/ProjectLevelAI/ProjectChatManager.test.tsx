import { renderToStaticMarkup } from "react-dom/server";
import {
  ChatWindowModeEnum,
  ChatWindowPlacementEnum,
  createProjectChatWindowingState,
  createProjectChatWindowInstance,
} from "utils/generatedTypes";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectChatManager } from "./ProjectChatManager";

type MockProjectState = {
  projectChatWindowing: ReturnType<typeof createProjectChatWindowingState>;
  sections: Record<
    string,
    {
      name: string;
    }
  >;
};

let mockProjectState: MockProjectState = {
  projectChatWindowing: createProjectChatWindowingState(),
  sections: {},
};
let mockCanEditLayout = true;

vi.mock("state/definitions", () => ({
  useProjectState: (selector: (state: MockProjectState) => unknown) =>
    selector(mockProjectState),
}));

vi.mock("state/hooks/share", () => ({
  useShareCapabilities: () => ({
    canEditLayout: mockCanEditLayout,
  }),
}));

vi.mock("components/Utils/FloatingBox", () => ({
  getFloatingBoxHandlers: ({
    content,
    title,
  }: {
    content?: string;
    title?: string;
  }) => ({
    "data-tooltip-content": content ?? title ?? "",
  }),
}));

describe("ProjectChatManager", () => {
  beforeEach(() => {
    mockCanEditLayout = true;
    const renamedWindow = createProjectChatWindowInstance({
      instanceId: "project-chat-window-2",
      placement: ChatWindowPlacementEnum.floating,
      mode: ChatWindowModeEnum.project_ai_mode,
      title: "Renamed Research Chat",
      zIndex: 2,
    });
    const gitGraphWindow = createProjectChatWindowInstance({
      instanceId: "project-chat-window-3",
      placement: ChatWindowPlacementEnum.maximized,
      mode: ChatWindowModeEnum.git_graph_mode,
      title: null,
      zIndex: 5,
    });
    mockProjectState = {
      projectChatWindowing: createProjectChatWindowingState({
        order: [renamedWindow.instanceId, gitGraphWindow.instanceId],
        instancesById: {
          [renamedWindow.instanceId]: renamedWindow,
          [gitGraphWindow.instanceId]: gitGraphWindow,
        },
      }),
      sections: {},
    };
  });

  it("uses the shared authoritative window titles for renamed chats and git graph windows", () => {
    const markup = renderToStaticMarkup(<ProjectChatManager />);

    expect(markup).toContain("Renamed Research Chat");
    expect(markup).toContain("Git Graph");
    expect(markup).not.toContain("Chat Window 2");
    expect(markup).not.toContain("Chat Window 3");
  });

  it("hides layout mutators when share capabilities disallow layout edits", () => {
    mockCanEditLayout = false;

    const markup = renderToStaticMarkup(<ProjectChatManager />);

    expect(markup).not.toContain(">Canvas<");
    expect(markup).not.toContain(">Float<");
    expect(markup).not.toContain(">Hide<");
    expect(markup).toContain(">Focus<");
  });

  it("shows only Reopen for minimized windows", () => {
    const minimizedWindow = createProjectChatWindowInstance({
      instanceId: "project-chat-window-minimized",
      placement: ChatWindowPlacementEnum.bottom_docked,
      mode: ChatWindowModeEnum.project_ai_mode,
      title: "Minimized Chat",
      isMinimized: true,
      isClosed: false,
      zIndex: 7,
    });
    mockProjectState = {
      projectChatWindowing: createProjectChatWindowingState({
        order: [minimizedWindow.instanceId],
        instancesById: {
          [minimizedWindow.instanceId]: minimizedWindow,
        },
      }),
      sections: {},
    };

    const markup = renderToStaticMarkup(<ProjectChatManager />);

    expect(markup).toContain(">Reopen<");
    expect(markup).not.toContain(">Hide<");
    expect(markup).not.toContain(">Focus<");
    expect(markup).toContain('data-testid="project-chat-manager-reopen"');
  });

  it("keeps Reopen visible for hidden read-only rows", () => {
    mockCanEditLayout = false;
    const minimizedWindow = createProjectChatWindowInstance({
      instanceId: "project-chat-window-minimized",
      placement: ChatWindowPlacementEnum.floating,
      mode: ChatWindowModeEnum.project_ai_mode,
      title: "Minimized Chat",
      isMinimized: true,
      isClosed: false,
      zIndex: 7,
    });
    mockProjectState = {
      projectChatWindowing: createProjectChatWindowingState({
        order: [minimizedWindow.instanceId],
        instancesById: {
          [minimizedWindow.instanceId]: minimizedWindow,
        },
      }),
      sections: {},
    };

    const markup = renderToStaticMarkup(<ProjectChatManager />);

    expect(markup).toContain(">Reopen<");
    expect(markup).not.toContain(">Focus<");
    expect(markup).not.toContain(">Hide<");
    expect(markup).not.toContain(">Canvas<");
    expect(markup).not.toContain(">Float<");
  });

  it("adds shared quick info copy to window management actions", () => {
    const markup = renderToStaticMarkup(<ProjectChatManager />);

    expect(markup).toContain(
      'data-tooltip-content="Show Renamed Research Chat in canvas"',
    );
    expect(markup).toContain(
      'data-tooltip-content="Hide Renamed Research Chat"',
    );
    expect(markup).toContain(
      'data-tooltip-content="Focus Renamed Research Chat"',
    );
  });

  it("renders the dock-menu presentation", () => {
    const markup = renderToStaticMarkup(<ProjectChatManager />);

    expect(markup).toContain(
      "Focus, reopen, and move chat windows from the dock.",
    );
    expect(markup).toContain(
      'data-testid="project-chat-bottom-dock-menu-item"',
    );
    expect(markup).toContain('data-testid="project-chat-manager-focus"');
  });
});
