import {
  buildFloatingSnapBounds,
  buildFloatingSnapResizeHandles,
  resolveFloatingSnapPresetFromBounds,
} from "components/ChatWindowing/projectChatSnapLayout";
import { useMisc, useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  ChatWindowModeEnum,
  ChatWindowPlacementEnum,
  SettaNotificationTypeEnum,
  createCore,
  createProjectChatWindowingState,
  createProjectConfig,
} from "utils/generatedTypes";
import { beforeEach, describe, expect, it, vi } from "vitest";

const routeCreateWindowSpaceMock = vi.fn();
const routeSetWindowSpaceSortOrderMock = vi.fn();
const routeSetProjectChatWindowingStateMock = vi.fn();
const addTemporaryNotificationMock = vi.fn();

vi.mock("utils/generatedEndpoints", () => ({
  route_create_window_space: (...args: unknown[]) =>
    routeCreateWindowSpaceMock(...args),
  route_set_window_space_sort_order: (...args: unknown[]) =>
    routeSetWindowSpaceSortOrderMock(...args),
  route_set_project_chat_windowing_state: (...args: unknown[]) =>
    routeSetProjectChatWindowingStateMock(...args),
  route_set_section_name: vi.fn(),
}));

vi.mock("state/actions/notifications", () => ({
  addTemporaryNotification: (...args: unknown[]) =>
    addTemporaryNotificationMock(...args),
}));

import { replaceProjectChatWindowingState } from "./projectChatWindowing";
import {
  applyWindowSpaceSortOrder,
  createProjectChatWindowingStateFromWindowSpace,
  createWindowSpaceFromCurrentFloatingWindows,
  restoreWindowSpaceInWorkspace,
  snapshotFloatingWindowsForWindowSpace,
} from "./windowSpaces";

