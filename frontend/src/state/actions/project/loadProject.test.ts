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
  createLSPDiagnosticsPayload,
  createProjectChatWindowInstance,
  createProjectChatWindowingState,
  createProjectConfig,
  createProjectConfigDiagnostics,
  createSingleConfig,
  createWindowSpaceConfig,
  type SingleConfig,
} from "utils/generatedTypes";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const routeCreateProjectConfigMock = vi.fn();
const routeLoadProjectConfigMock = vi.fn();
const routeLoadAllProjectMetadataMock = vi.fn();
const routeGetLatestLspDiagnosticsMock = vi.fn();
const callOpenAPIMock = vi.fn((promise: Promise<unknown>) => promise);
const initializeServerModeMock = vi.fn();
const requestAIFollowSnapshotMock = vi.fn();
const fetchListenerCoverageSnapshotMock = vi.fn();
const processLspDiagnosticsMock = vi.fn();
const navigateMock = vi.fn();

vi.mock("react-router-dom", () => ({
  useNavigate: () => navigateMock,
}));

vi.mock("openapi/http", async () => {
  const actual =
    await vi.importActual<typeof import("openapi/http")>("openapi/http");
  return {
    ...actual,
    createProjectConfig: (options?: unknown) =>
      options === undefined
        ? routeCreateProjectConfigMock()
        : routeCreateProjectConfigMock(options),
    getLatestLspDiagnostics: (options?: unknown) =>
      options === undefined
        ? routeGetLatestLspDiagnosticsMock()
        : routeGetLatestLspDiagnosticsMock(options),
    loadAllProjectMetadata: (options?: unknown) =>
      options === undefined
        ? routeLoadAllProjectMetadataMock()
        : routeLoadAllProjectMetadataMock(options),
    loadProjectConfig: (options?: unknown) =>
      options === undefined
        ? routeLoadProjectConfigMock()
        : routeLoadProjectConfigMock(options),
  };
});

vi.mock("@setta/app-subsystem-frontend-sdk", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@setta/app-subsystem-frontend-sdk")>();
  return {
    ...actual,
    callOpenAPI: (promise: Promise<unknown>) => callOpenAPIMock(promise),
  };
});

vi.mock("../serverMode", () => ({
  initializeServerMode: () => initializeServerModeMock(),
}));

vi.mock("../aiFollow", () => ({
  requestAIFollowSnapshot: (projectConfigId: string) =>
    requestAIFollowSnapshotMock(projectConfigId),
}));

vi.mock("../listenerCoverage", () => ({
  fetchListenerCoverageSnapshot: (projectConfigId: string) =>
    fetchListenerCoverageSnapshotMock(projectConfigId),
}));

vi.mock("../lspDiagnostics", () => ({
  processLspDiagnostics: (payload: unknown) =>
    processLspDiagnosticsMock(payload),
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

function setReactActEnvironment(value: boolean | undefined) {
  const target = globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  };
  if (value === undefined) {
    delete target.IS_REACT_ACT_ENVIRONMENT;
    return;
  }
  target.IS_REACT_ACT_ENVIRONMENT = value;
}

beforeAll(() => {
  setReactActEnvironment(true);
});

afterAll(() => {
  setReactActEnvironment(originalReactActEnvironment);
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
    callOpenAPIMock.mockClear();
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
    expect(routeLoadAllProjectMetadataMock).toHaveBeenCalledWith();
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
    const loadedProjectState = createSingleConfig({
      projectConfig: createProjectConfig({
        id: "project-loaded",
        name: "Loaded Project",
      }),
    });
    const diagnostics = createLSPDiagnosticsPayload({
      projectConfigId: "project-loaded",
      genCode: createProjectConfigDiagnostics({
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
      body: {
        projectConfigName: "Loaded Project",
      },
    });
    expect(routeGetLatestLspDiagnosticsMock).toHaveBeenCalledWith({
      body: {
        projectConfigId: "project-loaded",
      },
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
        body: {
          previewImgColor: expect.any(String),
        },
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
    const invalidProjectConfig = createProjectConfig({
      id: "project-invalid",
      name: "Invalid Project",
    }) as Partial<SingleConfig["projectConfig"]>;
    delete invalidProjectConfig.windowSpaces;
    const invalidProjectState: Partial<SingleConfig> = {
      projectConfig: invalidProjectConfig as SingleConfig["projectConfig"],
      projectChatWindowing: createProjectChatWindowingState(),
    };

    await expect(loadProjectState(invalidProjectState)).rejects.toThrow(
      "projectConfig.windowSpaces",
    );
  });

  it("throws when loaded project state is missing project chat windowing", async () => {
    const invalidProjectState: Partial<SingleConfig> = {
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
    const backendProjectConfig = createProjectConfig({
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
    });
    const backendProjectState: Partial<SingleConfig> = {
      projectConfig: backendProjectConfig,
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
      backendProjectConfig.windowSpaces,
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
