import { requestAIFollowSnapshot } from "state/actions/aiFollow";
import { fetchListenerCoverageSnapshot } from "state/actions/listenerCoverage";
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
  createWindowSpaceConfig,
  type ProjectStateSingleConfigInput,
} from "utils/generatedTypes";
import { beforeEach, describe, expect, it, vi } from "vitest";

const routeLoadAllProjectMetadataMock = vi.fn();
const initializeServerModeMock = vi.fn();
const processLspDiagnosticsMock = vi.fn();

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

vi.mock("../aiFollow", () => ({
  requestAIFollowSnapshot: vi.fn(),
}));

vi.mock("../listenerCoverage", () => ({
  fetchListenerCoverageSnapshot: vi.fn(),
}));

vi.mock("../lspDiagnostics", () => ({
  processLspDiagnostics: (...args: unknown[]) =>
    processLspDiagnosticsMock(...args),
}));

import {
  route_get_latest_lsp_diagnostics,
  route_load_project_config,
} from "utils/generatedEndpoints";
import {
  loadAllProjectMetadata,
  loadProjectConfig,
  loadProjectState,
} from "./loadProject";

const routeLoadProjectConfigMock = vi.mocked(route_load_project_config);
const routeGetLatestLspDiagnosticsMock = vi.mocked(
  route_get_latest_lsp_diagnostics,
);
const requestAIFollowSnapshotMock = vi.mocked(requestAIFollowSnapshot);
const fetchListenerCoverageSnapshotMock = vi.mocked(
  fetchListenerCoverageSnapshot,
);

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
    routeLoadProjectConfigMock.mockReset();
    routeGetLatestLspDiagnosticsMock.mockReset();
    requestAIFollowSnapshotMock.mockReset();
    fetchListenerCoverageSnapshotMock.mockReset();
    processLspDiagnosticsMock.mockReset();
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

  it("publishes the loaded project before trailing diagnostics and follow-up fetches settle", async () => {
    const loadedProjectState: ProjectStateSingleConfigInput = {
      projectConfig: createProjectConfig({
        id: "project-fast",
        name: "settings",
      }),
      projectChatWindowing: createProjectChatWindowingState(),
    };
    let resolveDiagnostics: (() => void) | null = null;

    routeLoadProjectConfigMock.mockResolvedValue({
      data: loadedProjectState,
      status: 200,
      hasResponse: true,
    });
    routeGetLatestLspDiagnosticsMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveDiagnostics = () => {
            resolve({
              data: [],
              status: 200,
              hasResponse: true,
            });
          };
        }),
    );
    requestAIFollowSnapshotMock.mockResolvedValue();
    fetchListenerCoverageSnapshotMock.mockResolvedValue();

    const loadPromise = loadProjectConfig({ projectConfigName: "settings" });

    await vi.waitFor(() => {
      expect(useProjectState.getState().projectConfig.name).toBe("settings");
    });

    await expect(loadPromise).resolves.toBe(true);
    expect(routeGetLatestLspDiagnosticsMock).toHaveBeenCalledWith({
      projectConfigId: "project-fast",
    });
    expect(requestAIFollowSnapshotMock).not.toHaveBeenCalled();
    expect(fetchListenerCoverageSnapshotMock).not.toHaveBeenCalled();

    resolveDiagnostics?.();

    await vi.waitFor(() => {
      expect(processLspDiagnosticsMock).toHaveBeenCalledWith([]);
      expect(requestAIFollowSnapshotMock).toHaveBeenCalledWith("project-fast");
      expect(fetchListenerCoverageSnapshotMock).toHaveBeenCalledWith(
        "project-fast",
      );
    });
  });
});