describe("snapshotFloatingWindowsForWindowSpace", () => {
  beforeEach(() => {
    resetProjectStores();
    routeCreateWindowSpaceMock.mockReset();
    routeSetWindowSpaceSortOrderMock.mockReset();
    routeSetProjectChatWindowingStateMock.mockReset();
    addTemporaryNotificationMock.mockReset();
    routeSetProjectChatWindowingStateMock.mockResolvedValue({
      data: null,
      status: 200,
      hasResponse: true,
    });
  });

  it("serializes only visible floating windows with normalized bounds", () => {
    const state = {
      projectChatWindowing: createProjectChatWindowingState({
        order: [
          "floating-chat",
          "floating-section",
          "docked-chat",
          "minimized-chat",
        ],
        instancesById: {
          "floating-chat": {
            instanceId: "floating-chat",
            placement: ChatWindowPlacementEnum.floating,
            mode: ChatWindowModeEnum.project_ai_mode,
            title: "Research Chat",
            isClosed: false,
            isMinimized: false,
            isMaximized: false,
            zIndex: 2,
            bounds: {
              x: 100,
              y: 50,
              width: 400,
              height: 300,
            },
          },
          "floating-section": {
            instanceId: "floating-section",
            placement: ChatWindowPlacementEnum.floating,
            mode: ChatWindowModeEnum.section_mode,
            sectionIdOrNull: "section-1",
            isClosed: false,
            isMinimized: false,
            isMaximized: false,
            zIndex: 5,
            bounds: {
              x: 500,
              y: 200,
              width: 300,
              height: 400,
            },
          },
          "docked-chat": {
            instanceId: "docked-chat",
            placement: ChatWindowPlacementEnum.bottom_docked,
            mode: ChatWindowModeEnum.project_ai_mode,
            isClosed: false,
            isMinimized: false,
            isMaximized: false,
            zIndex: 1,
            bounds: {
              x: 0,
              y: 0,
              width: 300,
              height: 200,
            },
          },
          "minimized-chat": {
            instanceId: "minimized-chat",
            placement: ChatWindowPlacementEnum.floating,
            mode: ChatWindowModeEnum.project_ai_mode,
            isClosed: false,
            isMinimized: true,
            isMaximized: false,
            zIndex: 3,
            bounds: {
              x: 0,
              y: 0,
              width: 300,
              height: 200,
            },
          },
        },
      }),
      sections: {
        "section-1": createCore({
          id: "section-1",
          name: "Research Notes",
        }),
      },
      projectConfig: createProjectConfig({
        id: "project-id",
        name: "demo",
      }),
    };

    const snapshot = snapshotFloatingWindowsForWindowSpace(state, {
      viewportWidthPx: 1000,
      viewportHeightPx: 800,
      insets: {
        left: 100,
        right: 100,
        top: 50,
        bottom: 50,
      },
    });

    expect(snapshot.order).toEqual(["floating-chat", "floating-section"]);
    expect(snapshot.windowsById["floating-chat"]).toMatchObject({
      surfaceKind: "project_chat",
      title: "Research Chat",
      zIndex: 2,
      normalizedBounds: {
        x: 0,
        y: 0,
        width: 0.5,
        height: 300 / 700,
      },
    });
    expect(snapshot.windowsById["floating-section"]).toMatchObject({
      surfaceKind: "section",
      sectionIdOrNull: "section-1",
      zIndex: 5,
      normalizedBounds: {
        x: 0.5,
        y: 150 / 700,
        width: 0.375,
        height: 400 / 700,
      },
    });
    expect(snapshot.windowsById["docked-chat"]).toBeUndefined();
    expect(snapshot.windowsById["minimized-chat"]).toBeUndefined();
  });

  it("collapses duplicate floating section bindings to one authoritative saved window", () => {
    const snapshot = snapshotFloatingWindowsForWindowSpace({
      projectChatWindowing: createProjectChatWindowingState({
        order: ["floating-section-a", "floating-section-b"],
        instancesById: {
          "floating-section-a": {
            instanceId: "floating-section-a",
            placement: ChatWindowPlacementEnum.floating,
            mode: ChatWindowModeEnum.section_mode,
            sectionIdOrNull: "section-1",
            isClosed: false,
            isMinimized: false,
            isMaximized: false,
            zIndex: 1,
            bounds: {
              x: 40,
              y: 50,
              width: 320,
              height: 240,
            },
            lastFocusedAt: 1,
          },
          "floating-section-b": {
            instanceId: "floating-section-b",
            placement: ChatWindowPlacementEnum.floating,
            mode: ChatWindowModeEnum.project_ai_mode,
            sectionIdOrNull: "section-1",
            isClosed: false,
            isMinimized: false,
            isMaximized: false,
            zIndex: 4,
            bounds: {
              x: 380,
              y: 60,
              width: 320,
              height: 240,
            },
            lastFocusedAt: 2,
          },
        },
      }),
      sections: {
        "section-1": createCore({
          id: "section-1",
          name: "Research Notes",
        }),
      },
      projectConfig: createProjectConfig({
        id: "project-id",
        name: "demo",
      }),
    });

    expect(snapshot.order).toEqual(["floating-section-b"]);
    expect(Object.keys(snapshot.windowsById)).toEqual(["floating-section-b"]);
    expect(snapshot.windowsById["floating-section-b"]?.mode).toBe(
      ChatWindowModeEnum.project_ai_mode,
    );
  });

  it("round-trips snapped layouts back onto the shared resize grid", () => {
    const viewport = {
      viewportWidthPx: 1440,
      viewportHeightPx: 900,
      insets: {
        left: 40,
        right: 40,
        top: 52,
        bottom: 0,
      },
    };
    const state = {
      projectChatWindowing: createProjectChatWindowingState({
        order: ["floating-left", "floating-right"],
        instancesById: {
          "floating-left": {
            instanceId: "floating-left",
            placement: ChatWindowPlacementEnum.floating,
            mode: ChatWindowModeEnum.project_ai_mode,
            isClosed: false,
            isMinimized: false,
            isMaximized: false,
            zIndex: 2,
            bounds: buildFloatingSnapBounds(
              "left",
              viewport.viewportWidthPx,
              viewport.viewportHeightPx,
              viewport.insets,
            ),
          },
          "floating-right": {
            instanceId: "floating-right",
            placement: ChatWindowPlacementEnum.floating,
            mode: ChatWindowModeEnum.section_mode,
            sectionIdOrNull: "section-1",
            isClosed: false,
            isMinimized: false,
            isMaximized: false,
            zIndex: 5,
            bounds: buildFloatingSnapBounds(
              "right",
              viewport.viewportWidthPx,
              viewport.viewportHeightPx,
              viewport.insets,
            ),
          },
        },
      }),
      sections: {
        "section-1": createCore({
          id: "section-1",
          name: "Research Notes",
        }),
      },
      projectConfig: createProjectConfig({
        id: "project-id",
        name: "demo",
      }),
    };

    const snapshot = snapshotFloatingWindowsForWindowSpace(state, viewport);
    const restored = createProjectChatWindowingStateFromWindowSpace(
      {
        id: "space-1",
        name: "Snapped Layout",
        sortIndex: 0,
        windowsById: snapshot.windowsById,
        order: snapshot.order,
      },
      {
        sections: state.sections,
      },
      viewport,
    );

    expect(restored.order).toEqual(["floating-left", "floating-right"]);
    expect(
      resolveFloatingSnapPresetFromBounds(
        restored.instancesById["floating-left"].bounds,
        viewport.viewportWidthPx,
        viewport.viewportHeightPx,
        viewport.insets,
      ),
    ).toBe("left");
    expect(
      resolveFloatingSnapPresetFromBounds(
        restored.instancesById["floating-right"].bounds,
        viewport.viewportWidthPx,
        viewport.viewportHeightPx,
        viewport.insets,
      ),
    ).toBe("right");
    expect(
      buildFloatingSnapResizeHandles(
        restored.order.map((instanceId) => ({
          instanceId,
          bounds: restored.instancesById[instanceId].bounds,
          snapPreset: resolveFloatingSnapPresetFromBounds(
            restored.instancesById[instanceId].bounds,
            viewport.viewportWidthPx,
            viewport.viewportHeightPx,
            viewport.insets,
          )!,
        })),
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          axis: "vertical",
          leadingInstanceIds: ["floating-left"],
          trailingInstanceIds: ["floating-right"],
        }),
      ]),
    );
  });
});

