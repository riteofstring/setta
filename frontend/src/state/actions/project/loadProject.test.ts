import { useReactFlow } from "forks/xyflow/core/store";
import {
  buildProjectChatEphemeralWindowInstanceKey,
  getTrackedGitPaneGraphWindowInstanceIdForProject,
} from "state/actions/projectChatWindowingEphemeral";
import {
  useAllProjectMetadata,
  useMisc,
  useProjectState,
} from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  ChatWindowModeEnum,
  ChatWindowPlacementEnum,
  createProjectChatWindowInstance,
  createProjectChatWindowingState,
  createProjectConfig,
  createSingletonSections,
  createWindowSpaceConfig,
  type ProjectStateSingleConfigInput,
  type ViewModeConfig,
} from "utils/generatedTypes";
import { beforeEach, describe, expect, it, vi } from "vitest";

const routeLoadAllProjectMetadataMock = vi.fn();
const initializeServerModeMock = vi.fn();

vi.mock("utils/generatedEndpoints", () => ({
  route_create_project_config: vi.fn(),
  route_get_latest_lsp_diagnostics: vi.fn(),
  route_load_all_project_metadata: (...args: unknown[]) =>
    routeLoadAllProjectMetadataMock(...args),
  route_load_project_config: vi.fn(),
}));

vi.mock("../serverMode", () => ({
  initializeServerMode: (...args: unknown[]) =>
    initializeServerModeMock(...args),
}));

import { loadAllProjectMetadata, loadProjectState } from "./loadProject";

describe("loadAllProjectMetadata", () => {
  beforeEach(() => {
    resetProjectStores();
    useAllProjectMetadata.setState({
      defaultProjectConfigId: null,
      projectMetadata: [],
    });
    routeLoadAllProjectMetadataMock.mockReset();
    initializeServerModeMock.mockReset();
  });

  it("returns false and skips loading when server mode is not ide", async () => {
    initializeServerModeMock.mockResolvedValue("launcher");

    const loaded = await loadAllProjectMetadata();

    expect(loaded).toBe(false);
    expect(routeLoadAllProjectMetadataMock).not.toHaveBeenCalled();
  });

  it("returns true and updates metadata store after a successful response", async () => {
    const project = createProjectConfig({
      id: "project-1",
      name: "Project One",
    });
    initializeServerModeMock.mockResolvedValue("ide");
    routeLoadAllProjectMetadataMock.mockResolvedValue({
      data: {
        defaultProjectConfigId: project.id,
        projectMetadata: [project],
      },
      status: 200,
      hasResponse: true,
    });

    const loaded = await loadAllProjectMetadata();

    expect(loaded).toBe(true);
    expect(useAllProjectMetadata.getState().defaultProjectConfigId).toBe(
      project.id,
    );
    expect(useAllProjectMetadata.getState().projectMetadata).toEqual([project]);
  });

  it("returns false when metadata request fails", async () => {
    initializeServerModeMock.mockResolvedValue("ide");
    routeLoadAllProjectMetadataMock.mockResolvedValue({
      data: undefined,
      status: 503,
      hasResponse: true,
    });

    const loaded = await loadAllProjectMetadata();

    expect(loaded).toBe(false);
    expect(useAllProjectMetadata.getState().projectMetadata).toEqual([]);
    expect(useAllProjectMetadata.getState().defaultProjectConfigId).toBeNull();
  });
});

