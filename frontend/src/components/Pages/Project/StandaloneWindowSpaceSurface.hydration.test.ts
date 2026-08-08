import {
  ChatWindowModeEnum,
  WindowSpaceSurfaceKindEnum,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import { applyStandaloneWindowSpaceHydration } from "./StandaloneWindowSpaceHydration";
import { createActiveStandaloneSnapResize } from "./StandaloneWindowSpaceSnapResize";

describe("StandaloneWindowSpaceSurface state helpers", () => {
  it("builds vertical snap-resize state from the snapped window bounds", () => {
    expect(
      createActiveStandaloneSnapResize({
        windowsById: {
          left: {
            instanceId: "left",
            surfaceKind: WindowSpaceSurfaceKindEnum.project_chat,
            sectionIdOrNull: null,
            mode: ChatWindowModeEnum.project_ai_mode,
            title: "Left",
            chatId: null,
            embeddedGitPaneVisible: false,
            zIndex: 1,
            bounds: {
              x: 0,
              y: 0,
              width: 400,
              height: 600,
            },
          },
          right: {
            instanceId: "right",
            surfaceKind: WindowSpaceSurfaceKindEnum.project_chat,
            sectionIdOrNull: null,
            mode: ChatWindowModeEnum.project_ai_mode,
            title: "Right",
            chatId: null,
            embeddedGitPaneVisible: false,
            zIndex: 2,
            bounds: {
              x: 400,
              y: 0,
              width: 600,
              height: 600,
            },
          },
        },
        handle: {
          axis: "vertical",
          coordinate: 400,
          start: 0,
          end: 600,
          leadingInstanceIds: ["left"],
          trailingInstanceIds: ["right"],
        },
        pointerId: 9,
        pointerX: 420,
        pointerY: 120,
      }),
    ).toEqual({
      pointerId: 9,
      axis: "vertical",
      startPointerPosition: 420,
      startCoordinate: 400,
      minCoordinate: 220,
      maxCoordinate: 780,
      leadingInstanceIds: ["left"],
      trailingInstanceIds: ["right"],
      startBoundsByInstanceId: {
        left: {
          x: 0,
          y: 0,
          width: 400,
          height: 600,
        },
        right: {
          x: 400,
          y: 0,
          width: 600,
          height: 600,
        },
      },
    });
  });

  it("returns null when a snap-resize handle references a missing window", () => {
    expect(
      createActiveStandaloneSnapResize({
        windowsById: {
          left: {
            instanceId: "left",
            surfaceKind: WindowSpaceSurfaceKindEnum.project_chat,
            sectionIdOrNull: null,
            mode: ChatWindowModeEnum.project_ai_mode,
            title: "Left",
            chatId: null,
            embeddedGitPaneVisible: false,
            zIndex: 1,
            bounds: {
              x: 0,
              y: 0,
              width: 400,
              height: 600,
            },
          },
        },
        handle: {
          axis: "horizontal",
          coordinate: 300,
          start: 0,
          end: 800,
          leadingInstanceIds: ["left"],
          trailingInstanceIds: ["missing"],
        },
        pointerId: 4,
        pointerX: 100,
        pointerY: 300,
      }),
    ).toBeNull();
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
        previousHydrationKey: "project-a:space-a",
        nextHydrationKey: "project-a:space-b",
      }),
    ).toEqual({
      nextLocalWindowsById: nextHydratedWindowsById,
      nextPreviousHydratedWindowsById: nextHydratedWindowsById,
      nextHydrationKey: "project-a:space-b",
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
      applyStandaloneWindowSpaceHydration({
        currentWindowsById,
        previousHydratedWindowsById,
        nextHydratedWindowsById,
        previousHydrationKey: "project-a:space-id",
        nextHydrationKey: "project-a:space-id",
      }).nextLocalWindowsById,
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

  it("adopts the saved chat id when the standalone window did not diverge locally", () => {
    const previousHydratedWindowsById = {
      "chat-window": {
        instanceId: "chat-window",
        surfaceKind: WindowSpaceSurfaceKindEnum.project_chat,
        sectionIdOrNull: null,
        mode: ChatWindowModeEnum.project_ai_mode,
        title: "Research Chat",
        chatId: "chat-a",
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
      },
    };
    const nextHydratedWindowsById = {
      "chat-window": {
        ...previousHydratedWindowsById["chat-window"],
        chatId: "chat-b",
      },
    };

    expect(
      applyStandaloneWindowSpaceHydration({
        currentWindowsById,
        previousHydratedWindowsById,
        nextHydratedWindowsById,
        previousHydrationKey: "project-a:space-id",
        nextHydrationKey: "project-a:space-id",
      }).nextLocalWindowsById,
    ).toEqual({
      "chat-window": {
        ...nextHydratedWindowsById["chat-window"],
      },
    });
  });

  it("adopts saved git-pane visibility when the standalone window did not diverge locally", () => {
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
      },
    };
    const nextHydratedWindowsById = {
      "graph-window": {
        ...previousHydratedWindowsById["graph-window"],
        embeddedGitPaneVisible: true,
      },
    };

    expect(
      applyStandaloneWindowSpaceHydration({
        currentWindowsById,
        previousHydratedWindowsById,
        nextHydratedWindowsById,
        previousHydrationKey: "project-a:space-id",
        nextHydrationKey: "project-a:space-id",
      }).nextLocalWindowsById,
    ).toEqual({
      "graph-window": {
        ...nextHydratedWindowsById["graph-window"],
      },
    });
  });

  it("adopts the saved z-index when the standalone window did not diverge locally", () => {
    const previousHydratedWindowsById = {
      "chat-window": {
        instanceId: "chat-window",
        surfaceKind: WindowSpaceSurfaceKindEnum.project_chat,
        sectionIdOrNull: null,
        mode: ChatWindowModeEnum.project_ai_mode,
        title: "Research Chat",
        chatId: "chat-a",
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
      },
    };
    const nextHydratedWindowsById = {
      "chat-window": {
        ...previousHydratedWindowsById["chat-window"],
        zIndex: 7,
      },
    };

    expect(
      applyStandaloneWindowSpaceHydration({
        currentWindowsById,
        previousHydratedWindowsById,
        nextHydratedWindowsById,
        previousHydrationKey: "project-a:space-id",
        nextHydrationKey: "project-a:space-id",
      }).nextLocalWindowsById,
    ).toEqual({
      "chat-window": {
        ...nextHydratedWindowsById["chat-window"],
      },
    });
  });

  it("preserves a locally diverged z-index during same-layout hydration", () => {
    const previousHydratedWindowsById = {
      "chat-window": {
        instanceId: "chat-window",
        surfaceKind: WindowSpaceSurfaceKindEnum.project_chat,
        sectionIdOrNull: null,
        mode: ChatWindowModeEnum.project_ai_mode,
        title: "Research Chat",
        chatId: "chat-a",
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
        zIndex: 9,
      },
    };
    const nextHydratedWindowsById = {
      "chat-window": {
        ...previousHydratedWindowsById["chat-window"],
        zIndex: 3,
      },
    };

    expect(
      applyStandaloneWindowSpaceHydration({
        currentWindowsById,
        previousHydratedWindowsById,
        nextHydratedWindowsById,
        previousHydrationKey: "project-a:space-id",
        nextHydrationKey: "project-a:space-id",
      }).nextLocalWindowsById,
    ).toEqual({
      "chat-window": {
        ...nextHydratedWindowsById["chat-window"],
        zIndex: 9,
      },
    });
  });

  it("resets owner-local chat and git state when the same window id is rebound", () => {
    const previousHydratedWindowsById = {
      win: {
        instanceId: "win",
        surfaceKind: WindowSpaceSurfaceKindEnum.project_chat,
        sectionIdOrNull: null,
        mode: ChatWindowModeEnum.project_ai_mode,
        title: "Workspace Chat",
        chatId: "saved-project-chat",
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
      win: {
        ...previousHydratedWindowsById.win,
        chatId: "chat-local-override",
        embeddedGitPaneVisible: true,
        zIndex: 7,
      },
    };
    const nextHydratedWindowsById = {
      win: {
        instanceId: "win",
        surfaceKind: WindowSpaceSurfaceKindEnum.section,
        sectionIdOrNull: "section-1",
        mode: ChatWindowModeEnum.section_mode,
        title: "Research Notes",
        chatId: null,
        embeddedGitPaneVisible: false,
        zIndex: 2,
        bounds: {
          x: 40,
          y: 24,
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
        previousHydrationKey: "project-a:space-id",
        nextHydrationKey: "project-a:space-id",
      }).nextLocalWindowsById,
    ).toEqual(nextHydratedWindowsById);
  });

  it("preserves local chat and git state when the same saved window space rehydrates", () => {
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
        embeddedGitPaneVisible: true,
        zIndex: 7,
      },
    };
    const nextHydratedWindowsById = {
      "chat-window": {
        ...previousHydratedWindowsById["chat-window"],
        title: "Renamed Chat",
        embeddedGitPaneVisible: false,
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
        previousHydrationKey: "project-a:space-id",
        nextHydrationKey: "project-a:space-id",
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
          embeddedGitPaneVisible: true,
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
      nextHydrationKey: "project-a:space-id",
      resetLocalState: false,
    });
  });

  it("resets standalone local state when the owning project config changes", () => {
    const previousHydratedWindowsById = {
      "chat-window": {
        instanceId: "chat-window",
        surfaceKind: WindowSpaceSurfaceKindEnum.project_chat,
        sectionIdOrNull: null,
        mode: ChatWindowModeEnum.project_ai_mode,
        title: "Research Chat",
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
      "chat-window": {
        ...previousHydratedWindowsById["chat-window"],
        chatId: "chat-local-override",
        embeddedGitPaneVisible: true,
        bounds: {
          x: 24,
          y: 40,
          width: 780,
          height: 420,
        },
      },
    };
    const nextHydratedWindowsById = {
      "chat-window": {
        ...previousHydratedWindowsById["chat-window"],
        chatId: "copied-config-chat",
        bounds: {
          x: 8,
          y: 16,
          width: 640,
          height: 360,
        },
      },
    };

    expect(
      applyStandaloneWindowSpaceHydration({
        currentWindowsById,
        previousHydratedWindowsById,
        nextHydratedWindowsById,
        previousHydrationKey: "project-a:space-id",
        nextHydrationKey: "project-b:space-id",
      }),
    ).toEqual({
      nextLocalWindowsById: nextHydratedWindowsById,
      nextPreviousHydratedWindowsById: nextHydratedWindowsById,
      nextHydrationKey: "project-b:space-id",
      resetLocalState: true,
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
        previousHydrationKey: "project-a:space-id",
        nextHydrationKey: "project-a:space-id-2",
      }),
    ).toEqual({
      nextLocalWindowsById: nextHydratedWindowsById,
      nextPreviousHydratedWindowsById: nextHydratedWindowsById,
      nextHydrationKey: "project-a:space-id-2",
      resetLocalState: true,
    });
  });
});
