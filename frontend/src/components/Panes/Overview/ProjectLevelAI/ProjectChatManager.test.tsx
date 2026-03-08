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

vi.mock("state/definitions", () => ({
  useProjectState: (selector: (state: MockProjectState) => unknown) =>
    selector(mockProjectState),
}));

describe("ProjectChatManager", () => {
  beforeEach(() => {
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
});
