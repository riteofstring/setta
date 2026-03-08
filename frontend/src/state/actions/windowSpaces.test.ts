import {
  buildFloatingSnapBounds,
  buildFloatingSnapResizeHandles,
  resolveFloatingSnapPresetFromBounds,
} from "components/ChatWindowing/projectChatSnapLayout";
import { buildProjectChatEphemeralWindowInstanceKey } from "state/actions/projectChatWindowingEphemeral";
import {
  useMisc,
  usePendingOperations,
  useProjectState,
  useShareSession,
} from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  ChatWindowModeEnum,
  ChatWindowPlacementEnum,
  SettaNotificationTypeEnum,
  createCore,
  createProjectChatWindowingState,
  createProjectConfig,
  createWindowSpaceConfig,
} from "utils/generatedTypes";
import { beforeEach, describe, expect, it, vi } from "vitest";

const routeCreateWindowSpaceMock = vi.fn();
const routeDeleteWindowSpaceMock = vi.fn();
const routeSetWindowSpaceNameMock = vi.fn();
const routeSetWindowSpaceSortOrderMock = vi.fn();
const routeSetProjectChatWindowingStateMock = vi.fn();
const addTemporaryNotificationMock = vi.fn();

vi.mock("utils/generatedEndpoints", () => ({
  route_create_window_space: (...args: unknown[]) =>
    routeCreateWindowSpaceMock(...args),
  route_delete_window_space: (...args: unknown[]) =>
    routeDeleteWindowSpaceMock(...args),
  route_set_window_space_sort_order: (...args: unknown[]) =>
    routeSetWindowSpaceSortOrderMock(...args),
  route_set_window_space_name: (...args: unknown[]) =>
    routeSetWindowSpaceNameMock(...args),
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
  deleteWindowSpace,
  persistWindowSpaceSortOrder,
  restoreWindowSpaceInWorkspace,
  setWindowSpaceName,
  snapshotFloatingWindowsForWindowSpace,
} from "./windowSpaces";

function buildCreatedWindowSpaceResponse(request: {
  name: string;
  state: {
    windowsById: Record<string, unknown>;
    order: Array<string>;
  };
  id?: string;
}) {
  return {
    data: createWindowSpaceConfig({
      id: request.id ?? "window-space-1",
      name: request.name,
      sortIndex: 0,
      windowsById: request.state.windowsById,
      order: request.state.order,
    }),
    status: 200,
    hasResponse: true,
  };
}

async function flushOptimisticMutation(): Promise<void> {
  for (let index = 0; index < 8; index += 1) {
    await Promise.resolve();
  }
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

describe("snapshotFloatingWindowsForWindowSpace", () => {
  beforeEach(() => {
    resetProjectStores();
    routeCreateWindowSpaceMock.mockReset();
    routeDeleteWindowSpaceMock.mockReset();
    routeSetWindowSpaceNameMock.mockReset();
    routeSetWindowSpaceSortOrderMock.mockReset();
    routeSetProjectChatWindowingStateMock.mockReset();
    addTemporaryNotificationMock.mockReset();
    usePendingOperations.setState({ pending: [] });
    routeSetProjectChatWindowingStateMock.mockImplementation(
      async (request) => ({
        data: request.state,
        status: 200,
        hasResponse: true,
      }),
    );
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
      title: null,
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

  it("persists embedded git-pane visibility for saved git graph windows", () => {
    useMisc.setState({
      projectChatGitGraphEmbeddedPaneVisibleByInstanceId: {
        [buildProjectChatEphemeralWindowInstanceKey(
          "project-id",
          "graph-window",
        )]: true,
      },
    });

    const snapshot = snapshotFloatingWindowsForWindowSpace({
      projectChatWindowing: createProjectChatWindowingState({
        order: ["graph-window"],
        instancesById: {
          "graph-window": {
            instanceId: "graph-window",
            placement: ChatWindowPlacementEnum.floating,
            mode: ChatWindowModeEnum.git_graph_mode,
            isClosed: false,
            isMinimized: false,
            isMaximized: false,
            zIndex: 4,
            bounds: {
              x: 24,
              y: 32,
              width: 480,
              height: 320,
            },
          },
        },
      }),
      sections: {},
      projectConfig: createProjectConfig({
        id: "project-id",
        name: "demo",
      }),
    });

    expect(snapshot.windowsById["graph-window"]).toMatchObject({
      mode: ChatWindowModeEnum.git_graph_mode,
      embeddedGitPaneVisible: true,
    });
  });

  it("clears inert section titles when snapshotting and restoring floating section windows", () => {
    const snapshot = snapshotFloatingWindowsForWindowSpace({
      projectChatWindowing: createProjectChatWindowingState({
        order: ["floating-section"],
        instancesById: {
          "floating-section": {
            instanceId: "floating-section",
            placement: ChatWindowPlacementEnum.floating,
            mode: ChatWindowModeEnum.section_mode,
            sectionIdOrNull: "section-1",
            title: "Ignored Section Title",
            isClosed: false,
            isMinimized: false,
            isMaximized: false,
            zIndex: 4,
            bounds: {
              x: 120,
              y: 80,
              width: 500,
              height: 360,
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
    });

    expect(snapshot.windowsById["floating-section"]?.title).toBeNull();

    const restored = createProjectChatWindowingStateFromWindowSpace(
      {
        id: "space-1",
        name: "Focused Layout",
        sortIndex: 0,
        windowsById: {
          "floating-section": {
            surfaceKind: "section",
            sectionIdOrNull: "section-1",
            mode: ChatWindowModeEnum.section_mode,
            title: "Still Ignored",
            zIndex: 4,
            normalizedBounds: {
              x: 0.1,
              y: 0.2,
              width: 0.5,
              height: 0.4,
            },
          },
        },
        order: ["floating-section"],
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

    expect(restored.instancesById["floating-section"]?.title).toBeNull();
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
    routeDeleteWindowSpaceMock.mockReset();
    routeSetWindowSpaceNameMock.mockReset();
    routeSetWindowSpaceSortOrderMock.mockReset();
    routeSetProjectChatWindowingStateMock.mockReset();
    addTemporaryNotificationMock.mockReset();
    usePendingOperations.setState({ pending: [] });
    routeSetProjectChatWindowingStateMock.mockImplementation(
      async (request) => ({
        data: request.state,
        status: 200,
        hasResponse: true,
      }),
    );
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

describe("window-space optimistic rollback", () => {
  beforeEach(() => {
    resetProjectStores();
    routeCreateWindowSpaceMock.mockReset();
    routeDeleteWindowSpaceMock.mockReset();
    routeSetWindowSpaceNameMock.mockReset();
    routeSetWindowSpaceSortOrderMock.mockReset();
    routeSetProjectChatWindowingStateMock.mockReset();
    addTemporaryNotificationMock.mockReset();
    usePendingOperations.setState({ pending: [] });
  });

  it("rolls back a rejected reorder to the authoritative sort order", async () => {
    useProjectState.setState({
      projectConfig: createProjectConfig({
        id: "project-id",
        name: "demo",
        windowSpaces: {
          "alpha-id": createWindowSpaceConfig({
            id: "alpha-id",
            name: "Alpha",
            sortIndex: 0,
            windowsById: {},
            order: [],
          }),
          "beta-id": createWindowSpaceConfig({
            id: "beta-id",
            name: "Beta",
            sortIndex: 1,
            windowsById: {},
            order: [],
          }),
          "gamma-id": createWindowSpaceConfig({
            id: "gamma-id",
            name: "Gamma",
            sortIndex: 2,
            windowsById: {},
            order: [],
          }),
        },
      }),
    });
    routeSetWindowSpaceSortOrderMock.mockResolvedValue({
      data: { detail: "Forbidden" },
      status: 403,
      hasResponse: true,
    });

    persistWindowSpaceSortOrder("project-id", [
      "gamma-id",
      "alpha-id",
      "beta-id",
    ]);
    await flushOptimisticMutation();

    const windowSpaces = useProjectState.getState().projectConfig.windowSpaces;
    expect(windowSpaces["alpha-id"]?.sortIndex).toBe(0);
    expect(windowSpaces["beta-id"]?.sortIndex).toBe(1);
    expect(windowSpaces["gamma-id"]?.sortIndex).toBe(2);
    expect(
      Object.values(windowSpaces)
        .sort((a, b) => a.sortIndex - b.sortIndex)
        .map((windowSpace) => windowSpace.id),
    ).toEqual(["alpha-id", "beta-id", "gamma-id"]);
    expect(usePendingOperations.getState().pending).toEqual([]);
  });

  it("rolls back a rejected delete to the authoritative window-space list", async () => {
    useProjectState.setState({
      projectConfig: createProjectConfig({
        id: "project-id",
        name: "demo",
        windowSpaces: {
          "alpha-id": createWindowSpaceConfig({
            id: "alpha-id",
            name: "Alpha",
            sortIndex: 0,
            windowsById: {},
            order: [],
          }),
          "beta-id": createWindowSpaceConfig({
            id: "beta-id",
            name: "Beta",
            sortIndex: 1,
            windowsById: {},
            order: [],
          }),
        },
      }),
    });
    routeDeleteWindowSpaceMock.mockResolvedValue({
      data: { detail: "Forbidden" },
      status: 403,
      hasResponse: true,
    });

    deleteWindowSpace("project-id", "alpha-id");
    await flushOptimisticMutation();

    const windowSpaces = useProjectState.getState().projectConfig.windowSpaces;
    expect(Object.keys(windowSpaces)).toEqual(["alpha-id", "beta-id"]);
    expect(windowSpaces["alpha-id"]?.sortIndex).toBe(0);
    expect(windowSpaces["beta-id"]?.sortIndex).toBe(1);
    expect(usePendingOperations.getState().pending).toEqual([]);
  });

  it("rolls back a transport-failed rename to the authoritative name", async () => {
    useProjectState.setState({
      projectConfig: createProjectConfig({
        id: "project-id",
        name: "demo",
        windowSpaces: {
          "alpha-id": createWindowSpaceConfig({
            id: "alpha-id",
            name: "Alpha",
            sortIndex: 0,
            windowsById: {},
            order: [],
          }),
        },
      }),
    });
    routeSetWindowSpaceNameMock.mockResolvedValue({
      data: null,
      status: 0,
      hasResponse: false,
    });

    setWindowSpaceName("project-id", "alpha-id", "Renamed Alpha");
    await flushOptimisticMutation();

    expect(
      useProjectState.getState().projectConfig.windowSpaces["alpha-id"]?.name,
    ).toBe("Alpha");
    expect(usePendingOperations.getState().pending).toEqual([]);
  });

  it("does not roll back a rename into a different project after navigation", async () => {
    const projectBWindowSpaces = {
      "beta-id": createWindowSpaceConfig({
        id: "beta-id",
        name: "Beta",
        sortIndex: 0,
        windowsById: {},
        order: [],
      }),
    };
    useProjectState.setState({
      projectConfig: createProjectConfig({
        id: "project-id",
        name: "demo",
        windowSpaces: {
          "alpha-id": createWindowSpaceConfig({
            id: "alpha-id",
            name: "Alpha",
            sortIndex: 0,
            windowsById: {},
            order: [],
          }),
        },
      }),
    });
    routeSetWindowSpaceNameMock.mockResolvedValue({
      data: { detail: "Forbidden" },
      status: 403,
      hasResponse: true,
    });

    setWindowSpaceName("project-id", "alpha-id", "Renamed Alpha");
    useProjectState.setState({
      projectConfig: createProjectConfig({
        id: "project-b",
        name: "demo-b",
        windowSpaces: projectBWindowSpaces,
      }),
    });

    await flushOptimisticMutation();

    expect(useProjectState.getState().projectConfig.id).toBe("project-b");
    expect(useProjectState.getState().projectConfig.windowSpaces).toEqual(
      projectBWindowSpaces,
    );
    expect(usePendingOperations.getState().pending).toEqual([]);
  });

  it("replays a later accepted delete after an earlier rename fails out of order", async () => {
    let resolveRenameWrite:
      | ((value: {
          data: { detail: string } | null;
          status: number;
          hasResponse: boolean;
        }) => void)
      | null = null;
    useProjectState.setState({
      projectConfig: createProjectConfig({
        id: "project-id",
        name: "demo",
        windowSpaces: {
          "alpha-id": createWindowSpaceConfig({
            id: "alpha-id",
            name: "Alpha",
            sortIndex: 0,
            windowsById: {},
            order: [],
          }),
          "beta-id": createWindowSpaceConfig({
            id: "beta-id",
            name: "Beta",
            sortIndex: 1,
            windowsById: {},
            order: [],
          }),
        },
      }),
    });
    routeSetWindowSpaceNameMock.mockReturnValue(
      new Promise((resolve) => {
        resolveRenameWrite = resolve;
      }),
    );
    routeDeleteWindowSpaceMock.mockResolvedValue({
      data: null,
      status: 200,
      hasResponse: true,
    });

    setWindowSpaceName("project-id", "alpha-id", "Renamed Alpha");
    deleteWindowSpace("project-id", "beta-id");
    await flushOptimisticMutation();

    resolveRenameWrite?.({
      data: { detail: "Forbidden" },
      status: 403,
      hasResponse: true,
    });
    await flushOptimisticMutation();

    const windowSpaces = useProjectState.getState().projectConfig.windowSpaces;
    expect(windowSpaces["alpha-id"]?.name).toBe("Alpha");
    expect(windowSpaces["alpha-id"]?.sortIndex).toBe(0);
    expect(windowSpaces["beta-id"]).toBeUndefined();
    expect(usePendingOperations.getState().pending).toHaveLength(1);
    expect(usePendingOperations.getState().pending[0]?.acknowledged).toBe(true);
  });

  it("replays a later accepted reorder after an earlier rename fails out of order", async () => {
    let resolveRenameWrite:
      | ((value: {
          data: { detail: string } | null;
          status: number;
          hasResponse: boolean;
        }) => void)
      | null = null;
    useProjectState.setState({
      projectConfig: createProjectConfig({
        id: "project-id",
        name: "demo",
        windowSpaces: {
          "alpha-id": createWindowSpaceConfig({
            id: "alpha-id",
            name: "Alpha",
            sortIndex: 0,
            windowsById: {},
            order: [],
          }),
          "beta-id": createWindowSpaceConfig({
            id: "beta-id",
            name: "Beta",
            sortIndex: 1,
            windowsById: {},
            order: [],
          }),
          "gamma-id": createWindowSpaceConfig({
            id: "gamma-id",
            name: "Gamma",
            sortIndex: 2,
            windowsById: {},
            order: [],
          }),
        },
      }),
    });
    routeSetWindowSpaceNameMock.mockReturnValue(
      new Promise((resolve) => {
        resolveRenameWrite = resolve;
      }),
    );
    routeSetWindowSpaceSortOrderMock.mockResolvedValue({
      data: null,
      status: 200,
      hasResponse: true,
    });

    setWindowSpaceName("project-id", "alpha-id", "Renamed Alpha");
    persistWindowSpaceSortOrder("project-id", [
      "gamma-id",
      "alpha-id",
      "beta-id",
    ]);
    await flushOptimisticMutation();

    resolveRenameWrite?.({
      data: { detail: "Forbidden" },
      status: 403,
      hasResponse: true,
    });
    await flushOptimisticMutation();

    const orderedWindowSpaces = Object.values(
      useProjectState.getState().projectConfig.windowSpaces,
    )
      .sort((a, b) => a.sortIndex - b.sortIndex)
      .map((windowSpace) => ({
        id: windowSpace.id,
        name: windowSpace.name,
      }));
    expect(orderedWindowSpaces).toEqual([
      { id: "gamma-id", name: "Gamma" },
      { id: "alpha-id", name: "Alpha" },
      { id: "beta-id", name: "Beta" },
    ]);
    expect(usePendingOperations.getState().pending).toHaveLength(1);
    expect(usePendingOperations.getState().pending[0]?.acknowledged).toBe(true);
  });
});

describe("createWindowSpaceFromCurrentFloatingWindows", () => {
  beforeEach(() => {
    resetProjectStores();
    routeCreateWindowSpaceMock.mockReset();
    routeDeleteWindowSpaceMock.mockReset();
    routeSetWindowSpaceNameMock.mockReset();
    routeSetWindowSpaceSortOrderMock.mockReset();
    routeSetProjectChatWindowingStateMock.mockReset();
    addTemporaryNotificationMock.mockReset();
    usePendingOperations.setState({ pending: [] });
    routeSetProjectChatWindowingStateMock.mockImplementation(
      async (request) => ({
        data: request.state,
        status: 200,
        hasResponse: true,
      }),
    );
  });

  it("waits for in-flight project chat windowing writes before saving the current layout", async () => {
    let resolveWindowingWrite:
      | ((value: {
          status: number;
          hasResponse: boolean;
          data: ReturnType<typeof createProjectChatWindowingState>;
        }) => void)
      | null = null;
    const pendingWindowingWrite = new Promise<{
      status: number;
      hasResponse: boolean;
      data: ReturnType<typeof createProjectChatWindowingState>;
    }>((resolve) => {
      resolveWindowingWrite = resolve;
    });
    routeSetProjectChatWindowingStateMock.mockReturnValue(
      pendingWindowingWrite,
    );
    routeCreateWindowSpaceMock.mockImplementation(async (request) =>
      buildCreatedWindowSpaceResponse(request),
    );
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
      data: useProjectState.getState().projectChatWindowing,
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
    routeCreateWindowSpaceMock.mockImplementation(async (request) =>
      buildCreatedWindowSpaceResponse(request),
    );

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

  it("does not merge a created window space into a different project after navigation", async () => {
    let resolveSync:
      | ((value: {
          data: ReturnType<typeof createProjectChatWindowingState>;
          status: number;
          hasResponse: boolean;
        }) => void)
      | null = null;
    let resolveCreate:
      | ((value: ReturnType<typeof buildCreatedWindowSpaceResponse>) => void)
      | null = null;
    const projectBWindowSpaces = {
      "project-b-space": createWindowSpaceConfig({
        id: "project-b-space",
        name: "Project B Layout",
        sortIndex: 0,
        windowsById: {},
        order: [],
      }),
    };
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
    routeSetProjectChatWindowingStateMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSync = resolve;
      }),
    );
    routeCreateWindowSpaceMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveCreate = resolve;
      }),
    );

    const savePromise = createWindowSpaceFromCurrentFloatingWindows();
    await Promise.resolve();
    await Promise.resolve();

    useProjectState.setState({
      projectConfig: createProjectConfig({
        id: "project-b",
        name: "demo-b",
        windowSpaces: projectBWindowSpaces,
      }),
      sections: {},
      projectChatWindowing: createProjectChatWindowingState(),
    });

    resolveSync?.({
      data: createProjectChatWindowingState({
        order: ["floating-section"],
        instancesById: {
          "floating-section": {
            instanceId: "floating-section",
            placement: ChatWindowPlacementEnum.floating,
            mode: ChatWindowModeEnum.section_mode,
            sectionIdOrNull: "section-1",
            bounds: {
              x: 120,
              y: 80,
              width: 500,
              height: 360,
            },
          },
        },
      }),
      status: 200,
      hasResponse: true,
    });
    await Promise.resolve();
    await Promise.resolve();

    const createRequest = routeCreateWindowSpaceMock.mock.calls[0]?.[0];
    expect(createRequest?.projectConfigId).toBe("project-id");

    resolveCreate?.(
      buildCreatedWindowSpaceResponse({
        ...createRequest,
        id: "window-space-1",
      }),
    );

    await expect(savePromise).resolves.toBe("window-space-1");
    expect(useProjectState.getState().projectConfig.id).toBe("project-b");
    expect(useProjectState.getState().projectConfig.windowSpaces).toEqual(
      projectBWindowSpaces,
    );
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
      sections: {
        "section-1": createCore({
          id: "section-1",
          name: "Research Notes",
        }),
      },
      projectChatWindowing: createProjectChatWindowingState({
        order: ["floating-project", "floating-section"],
        instancesById: {
          "floating-project": {
            instanceId: "floating-project",
            placement: ChatWindowPlacementEnum.floating,
            mode: ChatWindowModeEnum.project_ai_mode,
            title: "Workspace Chat",
            bounds: {
              x: 120,
              y: 80,
              width: 500,
              height: 360,
            },
          },
          "floating-section": {
            instanceId: "floating-section",
            placement: ChatWindowPlacementEnum.floating,
            mode: ChatWindowModeEnum.section_mode,
            sectionIdOrNull: "section-1",
            bounds: {
              x: 420,
              y: 120,
              width: 420,
              height: 320,
            },
          },
        },
      }),
    });
    routeSetProjectChatWindowingStateMock.mockResolvedValue({
      data: createProjectChatWindowingState({
        order: ["floating-project", "canvas-section"],
        instancesById: {
          "floating-project": {
            instanceId: "floating-project",
            placement: ChatWindowPlacementEnum.floating,
            mode: ChatWindowModeEnum.project_ai_mode,
            title: "Workspace Chat",
            bounds: {
              x: 120,
              y: 80,
              width: 500,
              height: 360,
            },
          },
          "canvas-section": {
            instanceId: "canvas-section",
            placement: ChatWindowPlacementEnum.canvas_section,
            mode: ChatWindowModeEnum.section_mode,
            sectionIdOrNull: "section-1",
          },
        },
      }),
      status: 200,
      hasResponse: true,
    });
    routeCreateWindowSpaceMock.mockImplementation(async (request) =>
      buildCreatedWindowSpaceResponse(request),
    );

    await expect(createWindowSpaceFromCurrentFloatingWindows()).resolves.toBe(
      "window-space-1",
    );

    const createRequest = routeCreateWindowSpaceMock.mock.calls[0]?.[0];
    expect(createRequest?.state.order).toEqual(["floating-project"]);
    expect(
      useProjectState.getState().projectConfig.windowSpaces["window-space-1"]
        ?.order,
    ).toEqual(["floating-project"]);
    expect(
      createRequest?.state.windowsById["floating-section"],
    ).toBeUndefined();
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
    routeDeleteWindowSpaceMock.mockReset();
    routeSetWindowSpaceNameMock.mockReset();
    routeSetWindowSpaceSortOrderMock.mockReset();
    routeSetProjectChatWindowingStateMock.mockReset();
    addTemporaryNotificationMock.mockReset();
    usePendingOperations.setState({ pending: [] });
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

  it("restores the saved floating layout while preserving unrelated live windows", async () => {
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
            chatId: "chat-live-floating",
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
    await flushOptimisticMutation();

    expect(useProjectState.getState().projectChatWindowing.order).toEqual([
      "project-chat-window-99",
      "project-chat-window-88",
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
    ).toMatchObject({
      instanceId: "project-chat-window-88",
      placement: ChatWindowPlacementEnum.floating,
      title: "Transient Window",
      chatId: "chat-live-floating",
    });
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

  it("restores saved floating windows in place when they own the same project chat thread", () => {
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
            chatId: "chat-saved",
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

  it("remaps restored floating windows when the same instance id belongs to a different live owner", () => {
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
            title: "Live Chat",
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
    expect(nextState.order).toEqual([
      "project-chat-window-2",
      "project-chat-window-3",
    ]);
    expect(nextState.instancesById["project-chat-window-2"]).toMatchObject({
      placement: ChatWindowPlacementEnum.floating,
      title: "Live Chat",
      chatId: "chat-live",
      bounds: {
        x: 500,
        y: 400,
        width: 240,
        height: 180,
      },
    });
    expect(nextState.instancesById["project-chat-window-3"]).toMatchObject({
      placement: ChatWindowPlacementEnum.floating,
      title: "Saved Chat",
      chatId: "chat-saved",
    });
    expect(nextState.nextInstanceNumber).toBe(4);
  });

  it("replaces an existing floating section host when the restored layout owns the same section", () => {
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
                title: null,
                chatId: "chat-saved-section",
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
        order: ["live-section-window", "unrelated-floating-window"],
        instancesById: {
          "live-section-window": {
            instanceId: "live-section-window",
            placement: ChatWindowPlacementEnum.floating,
            mode: ChatWindowModeEnum.section_mode,
            sectionIdOrNull: "section-1",
            title: "Live Section Chat",
            chatId: "chat-live-section",
          },
          "unrelated-floating-window": {
            instanceId: "unrelated-floating-window",
            placement: ChatWindowPlacementEnum.floating,
            mode: ChatWindowModeEnum.project_ai_mode,
            title: "Unrelated Floating Chat",
            chatId: "chat-unrelated",
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
    expect(nextState.instancesById["live-section-window"]).toBeUndefined();
    expect(nextState.instancesById["restored-section-window"]).toMatchObject({
      placement: ChatWindowPlacementEnum.floating,
      sectionIdOrNull: "section-1",
      chatId: "chat-saved-section",
    });
    expect(nextState.instancesById["unrelated-floating-window"]).toMatchObject({
      placement: ChatWindowPlacementEnum.floating,
      title: "Unrelated Floating Chat",
      chatId: "chat-unrelated",
    });
    expect(nextState.order).toEqual([
      "unrelated-floating-window",
      "restored-section-window",
    ]);
  });

  it("preserves an existing non-floating section host when a saved floating section chat collides with it", () => {
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
      instanceId: "canvas-section-window",
      placement: ChatWindowPlacementEnum.canvas_section,
      title: "Canvas Section Chat",
    });
    expect(nextState.instancesById["restored-section-window"]).toBeUndefined();
    expect(nextState.order).toEqual(["canvas-section-window"]);
  });

  it("restores persisted embedded git-pane visibility when restoring a saved workspace layout", () => {
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
                embeddedGitPaneVisible: true,
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
        [buildProjectChatEphemeralWindowInstanceKey(
          "project-id",
          "stale-window",
        )]: true,
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
    ).toEqual({
      [buildProjectChatEphemeralWindowInstanceKey(
        "project-id",
        "project-chat-window-2",
      )]: true,
    });
    expect(useProjectState.getState().projectChatWindowing.order).toEqual([
      "project-chat-window-2",
    ]);
  });

  it("rolls back git-pane visibility together with the workspace restore when the write is rejected", async () => {
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
              "project-chat-window-1": {
                surfaceKind: "project_chat",
                mode: ChatWindowModeEnum.git_graph_mode,
                title: "Saved Git Graph",
                embeddedGitPaneVisible: true,
                zIndex: 3,
                normalizedBounds: {
                  x: 0.2,
                  y: 0.1,
                  width: 0.4,
                  height: 0.5,
                },
              },
            },
            order: ["project-chat-window-1"],
          },
        },
      }),
      sections: {},
      projectChatWindowing: createProjectChatWindowingState({
        order: ["project-chat-window-1"],
        instancesById: {
          "project-chat-window-1": {
            instanceId: "project-chat-window-1",
            placement: ChatWindowPlacementEnum.floating,
            mode: ChatWindowModeEnum.git_graph_mode,
            title: "Live Git Graph",
            isClosed: false,
            isMinimized: false,
            isMaximized: false,
            zIndex: 1,
            bounds: {
              x: 600,
              y: 120,
              width: 320,
              height: 280,
            },
          },
        },
      }),
    });
    useMisc.setState({
      projectChatGitGraphEmbeddedPaneVisibleByInstanceId: {},
    });
    routeSetProjectChatWindowingStateMock.mockResolvedValue({
      data: { detail: "synthetic failure" },
      status: 500,
      hasResponse: true,
    });

    const previousWindowing = structuredClone(
      useProjectState.getState().projectChatWindowing,
    );
    const previousVisibility = structuredClone(
      useMisc.getState().projectChatGitGraphEmbeddedPaneVisibleByInstanceId,
    );

    restoreWindowSpaceInWorkspace("space-1");
    await flushOptimisticMutation();

    expect(useProjectState.getState().projectChatWindowing).toEqual(
      previousWindowing,
    );
    expect(
      useMisc.getState().projectChatGitGraphEmbeddedPaneVisibleByInstanceId,
    ).toEqual(previousVisibility);
  });

  it("preserves foreign-project git-pane visibility when restoring a workspace layout", () => {
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
                title: "Saved Git Graph",
                embeddedGitPaneVisible: true,
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
        [buildProjectChatEphemeralWindowInstanceKey(
          "foreign-project",
          "foreign-window",
        )]: true,
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
    ).toEqual({
      [buildProjectChatEphemeralWindowInstanceKey(
        "foreign-project",
        "foreign-window",
      )]: true,
      [buildProjectChatEphemeralWindowInstanceKey(
        "project-id",
        "project-chat-window-2",
      )]: true,
    });
  });

  it("is a strict no-op when deployment policy disallows restore-side layout changes", () => {
    useShareSession.setState({
      isDeploymentMode: true,
      shareSessionId: "share-session-1",
      sessionRunCount: 0,
      sharePolicy: {
        allowLLM: true,
        allowLayoutChanges: false,
        allowParamChanges: false,
        allowVariantChanges: false,
        allowRun: false,
        allowMultipleRuns: false,
      },
      shareDeploymentName: "deployment",
      shareDeploymentVersion: "v1",
      deploymentMode: "share",
    });
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
              "project-chat-window-1": {
                surfaceKind: "project_chat",
                mode: ChatWindowModeEnum.git_graph_mode,
                title: "Saved Git Graph",
                embeddedGitPaneVisible: true,
                zIndex: 3,
                normalizedBounds: {
                  x: 0.1,
                  y: 0.1,
                  width: 0.4,
                  height: 0.5,
                },
              },
            },
            order: ["project-chat-window-1"],
          },
        },
      }),
      sections: {},
      projectChatWindowing: createProjectChatWindowingState({
        order: ["project-chat-window-1"],
        instancesById: {
          "project-chat-window-1": {
            instanceId: "project-chat-window-1",
            placement: ChatWindowPlacementEnum.floating,
            mode: ChatWindowModeEnum.git_graph_mode,
            title: "Live Git Graph",
            isClosed: false,
            isMinimized: false,
            isMaximized: false,
            zIndex: 1,
            bounds: {
              x: 500,
              y: 140,
              width: 320,
              height: 260,
            },
          },
        },
      }),
    });
    useMisc.setState({
      projectChatGitGraphEmbeddedPaneVisibleByInstanceId: {
        [buildProjectChatEphemeralWindowInstanceKey(
          "project-id",
          "project-chat-window-1",
        )]: true,
      },
    });

    const previousWindowing = structuredClone(
      useProjectState.getState().projectChatWindowing,
    );
    const previousVisibility = structuredClone(
      useMisc.getState().projectChatGitGraphEmbeddedPaneVisibleByInstanceId,
    );

    restoreWindowSpaceInWorkspace("space-1");

    expect(routeSetProjectChatWindowingStateMock).not.toHaveBeenCalled();
    expect(useProjectState.getState().projectChatWindowing).toEqual(
      previousWindowing,
    );
    expect(
      useMisc.getState().projectChatGitGraphEmbeddedPaneVisibleByInstanceId,
    ).toEqual(previousVisibility);
  });
});