describe("applyWindowSpaceSortOrder", () => {
  beforeEach(() => {
    resetProjectStores();
    routeCreateWindowSpaceMock.mockReset();
    routeSetWindowSpaceSortOrderMock.mockReset();
    routeSetProjectChatWindowingStateMock.mockReset();
    addTemporaryNotificationMock.mockReset();
    routeSetProjectChatWindowingStateMock.mockResolvedValue({
      data: null,
      status: 200,
      hasResponse: true,
    });
  });

  it("applies a complete ordered list of window space ids", () => {
    const state = {
      projectConfig: createProjectConfig({
        id: "project-id",
        name: "demo",
        windowSpaces: {
          "alpha-id": {
            id: "alpha-id",
            name: "Alpha",
            sortIndex: 0,
            windowsById: {},
            order: [],
          },
          "beta-id": {
            id: "beta-id",
            name: "Beta",
            sortIndex: 1,
            windowsById: {},
            order: [],
          },
          "gamma-id": {
            id: "gamma-id",
            name: "Gamma",
            sortIndex: 2,
            windowsById: {},
            order: [],
          },
        },
      }),
    };

    applyWindowSpaceSortOrder(state, ["gamma-id", "alpha-id", "beta-id"]);

    expect(state.projectConfig.windowSpaces["gamma-id"].sortIndex).toBe(0);
    expect(state.projectConfig.windowSpaces["alpha-id"].sortIndex).toBe(1);
    expect(state.projectConfig.windowSpaces["beta-id"].sortIndex).toBe(2);
  });

  it("throws when the ordered list is incomplete", () => {
    const state = {
      projectConfig: createProjectConfig({
        id: "project-id",
        name: "demo",
        windowSpaces: {
          "alpha-id": {
            id: "alpha-id",
            name: "Alpha",
            sortIndex: 0,
            windowsById: {},
            order: [],
          },
          "beta-id": {
            id: "beta-id",
            name: "Beta",
            sortIndex: 1,
            windowsById: {},
            order: [],
          },
        },
      }),
    };

    expect(() => applyWindowSpaceSortOrder(state, ["alpha-id"])).toThrow(
      "orderedWindowSpaceIds must include every window space exactly once.",
    );
  });
});

