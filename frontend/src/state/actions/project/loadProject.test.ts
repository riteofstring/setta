/* @vitest-environment jsdom */

import { act, createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  buildProjectChatEphemeralWindowInstanceKey,
  getTrackedGitPaneGraphWindowInstanceIdForProject,
} from "state/actions/projectChatWindowingEphemeral";
import {
  useAllProjectMetadata,
  useLocalStorage,
  useMisc,
  useProjectState,
} from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  OverviewTabNameEnum,
  PAGE_LOAD_TYPES,
  pathRelativeToProject,
} from "utils/constants";
import {
  ChatWindowModeEnum,
  ChatWindowPlacementEnum,
  createProjectChatWindowInstance,
  createProjectChatWindowingState,
  createProjectConfig,
  createProjectStateSingleConfig,
  createSettaProjectConfigDiagnostics,
  createSettaLspDiagnosticsPayload,
  createWindowSpaceConfig,
  type ProjectStateSingleConfigInput,
} from "utils/generatedTypes";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const routeCreateProjectConfigMock = vi.fn();
const routeLoadProjectConfigMock = vi.fn();
const routeLoadAllProjectMetadataMock = vi.fn();
const routeGetLatestLspDiagnosticsMock = vi.fn();
const initializeServerModeMock = vi.fn();
const requestAIFollowSnapshotMock = vi.fn();
const fetchListenerCoverageSnapshotMock = vi.fn();
const processLspDiagnosticsMock = vi.fn();
const navigateMock = vi.fn();

vi.mock("react-router-dom", () => ({
  useNavigate: () => navigateMock,
}));

vi.mock("utils/generatedEndpoints", () => ({
  route_create_project_config: (...args: unknown[]) =>
    routeCreateProjectConfigMock(...args),
  route_get_latest_lsp_diagnostics: (...args: unknown[]) =>
    routeGetLatestLspDiagnosticsMock(...args),
  route_load_all_project_metadata: (...args: unknown[]) =>
    routeLoadAllProjectMetadataMock(...args),
  route_load_project_config: (...args: unknown[]) =>
    routeLoadProjectConfigMock(...args),
}));

vi.mock("../serverMode", () => ({
  initializeServerMode: (...args: unknown[]) =>
    initializeServerModeMock(...args),
}));

vi.mock("../aiFollow", () => ({
  requestAIFollowSnapshot: (...args: unknown[]) =>
    requestAIFollowSnapshotMock(...args),
}));

vi.mock("../listenerCoverage", () => ({
  fetchListenerCoverageSnapshot: (...args: unknown[]) =>
    fetchListenerCoverageSnapshotMock(...args),
}));

vi.mock("../lspDiagnostics", () => ({
  processLspDiagnostics: (...args: unknown[]) =>
    processLspDiagnosticsMock(...args),
}));

import {
  loadAllProjectMetadata,
  loadProjectConfig,
  loadProjectState,
  useCreateAndGoToProjectConfig,
} from "./loadProject";

const originalReactActEnvironment = (
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT;

beforeAll(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = originalReactActEnvironment;
});

type CreateProjectInvokerProps = {
  onReady: (handler: () => Promise<void>) => void;
};

function CreateProjectInvoker({ onReady }: CreateProjectInvokerProps) {
  const createAndGo = useCreateAndGoToProjectConfig();

  useEffect(() => {
    onReady(createAndGo);
  }, [createAndGo, onReady]);

  return null;
}

type RenderedProjectInvoker = {
  host: HTMLDivElement;
  root: Root;
};

async function renderCreateProjectInvoker(
  onReady: (handler: () => Promise<void>) => void,
): Promise<RenderedProjectInvoker> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);

  await act(async () => {
    root.render(createElement(CreateProjectInvoker, { onReady }));
  });

  return { host, root };
}

describe("loadAllProjectMetadata", () => {
  beforeEach(() => {
    resetProjectStores();
    useAllProjectMetadata.setState({
      defaultProjectConfigId: null,
      projectMetadata: [],
    });
    routeCreateProjectConfigMock.mockReset();
    routeLoadAllProjectMetadataMock.mockReset();
    routeLoadProjectConfigMock.mockReset();
    routeGetLatestLspDiagnosticsMock.mockReset();
    initializeServerModeMock.mockReset();
    requestAIFollowSnapshotMock.mockReset();
    fetchListenerCoverageSnapshotMock.mockReset();
    processLspDiagnosticsMock.mockReset();
    navigateMock.mockReset();
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

  it("hydrates a project config and triggers the Go-owned follow-up reads", async () => {
    const loadedProjectState = createProjectStateSingleConfig({
      projectConfig: createProjectConfig({
        id: "project-loaded",
        name: "Loaded Project",
      }),
    });
    const diagnostics = createSettaLspDiagnosticsPayload({
      projectConfigId: "project-loaded",
      genCode: createSettaProjectConfigDiagnostics({
        projectConfigId: "project-loaded",
        isGenCode: true,
        errors: {},
      }),
      codeSections: {},
      unmappedGenCode: [],
    });
    routeLoadProjectConfigMock.mockResolvedValue({
      data: loadedProjectState,
      status: 200,
      hasResponse: true,
    });
    routeGetLatestLspDiagnosticsMock.mockResolvedValue({
      data: diagnostics,
      status: 200,
      hasResponse: true,
    });
    requestAIFollowSnapshotMock.mockResolvedValue(undefined);
    fetchListenerCoverageSnapshotMock.mockResolvedValue(undefined);

    const loaded = await loadProjectConfig({
      projectConfigName: "Loaded Project",
    });

    expect(loaded).toBe(true);
    expect(routeLoadProjectConfigMock).toHaveBeenCalledWith({
      projectConfigName: "Loaded Project",
    });
    expect(routeGetLatestLspDiagnosticsMock).toHaveBeenCalledWith({
      projectConfigId: "project-loaded",
    });
    expect(processLspDiagnosticsMock).toHaveBeenCalledWith(diagnostics);
    expect(requestAIFollowSnapshotMock).toHaveBeenCalledWith("project-loaded");
    expect(fetchListenerCoverageSnapshotMock).toHaveBeenCalledWith(
      "project-loaded",
    );
    expect(useProjectState.getState().projectConfig.id).toBe("project-loaded");
  });
});

describe("useCreateAndGoToProjectConfig", () => {
  beforeEach(() => {
    resetProjectStores();
    routeCreateProjectConfigMock.mockReset();
    navigateMock.mockReset();
  });

  it("navigates to the created project using the Go create-project response", async () => {
    routeCreateProjectConfigMock.mockResolvedValue({
      data: "Created Project",
      status: 200,
      hasResponse: true,
    });

    let createAndGo: (() => Promise<void>) | null = null;
    const { host, root } = await renderCreateProjectInvoker((handler) => {
      createAndGo = handler;
    });

    try {
      await act(async () => {
        await createAndGo?.();
      });

      // The hook should forward the Go-owned project name contract into the
      // navigation target and set the Project AI overview tab.
      expect(routeCreateProjectConfigMock).toHaveBeenCalledWith({
        previewImgColor: expect.any(String),
      });
      expect(useLocalStorage.getState().overviewTab).toBe(
        OverviewTabNameEnum.ProjectAIChat,
      );
      expect(navigateMock).toHaveBeenCalledWith(
        pathRelativeToProject("Created Project"),
        {
          state: { pageLoadType: PAGE_LOAD_TYPES.LOAD_PROJECT_CONFIG },
        },
      );
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });
});

describe("loadProjectState", () => {
  beforeEach(() => {
    resetProjectStores();
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
