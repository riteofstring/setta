import { describe, expect, it } from "vitest";

import {
  ChatWindowModeEnum,
  WindowSpaceSurfaceKindEnum,
  createWindowSpaceConfig,
} from "utils/generatedTypes";
import {
  focusStandaloneWindow,
  hydrateWindowSpaceWindows,
  setStandaloneEmbeddedGitPaneVisibility,
  setStandaloneProjectChatWindowChatId,
  type StandaloneWindowSpaceWindowMap,
} from "./standaloneWindowSpaceWindowModel";

function createStandaloneWindowMap(): StandaloneWindowSpaceWindowMap {
  return {
    "project-chat": {
      instanceId: "project-chat",
      surfaceKind: WindowSpaceSurfaceKindEnum.project_chat,
      sectionIdOrNull: null,
      mode: ChatWindowModeEnum.project_ai_mode,
      title: "Project Chat",
      chatId: "chat-a",
      embeddedGitPaneVisible: false,
      zIndex: 1,
      bounds: {
        x: 0,
        y: 0,
        width: 640,
        height: 420,
      },
    },
    "git-graph": {
      instanceId: "git-graph",
      surfaceKind: WindowSpaceSurfaceKindEnum.project_chat,
      sectionIdOrNull: null,
      mode: ChatWindowModeEnum.git_graph_mode,
      title: "Git Graph",
      chatId: null,
      embeddedGitPaneVisible: false,
      zIndex: 3,
      bounds: {
        x: 640,
        y: 0,
        width: 640,
        height: 420,
      },
    },
  };
}

describe("standaloneWindowSpaceWindowModel", () => {
  it("promotes a focused window above the current z-index winner", () => {
    // The local standalone surface should keep focus order independent from saved hydration order.
    expect(
      focusStandaloneWindow(createStandaloneWindowMap(), "project-chat"),
    ).toMatchObject({
      "project-chat": {
        zIndex: 4,
      },
      "git-graph": {
        zIndex: 3,
      },
    });
  });

  it("normalizes overridden project-chat ids but leaves non-chat windows unchanged", () => {
    // Only standalone project-chat windows own a mutable chat thread override.
    const windowsById = createStandaloneWindowMap();
    expect(
      setStandaloneProjectChatWindowChatId(
        windowsById,
        "project-chat",
        "  chat-b  ",
      ),
    ).toMatchObject({
      "project-chat": {
        chatId: "chat-b",
      },
    });
    expect(
      setStandaloneProjectChatWindowChatId(windowsById, "git-graph", "chat-c"),
    ).toBe(windowsById);
  });

  it("toggles the embedded git-pane flag only for the targeted git window", () => {
    // Git-pane visibility is local standalone state and should not spill into other windows.
    expect(
      setStandaloneEmbeddedGitPaneVisibility(
        createStandaloneWindowMap(),
        "git-graph",
        true,
      ),
    ).toMatchObject({
      "git-graph": {
        embeddedGitPaneVisible: true,
      },
      "project-chat": {
        embeddedGitPaneVisible: false,
      },
    });
  });

  it("keeps only the highest-priority saved section binding during hydration", () => {
    // Standalone hydration should dedupe repeated section owners before the page surface renders.
    const hydrated = hydrateWindowSpaceWindows(
      createWindowSpaceConfig({
        id: "space-id",
        name: "Research Board",
        windowsById: {
          "section-low": {
            surfaceKind: WindowSpaceSurfaceKindEnum.section,
            sectionIdOrNull: "section-1",
            mode: ChatWindowModeEnum.section_mode,
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
          "section-high": {
            surfaceKind: WindowSpaceSurfaceKindEnum.section,
            sectionIdOrNull: "section-1",
            mode: ChatWindowModeEnum.project_ai_mode,
            title: null,
            chatId: "saved-chat",
            zIndex: 5,
            normalizedBounds: {
              x: 0.5,
              y: 0,
              width: 0.5,
              height: 1,
            },
          },
        },
        order: ["section-low", "section-high"],
      }),
      1280,
      720,
      { "section-1": "Research Notes" },
    );

    expect(Object.keys(hydrated)).toEqual(["section-high"]);
    expect(hydrated["section-high"]).toMatchObject({
      sectionIdOrNull: "section-1",
      mode: ChatWindowModeEnum.project_ai_mode,
      chatId: "saved-chat",
    });
  });
});