describe("createWindowSpaceFromCurrentFloatingWindows", () => {
  beforeEach(() => {
    resetProjectStores();
    routeCreateWindowSpaceMock.mockReset();
    routeSetWindowSpaceSortOrderMock.mockReset();
    routeSetProjectChatWindowingStateMock.mockReset();
    addTemporaryNotificationMock.mockReset();
    routeSetProjectChatWindowingStateMock.mockResolvedValue({
      data: null,
      status: 200,
      hasResponse: true,
    });
  });

  it("waits for in-flight project chat windowing writes before saving the current layout", async () => {
    let resolveWindowingWrite:
      | ((value: { status: number; hasResponse: boolean; data: null }) => void)
      | null = null;
    const pendingWindowingWrite = new Promise<{
      status: number;
      hasResponse: boolean;
      data: null;
    }>((resolve) => {
      resolveWindowingWrite = resolve;
    });
    routeSetProjectChatWindowingStateMock.mockReturnValue(
      pendingWindowingWrite,
    );
    routeCreateWindowSpaceMock.mockResolvedValue({
      data: "window-space-1",
      status: 200,
      hasResponse: true,
    });
    useProjectState.setState({
      projectConfig: createProjectConfig({
        id: "project-id",
        name: "demo",
      }),
      sections: {},
      projectChatWindowing: createProjectChatWindowingState(),
    });

    replaceProjectChatWindowingState(
      createProjectChatWindowingState({
        order: ["project-chat-window-1"],
        instancesById: {
          "project-chat-window-1": {
            instanceId: "project-chat-window-1",
            placement: ChatWindowPlacementEnum.floating,
            mode: ChatWindowModeEnum.project_ai_mode,
            title: "Research Chat",
            bounds: {
              x: 100,
              y: 120,
              width: 420,
              height: 320,
            },
          },
        },
      }),
    );

    const savePromise = createWindowSpaceFromCurrentFloatingWindows();
    await Promise.resolve();
    await Promise.resolve();

    expect(routeCreateWindowSpaceMock).not.toHaveBeenCalled();

    resolveWindowingWrite?.({
      data: null,
      status: 200,
      hasResponse: true,
    });

    await expect(savePromise).resolves.toBe("window-space-1");
    expect(routeCreateWindowSpaceMock).toHaveBeenCalledTimes(1);
  });

  it("persists the created window space into local project state after the backend accepts it", async () => {
    useProjectState.setState({
      projectConfig: createProjectConfig({
        id: "project-id",
        name: "demo",
      }),
      sections: {
        "section-1": createCore({
          id: "section-1",
          name: "Research Notes",
        }),
      },
      projectChatWindowing: createProjectChatWindowingState({
        order: ["floating-section"],
        instancesById: {
          "floating-section": {
            instanceId: "floating-section",
            placement: ChatWindowPlacementEnum.floating,
            mode: ChatWindowModeEnum.section_mode,
            sectionIdOrNull: "section-1",
            isClosed: false,
            isMinimized: false,
            isMaximized: false,
            zIndex: 3,
            bounds: {
              x: 120,
              y: 80,
              width: 500,
              height: 360,
            },
          },
        },
      }),
    });
    routeCreateWindowSpaceMock.mockResolvedValue({
      data: "window-space-1",
      status: 200,
      hasResponse: true,
    });

    const createdWindowSpaceId =
      await createWindowSpaceFromCurrentFloatingWindows();

    expect(createdWindowSpaceId).toBe("window-space-1");
    expect(routeSetProjectChatWindowingStateMock).toHaveBeenCalledTimes(1);
    expect(routeCreateWindowSpaceMock).toHaveBeenCalledTimes(1);
    const createRequest = routeCreateWindowSpaceMock.mock.calls[0]?.[0];
    expect(createRequest?.projectConfigId).toBe("project-id");
    expect(createRequest?.name).toEqual(expect.any(String));
    expect(createRequest?.state.order).toEqual(["floating-section"]);
    expect(
      useProjectState.getState().projectConfig.windowSpaces["window-space-1"],
    ).toMatchObject({
      id: "window-space-1",
      name: createRequest?.name,
      order: ["floating-section"],
    });
  });

  it("shows an error notification when the backend rejects the save", async () => {
    useProjectState.setState({
      projectConfig: createProjectConfig({
        id: "project-id",
        name: "demo",
      }),
      sections: {
        "section-1": createCore({
          id: "section-1",
          name: "Research Notes",
        }),
      },
      projectChatWindowing: createProjectChatWindowingState({
        order: ["floating-section"],
        instancesById: {
          "floating-section": {
            instanceId: "floating-section",
            placement: ChatWindowPlacementEnum.floating,
            mode: ChatWindowModeEnum.section_mode,
            sectionIdOrNull: "section-1",
            isClosed: false,
            isMinimized: false,
            isMaximized: false,
            zIndex: 3,
            bounds: {
              x: 120,
              y: 80,
              width: 500,
              height: 360,
            },
          },
        },
      }),
    });
    routeCreateWindowSpaceMock.mockResolvedValue({
      data: { detail: "Not Found" },
      status: 404,
      hasResponse: true,
    });

    const createdWindowSpaceId =
      await createWindowSpaceFromCurrentFloatingWindows();

    expect(createdWindowSpaceId).toBeNull();
    expect(addTemporaryNotificationMock).toHaveBeenCalledWith(
      "Failed to save window space (404): Not Found",
      SettaNotificationTypeEnum.error,
    );
    expect(useProjectState.getState().projectConfig.windowSpaces).toEqual({});
  });

  it("uses the post-sync authoritative layout when saving a window space", async () => {
    useProjectState.setState({
      projectConfig: createProjectConfig({
        id: "project-id",
        name: "demo",
      }),
      sections: {},
      projectChatWindowing: createProjectChatWindowingState({
        order: ["floating-before-sync"],
        instancesById: {
          "floating-before-sync": {
            instanceId: "floating-before-sync",
            placement: ChatWindowPlacementEnum.floating,
            mode: ChatWindowModeEnum.project_ai_mode,
            title: "Before Sync",
            bounds: {
              x: 120,
              y: 80,
              width: 500,
              height: 360,
            },
          },
        },
      }),
    });
    routeSetProjectChatWindowingStateMock.mockImplementation(async () => {
      useProjectState.setState({
        projectConfig: createProjectConfig({
          id: "project-id",
          name: "demo",
        }),
        sections: {},
        projectChatWindowing: createProjectChatWindowingState({
          order: ["floating-after-sync"],
          instancesById: {
            "floating-after-sync": {
              instanceId: "floating-after-sync",
              placement: ChatWindowPlacementEnum.floating,
              mode: ChatWindowModeEnum.project_ai_mode,
              title: "After Sync",
              bounds: {
                x: 40,
                y: 60,
                width: 420,
                height: 320,
              },
            },
          },
        }),
      });
      return {
        data: null,
        status: 200,
        hasResponse: true,
      };
    });
    routeCreateWindowSpaceMock.mockResolvedValue({
      data: "window-space-1",
      status: 200,
      hasResponse: true,
    });

    await expect(createWindowSpaceFromCurrentFloatingWindows()).resolves.toBe(
      "window-space-1",
    );

    const createRequest = routeCreateWindowSpaceMock.mock.calls[0]?.[0];
    expect(createRequest?.state.order).toEqual(["floating-after-sync"]);
    expect(
      useProjectState.getState().projectConfig.windowSpaces["window-space-1"]
        ?.order,
    ).toEqual(["floating-after-sync"]);
  });

  it("shows an error notification when syncing the workspace layout fails before saving", async () => {
    routeSetProjectChatWindowingStateMock.mockResolvedValue({
      data: { detail: "Not Found" },
      status: 404,
      hasResponse: true,
    });
    useProjectState.setState({
      projectConfig: createProjectConfig({
        id: "project-id",
        name: "demo",
      }),
      sections: {},
      projectChatWindowing: createProjectChatWindowingState({
        order: ["floating-chat"],
        instancesById: {
          "floating-chat": {
            instanceId: "floating-chat",
            placement: ChatWindowPlacementEnum.floating,
            mode: ChatWindowModeEnum.project_ai_mode,
            title: "Research Chat",
            bounds: {
              x: 120,
              y: 80,
              width: 500,
              height: 360,
            },
          },
        },
      }),
    });

    const createdWindowSpaceId =
      await createWindowSpaceFromCurrentFloatingWindows();

    expect(createdWindowSpaceId).toBeNull();
    expect(routeCreateWindowSpaceMock).not.toHaveBeenCalled();
    expect(addTemporaryNotificationMock).toHaveBeenCalledWith(
      "Failed to sync window layout before saving (404): Not Found",
      SettaNotificationTypeEnum.error,
    );
  });
});