describe("loadProjectState", () => {
  beforeEach(() => {
    resetProjectStores();
  });

  it("re-arms fit view and requests a node measurement pass when loading a null-viewport project", async () => {
    const sectionVisible = "section-visible";
    const sectionHidden = "section-hidden";
    const viewModeId = "view-1";
    const layout = { x: 0, y: 0, zIndex: 0, w: 200, h: 160 };
    const viewMode: ViewModeConfig = {
      id: viewModeId,
      name: "Visible View",
      sortIndex: 0,
      isUserFacing: false,
      isTab: true,
      visibilityBySectionId: {
        [sectionVisible]: true,
        [sectionHidden]: false,
      },
      viewport: null,
      viewportInitialized: false,
      topLevelSections: {
        [sectionVisible]: { ...layout },
        [sectionHidden]: { ...layout },
      },
    };

    useMisc.setState({ requestUpdateNodeDimensions: false });
    useReactFlow.setState({
      fitViewOnInit: false,
      fitViewOnInitDone: true,
      fitViewOnInitOptions: { nodes: [{ id: "stale-node" }] },
    });

    await loadProjectState({
      projectConfig: createProjectConfig({
        id: "project-fit-view",
        topLevelSections: {
          [sectionVisible]: { ...layout },
          [sectionHidden]: { ...layout },
        },
        viewModes: { [viewModeId]: viewMode },
        activeViewModeId: viewModeId,
        viewport: null,
        viewportInitialized: false,
      }),
      sections: {},
      sectionImpls: {},
      sectionVariants: {},
      codeObjs: {},
      codeObjImpls: {},
      codeObjVariants: {},
      artifactGroups: {},
      singletonSections: createSingletonSections(),
      parentSectionMap: {},
      shownParamIds: {},
      projectChatWindowing: createProjectChatWindowingState(),
      requiredDecodedImages: [],
    });

    const reactFlowState = useReactFlow.getState();
    expect(reactFlowState.fitViewOnInit).toBe(true);
    expect(reactFlowState.fitViewOnInitDone).toBe(false);
    expect(reactFlowState.fitViewOnInitOptions?.nodes).toEqual([
      { id: sectionVisible },
    ]);
    expect(useMisc.getState().requestUpdateNodeDimensions).toBe(true);
  });

  it("clears stale fit-view options when loading an explicit viewport", async () => {
    useMisc.setState({ requestUpdateNodeDimensions: false });
    useReactFlow.setState({
      fitViewOnInit: true,
      fitViewOnInitDone: false,
      fitViewOnInitOptions: { nodes: [{ id: "stale-node" }] },
    });

    await loadProjectState({
      projectConfig: createProjectConfig({
        id: "project-explicit-viewport",
        viewport: { x: 10, y: -20, zoom: 1.5 },
        viewportInitialized: true,
      }),
      projectChatWindowing: createProjectChatWindowingState(),
    });

    const reactFlowState = useReactFlow.getState();
    expect(reactFlowState.fitViewOnInit).toBe(false);
    expect(reactFlowState.fitViewOnInitDone).toBe(true);
    expect(reactFlowState.fitViewOnInitOptions).toBeUndefined();
    expect(reactFlowState.transform).toEqual([10, -20, 1.5]);
    expect(useMisc.getState().requestUpdateNodeDimensions).toBe(false);
  });

  it("throws when loaded project config is missing window spaces", async () => {
    const invalidProjectState: ProjectStateSingleConfigInput = {
      projectConfig: {
        id: "project-invalid",
        name: "Invalid Project",
      },
    };

    await expect(loadProjectState(invalidProjectState)).rejects.toThrow(
      "projectConfig.windowSpaces",
    );
  });

  it("throws when loaded project state is missing project chat windowing", async () => {
    const invalidProjectState: ProjectStateSingleConfigInput = {
      projectConfig: createProjectConfig({
        id: "project-missing-windowing",
        name: "Missing Windowing",
      }),
    };

    await expect(loadProjectState(invalidProjectState)).rejects.toThrow(
      "projectChatWindowing",
    );
  });

  it("keeps backend project chat windowing authoritative on load", async () => {
    const backendProjectState: ProjectStateSingleConfigInput = {
      projectConfig: createProjectConfig({
        id: "project-restore",
        name: "Restore Project",
        windowSpaces: {
          "window-space-1": createWindowSpaceConfig({
            id: "window-space-1",
            name: "Saved Layout",
            windowsById: {},
            order: [],
          }),
        },
      }),
      projectChatWindowing: createProjectChatWindowingState({
        instancesById: {
          "project-chat-window-1": createProjectChatWindowInstance({
            instanceId: "project-chat-window-1",
            placement: ChatWindowPlacementEnum.bottom_docked,
            title: "Docked Chat",
          }),
        },
        order: ["project-chat-window-1"],
        nextInstanceNumber: 2,
      }),
    };

    await loadProjectState(backendProjectState);

    expect(useProjectState.getState().projectChatWindowing.order).toEqual([
      "project-chat-window-1",
    ]);
    expect(
      useProjectState.getState().projectChatWindowing.instancesById[
        "project-chat-window-1"
      ],
    ).toMatchObject({
      placement: ChatWindowPlacementEnum.bottom_docked,
      title: "Docked Chat",
    });
    expect(useProjectState.getState().projectConfig.windowSpaces).toEqual(
      backendProjectState.projectConfig.windowSpaces,
    );
  });

  it("prunes stale git graph ephemeral state on full project load", async () => {
    // Seed leftovers from an earlier project so the load path has to reconcile
    // them against the incoming authoritative window model.
    useMisc.setState({
      projectChatTrackedGitPaneGraphWindowInstanceId:
        buildProjectChatEphemeralWindowInstanceKey(
          "stale-project",
          "project-chat-window-1",
        ),
      projectChatGitGraphEmbeddedPaneVisibleByInstanceId: {
        [buildProjectChatEphemeralWindowInstanceKey(
          "stale-project",
          "project-chat-window-1",
        )]: true,
        [buildProjectChatEphemeralWindowInstanceKey(
          "stale-project",
          "stale-window",
        )]: true,
      },
    });

    await loadProjectState({
      projectConfig: createProjectConfig({
        id: "project-prune",
        name: "Project Prune",
      }),
      projectChatWindowing: createProjectChatWindowingState(),
    });

    expect(
      getTrackedGitPaneGraphWindowInstanceIdForProject("project-prune"),
    ).toBeNull();
    expect(
      useMisc.getState().projectChatGitGraphEmbeddedPaneVisibleByInstanceId,
    ).toEqual({});
  });

  it("keeps the active maximized git graph window when full project load reuses its id", async () => {
    // A matching maximized git graph window should survive reconciliation while
    // unrelated embedded-pane visibility entries are still pruned.
    useMisc.setState({
      projectChatTrackedGitPaneGraphWindowInstanceId:
        buildProjectChatEphemeralWindowInstanceKey(
          "project-keep",
          "project-chat-window-1",
        ),
      projectChatGitGraphEmbeddedPaneVisibleByInstanceId: {
        [buildProjectChatEphemeralWindowInstanceKey(
          "project-keep",
          "project-chat-window-1",
        )]: true,
        [buildProjectChatEphemeralWindowInstanceKey(
          "project-keep",
          "stale-window",
        )]: true,
      },
    });

    await loadProjectState({
      projectConfig: createProjectConfig({
        id: "project-keep",
        name: "Project Keep",
      }),
      projectChatWindowing: createProjectChatWindowingState({
        instancesById: {
          "project-chat-window-1": createProjectChatWindowInstance({
            instanceId: "project-chat-window-1",
            mode: ChatWindowModeEnum.git_graph_mode,
            placement: ChatWindowPlacementEnum.maximized,
            isClosed: false,
            isMinimized: false,
          }),
        },
        order: ["project-chat-window-1"],
        nextInstanceNumber: 2,
      }),
    });

    expect(
      getTrackedGitPaneGraphWindowInstanceIdForProject("project-keep"),
    ).toBe("project-chat-window-1");
    expect(
      useMisc.getState().projectChatGitGraphEmbeddedPaneVisibleByInstanceId,
    ).toEqual({
      [buildProjectChatEphemeralWindowInstanceKey(
        "project-keep",
        "project-chat-window-1",
      )]: true,
    });
  });

  it("drops git graph ephemera when another project reuses the same window id", async () => {
    useMisc.setState({
      projectChatTrackedGitPaneGraphWindowInstanceId:
        buildProjectChatEphemeralWindowInstanceKey(
          "project-a",
          "project-chat-window-1",
        ),
      projectChatGitGraphEmbeddedPaneVisibleByInstanceId: {
        [buildProjectChatEphemeralWindowInstanceKey(
          "project-a",
          "project-chat-window-1",
        )]: true,
      },
    });

    await loadProjectState({
      projectConfig: createProjectConfig({
        id: "project-b",
        name: "Project B",
      }),
      projectChatWindowing: createProjectChatWindowingState({
        instancesById: {
          "project-chat-window-1": createProjectChatWindowInstance({
            instanceId: "project-chat-window-1",
            mode: ChatWindowModeEnum.git_graph_mode,
            placement: ChatWindowPlacementEnum.maximized,
            isClosed: false,
            isMinimized: false,
          }),
        },
        order: ["project-chat-window-1"],
        nextInstanceNumber: 2,
      }),
    });

    expect(
      getTrackedGitPaneGraphWindowInstanceIdForProject("project-b"),
    ).toBeNull();
    expect(
      useMisc.getState().projectChatGitGraphEmbeddedPaneVisibleByInstanceId,
    ).toEqual({});
  });
});