describe("restoreWindowSpaceInWorkspace", () => {
  beforeEach(() => {
    resetProjectStores();
    routeCreateWindowSpaceMock.mockReset();
    routeSetWindowSpaceSortOrderMock.mockReset();
    routeSetProjectChatWindowingStateMock.mockReset();
    addTemporaryNotificationMock.mockReset();
  });

  it("rehydrates saved window-space windows as floating workspace windows", () => {
    const nextWindowing = createProjectChatWindowingStateFromWindowSpace(
      {
        id: "space-1",
        name: "Focused Layout",
        sortIndex: 0,
        windowsById: {
          "project-chat-window-4": {
            surfaceKind: "project_chat",
            mode: ChatWindowModeEnum.project_ai_mode,
            title: "Research Chat",
            zIndex: 2,
            normalizedBounds: {
              x: 0.1,
              y: 0.2,
              width: 0.5,
              height: 0.4,
            },
          },
          "project-chat-window-8": {
            surfaceKind: "section",
            sectionIdOrNull: "section-1",
            mode: ChatWindowModeEnum.section_mode,
            zIndex: 5,
            normalizedBounds: {
              x: 0.6,
              y: 0.2,
              width: 0.3,
              height: 0.5,
            },
          },
          "stale-section-window": {
            surfaceKind: "section",
            sectionIdOrNull: "missing-section",
            mode: ChatWindowModeEnum.section_mode,
            zIndex: 7,
            normalizedBounds: {
              x: 0,
              y: 0,
              width: 0.25,
              height: 0.25,
            },
          },
        },
        order: [
          "project-chat-window-4",
          "project-chat-window-8",
          "stale-section-window",
        ],
      },
      {
        sections: {
          "section-1": createCore({
            id: "section-1",
            name: "Research Notes",
          }),
        },
      },
      {
        viewportWidthPx: 1000,
        viewportHeightPx: 800,
        insets: {
          left: 100,
          right: 100,
          top: 50,
          bottom: 50,
        },
      },
    );

    expect(nextWindowing.order).toEqual([
      "project-chat-window-4",
      "project-chat-window-8",
    ]);
    expect(nextWindowing.instancesById["project-chat-window-4"]).toMatchObject({
      placement: ChatWindowPlacementEnum.floating,
      title: "Research Chat",
      zIndex: 2,
      bounds: {
        x: 180,
        y: 190,
        width: 400,
        height: 280,
      },
    });
    expect(nextWindowing.instancesById["project-chat-window-8"]).toMatchObject({
      placement: ChatWindowPlacementEnum.floating,
      sectionIdOrNull: "section-1",
      zIndex: 5,
      bounds: {
        x: 580,
        y: 190,
        width: 240,
        height: 350,
      },
    });
    expect(nextWindowing.instancesById["stale-section-window"]).toBeUndefined();
    expect(nextWindowing.nextInstanceNumber).toBe(9);
  });

  it("restores the saved floating layout while preserving non-floating windows", () => {
    useProjectState.setState({
      projectConfig: createProjectConfig({
        id: "project-id",
        name: "demo",
        windowSpaces: {
          "space-1": {
            id: "space-1",
            name: "Focused Layout",
            sortIndex: 0,
            windowsById: {
              "project-chat-window-2": {
                surfaceKind: "project_chat",
                mode: ChatWindowModeEnum.project_ai_mode,
                title: "Research Chat",
                zIndex: 3,
                normalizedBounds: {
                  x: 0.1,
                  y: 0.15,
                  width: 0.45,
                  height: 0.5,
                },
              },
            },
            order: ["project-chat-window-2"],
          },
        },
      }),
      sections: {},
      projectChatWindowing: createProjectChatWindowingState({
        order: ["project-chat-window-99", "project-chat-window-88"],
        instancesById: {
          "project-chat-window-99": {
            instanceId: "project-chat-window-99",
            placement: ChatWindowPlacementEnum.bottom_docked,
            title: "Old Window",
          },
          "project-chat-window-88": {
            instanceId: "project-chat-window-88",
            placement: ChatWindowPlacementEnum.floating,
            title: "Transient Window",
          },
        },
      }),
    });
    routeSetProjectChatWindowingStateMock.mockResolvedValue({
      data: null,
      status: 200,
      hasResponse: true,
    });

    restoreWindowSpaceInWorkspace("space-1");

    expect(useProjectState.getState().projectChatWindowing.order).toEqual([
      "project-chat-window-99",
      "project-chat-window-2",
    ]);
    expect(
      useProjectState.getState().projectChatWindowing.instancesById[
        "project-chat-window-99"
      ],
    ).toMatchObject({
      placement: ChatWindowPlacementEnum.bottom_docked,
      title: "Old Window",
    });
    expect(
      useProjectState.getState().projectChatWindowing.instancesById[
        "project-chat-window-2"
      ],
    ).toMatchObject({
      placement: ChatWindowPlacementEnum.floating,
      title: "Research Chat",
      zIndex: 3,
    });
    expect(
      useProjectState.getState().projectChatWindowing.instancesById[
        "project-chat-window-88"
      ],
    ).toBeUndefined();
    expect(routeSetProjectChatWindowingStateMock).toHaveBeenCalledTimes(1);
  });

  it("remaps restored window ids when a saved floating window collides with an existing non-floating workspace window", () => {
    useProjectState.setState({
      projectConfig: createProjectConfig({
        id: "project-id",
        name: "demo",
        windowSpaces: {
          "space-1": {
            id: "space-1",
            name: "Focused Layout",
            sortIndex: 0,
            windowsById: {
              "project-chat-window-2": {
                surfaceKind: "project_chat",
                mode: ChatWindowModeEnum.project_ai_mode,
                title: "Restored Chat",
                chatId: "chat-restored",
                zIndex: 3,
                normalizedBounds: {
                  x: 0.1,
                  y: 0.15,
                  width: 0.45,
                  height: 0.5,
                },
              },
            },
            order: ["project-chat-window-2"],
          },
        },
      }),
      sections: {},
      projectChatWindowing: createProjectChatWindowingState({
        order: ["project-chat-window-2"],
        instancesById: {
          "project-chat-window-2": {
            instanceId: "project-chat-window-2",
            placement: ChatWindowPlacementEnum.bottom_docked,
            title: "Docked Chat",
            chatId: "chat-live",
          },
        },
        nextInstanceNumber: 3,
      }),
    });
    routeSetProjectChatWindowingStateMock.mockResolvedValue({
      data: null,
      status: 200,
      hasResponse: true,
    });

    restoreWindowSpaceInWorkspace("space-1");

    const nextState = useProjectState.getState().projectChatWindowing;
    expect(nextState.order[0]).toBe("project-chat-window-2");
    expect(nextState.instancesById["project-chat-window-2"]).toMatchObject({
      placement: ChatWindowPlacementEnum.bottom_docked,
      title: "Docked Chat",
      chatId: "chat-live",
    });
    expect(nextState.instancesById["project-chat-window-3"]).toMatchObject({
      placement: ChatWindowPlacementEnum.floating,
      title: "Restored Chat",
      chatId: "chat-restored",
    });
    expect(nextState.order).toEqual([
      "project-chat-window-2",
      "project-chat-window-3",
    ]);
    expect(nextState.nextInstanceNumber).toBe(4);
  });

  it("restores saved floating windows in place when they replace existing floating workspace windows", () => {
    useProjectState.setState({
      projectConfig: createProjectConfig({
        id: "project-id",
        name: "demo",
        windowSpaces: {
          "space-1": {
            id: "space-1",
            name: "Focused Layout",
            sortIndex: 0,
            windowsById: {
              "project-chat-window-2": {
                surfaceKind: "project_chat",
                mode: ChatWindowModeEnum.project_ai_mode,
                title: "Saved Chat",
                chatId: "chat-saved",
                zIndex: 4,
                normalizedBounds: {
                  x: 0.1,
                  y: 0.15,
                  width: 0.45,
                  height: 0.5,
                },
              },
            },
            order: ["project-chat-window-2"],
          },
        },
      }),
      sections: {},
      projectChatWindowing: createProjectChatWindowingState({
        order: ["project-chat-window-2"],
        instancesById: {
          "project-chat-window-2": {
            instanceId: "project-chat-window-2",
            placement: ChatWindowPlacementEnum.floating,
            title: "Moved Chat",
            chatId: "chat-live",
            zIndex: 1,
            bounds: {
              x: 500,
              y: 400,
              width: 240,
              height: 180,
            },
          },
        },
        nextInstanceNumber: 3,
      }),
    });
    routeSetProjectChatWindowingStateMock.mockResolvedValue({
      data: null,
      status: 200,
      hasResponse: true,
    });

    restoreWindowSpaceInWorkspace("space-1");

    const nextState = useProjectState.getState().projectChatWindowing;
    expect(nextState.order).toEqual(["project-chat-window-2"]);
    expect(nextState.instancesById["project-chat-window-2"]).toMatchObject({
      placement: ChatWindowPlacementEnum.floating,
      title: "Saved Chat",
      chatId: "chat-saved",
      zIndex: 4,
    });
    expect(
      nextState.instancesById["project-chat-window-2"]?.bounds,
    ).not.toEqual({
      x: 500,
      y: 400,
      width: 240,
      height: 180,
    });
    expect(nextState.instancesById["project-chat-window-3"]).toBeUndefined();
    expect(nextState.nextInstanceNumber).toBe(3);
  });

  it("restores one authoritative section binding when a saved floating section chat collides with an existing workspace binding", () => {
    useProjectState.setState({
      projectConfig: createProjectConfig({
        id: "project-id",
        name: "demo",
        windowSpaces: {
          "space-1": {
            id: "space-1",
            name: "Focused Layout",
            sortIndex: 0,
            windowsById: {
              "restored-section-window": {
                surfaceKind: "section",
                sectionIdOrNull: "section-1",
                mode: ChatWindowModeEnum.section_mode,
                title: "Saved Section Chat",
                zIndex: 4,
                normalizedBounds: {
                  x: 0.1,
                  y: 0.15,
                  width: 0.45,
                  height: 0.5,
                },
              },
            },
            order: ["restored-section-window"],
          },
        },
      }),
      sections: {
        "section-1": createCore({
          id: "section-1",
          name: "Research Notes",
        }),
      },
      projectChatWindowing: createProjectChatWindowingState({
        order: ["canvas-section-window"],
        instancesById: {
          "canvas-section-window": {
            instanceId: "canvas-section-window",
            placement: ChatWindowPlacementEnum.canvas_section,
            mode: ChatWindowModeEnum.section_mode,
            sectionIdOrNull: "section-1",
            title: "Canvas Section Chat",
          },
        },
        nextInstanceNumber: 2,
      }),
    });
    routeSetProjectChatWindowingStateMock.mockResolvedValue({
      data: null,
      status: 200,
      hasResponse: true,
    });

    restoreWindowSpaceInWorkspace("space-1");

    const nextState = useProjectState.getState().projectChatWindowing;
    const sectionInstances = Object.values(nextState.instancesById).filter(
      (instance) => instance.sectionIdOrNull === "section-1",
    );

    expect(sectionInstances).toHaveLength(1);
    expect(sectionInstances[0]).toMatchObject({
      instanceId: "restored-section-window",
      placement: ChatWindowPlacementEnum.floating,
      title: "Saved Section Chat",
    });
    expect(nextState.instancesById["canvas-section-window"]).toBeUndefined();
    expect(nextState.order).toEqual(["restored-section-window"]);
  });

  it("clears stale embedded git-pane visibility when restoring a saved workspace layout", () => {
    useProjectState.setState({
      projectConfig: createProjectConfig({
        id: "project-id",
        name: "demo",
        windowSpaces: {
          "space-1": {
            id: "space-1",
            name: "Git Layout",
            sortIndex: 0,
            windowsById: {
              "project-chat-window-2": {
                surfaceKind: "project_chat",
                mode: ChatWindowModeEnum.git_graph_mode,
                title: "Git Graph",
                zIndex: 2,
                normalizedBounds: {
                  x: 0.0,
                  y: 0.0,
                  width: 0.4,
                  height: 0.5,
                },
              },
            },
            order: ["project-chat-window-2"],
          },
        },
      }),
      sections: {},
      projectChatWindowing: createProjectChatWindowingState(),
    });
    useMisc.setState({
      projectChatGitGraphEmbeddedPaneVisibleByInstanceId: {
        "project-chat-window-2": true,
      },
    });
    routeSetProjectChatWindowingStateMock.mockResolvedValue({
      data: null,
      status: 200,
      hasResponse: true,
    });

    restoreWindowSpaceInWorkspace("space-1");

    expect(
      useMisc.getState().projectChatGitGraphEmbeddedPaneVisibleByInstanceId,
    ).toEqual({});
    expect(useProjectState.getState().projectChatWindowing.order).toEqual([
      "project-chat-window-2",
    ]);
  });
});
