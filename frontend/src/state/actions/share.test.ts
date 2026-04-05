import {
  useAllProjectMetadata,
  useProjectLoading,
  useServerMode,
  useShareSession,
} from "state/definitions";
import {
  createPolicy,
  createProjectConfig,
  createSingleConfig,
  type ShareDeploymentSessionResponse,
  type SingleConfig,
} from "utils/generatedTypes";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const routeCreateShareSessionCurrentMock = vi.fn();
const routeLoadShareProjectConfigMock = vi.fn();
const loadProjectStateMock = vi.fn();
const requestAIFollowSnapshotMock = vi.fn();
const callOpenAPIMock = vi.fn((promise: Promise<unknown>) => promise);

vi.mock("openapi/http", async () => {
  const actual =
    await vi.importActual<typeof import("openapi/http")>("openapi/http");
  return {
    ...actual,
    getShareDeploymentCurrentSession: (options?: unknown) =>
      options === undefined
        ? routeCreateShareSessionCurrentMock()
        : routeCreateShareSessionCurrentMock(options),
    getShareDeploymentProjectConfig: (options?: unknown) =>
      options === undefined
        ? routeLoadShareProjectConfigMock()
        : routeLoadShareProjectConfigMock(options),
  };
});

vi.mock("openapi/http/result", () => ({
  callOpenAPI: (promise: Promise<unknown>) => callOpenAPIMock(promise),
}));

vi.mock("state/actions/project/loadProject", () => ({
  loadProjectState: (projectState: unknown) =>
    loadProjectStateMock(projectState),
}));

vi.mock("state/actions/aiFollow", () => ({
  requestAIFollowSnapshot: (projectConfigId: string) =>
    requestAIFollowSnapshotMock(projectConfigId),
}));

import {
  ensureShareSessionFromCurrentDeployment,
  loadShareProjectConfig,
  resetShareSessionState,
} from "./share";

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    getItem(key: string): string | null {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string): void {
      values.set(key, value);
    },
    removeItem(key: string): void {
      values.delete(key);
    },
    clear(): void {
      values.clear();
    },
    key(index: number): string | null {
      return Array.from(values.keys())[index] ?? null;
    },
    get length(): number {
      return values.size;
    },
  };
}

function buildShareSessionResponse(
  overrides: Partial<ShareDeploymentSessionResponse> = {},
): ShareDeploymentSessionResponse {
  const defaultProject = createProjectConfig({
    id: "project-alpha",
    name: "Alpha",
  });
  return {
    deploymentName: "demo-share",
    deploymentVersion: "v1",
    shareSessionId: "share-session-a",
    sessionRunCount: 2,
    defaultProjectConfigId: defaultProject.id,
    projectMetadata: [defaultProject],
    sharePolicy: createPolicy(),
    manifest: null,
    ...overrides,
  };
}

function buildProjectState(
  projectConfigId: string,
  name: string,
): SingleConfig {
  return createSingleConfig({
    projectConfig: createProjectConfig({
      id: projectConfigId,
      name,
    }),
  });
}

function setDeploymentShareState(
  session: Partial<ShareDeploymentSessionResponse> = {},
): void {
  const resolved = buildShareSessionResponse(session);
  useShareSession.setState({
    isDeploymentMode: true,
    shareSessionId: resolved.shareSessionId,
    sessionRunCount: resolved.sessionRunCount,
    sharePolicy: resolved.sharePolicy,
    shareDeploymentName: resolved.deploymentName,
    shareDeploymentVersion: resolved.deploymentVersion,
    deploymentMode: "share",
  });
  useServerMode.setState({
    mode: "share",
    modeResolved: true,
    modeError: null,
  });
  useAllProjectMetadata.setState({
    defaultProjectConfigId: resolved.defaultProjectConfigId,
    projectMetadata: resolved.projectMetadata,
  });
}

describe("share deployment actions", () => {
  const originalWindow = (globalThis as { window?: unknown }).window;
  const originalDocument = (globalThis as { document?: unknown }).document;
  const originalSessionStorage = (globalThis as { sessionStorage?: unknown })
    .sessionStorage;
  const sessionStorageStub = createMemoryStorage();
  const documentStub = { cookie: "" };
  const windowStub = {
    sessionStorage: sessionStorageStub,
  };

  beforeAll(() => {
    (globalThis as { window?: unknown }).window = windowStub;
    (globalThis as { document?: unknown }).document = documentStub;
    (globalThis as { sessionStorage?: Storage }).sessionStorage =
      sessionStorageStub;
  });

  beforeEach(() => {
    resetShareSessionState();
    useProjectLoading.getState().reset?.();
    useServerMode.setState({
      mode: null,
      modeResolved: false,
      modeError: null,
    });
    window.sessionStorage.clear();
    document.cookie = "shareSessionId=; path=/; Max-Age=0; SameSite=Lax";
    routeCreateShareSessionCurrentMock.mockReset();
    routeLoadShareProjectConfigMock.mockReset();
    callOpenAPIMock.mockClear();
    loadProjectStateMock.mockReset();
    requestAIFollowSnapshotMock.mockReset();
    loadProjectStateMock.mockResolvedValue(true);
    requestAIFollowSnapshotMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    resetShareSessionState();
    useProjectLoading.getState().reset?.();
    useServerMode.setState({
      mode: null,
      modeResolved: false,
      modeError: null,
    });
    window.sessionStorage.clear();
  });

  afterAll(() => {
    if (originalWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      (globalThis as { window?: unknown }).window = originalWindow;
    }
    if (originalDocument === undefined) {
      delete (globalThis as { document?: unknown }).document;
    } else {
      (globalThis as { document?: unknown }).document = originalDocument;
    }
    if (originalSessionStorage === undefined) {
      delete (globalThis as { sessionStorage?: unknown }).sessionStorage;
    } else {
      (globalThis as { sessionStorage?: unknown }).sessionStorage =
        originalSessionStorage;
    }
  });

  it("stores current deployment share session metadata and reuses it", async () => {
    const session = buildShareSessionResponse();
    routeCreateShareSessionCurrentMock.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: session,
    });

    const first = await ensureShareSessionFromCurrentDeployment();
    const second = await ensureShareSessionFromCurrentDeployment();

    expect(first).toEqual(session);
    expect(second).toEqual(session);
    expect(routeCreateShareSessionCurrentMock).toHaveBeenCalledTimes(1);
    expect(routeCreateShareSessionCurrentMock).toHaveBeenCalledWith();
    expect(useShareSession.getState()).toMatchObject({
      isDeploymentMode: true,
      shareSessionId: session.shareSessionId,
      shareDeploymentName: session.deploymentName,
      shareDeploymentVersion: session.deploymentVersion,
      deploymentMode: "share",
    });
    expect(useAllProjectMetadata.getState()).toMatchObject({
      defaultProjectConfigId: session.defaultProjectConfigId,
      projectMetadata: session.projectMetadata,
    });
    expect(useServerMode.getState()).toEqual({
      mode: "share",
      modeResolved: true,
      modeError: null,
    });
  });

  it("loads a share project config and requests AI follow when policy allows it", async () => {
    const projectState = buildProjectState("project-beta", "Beta");
    setDeploymentShareState({
      sharePolicy: createPolicy({ allowLLM: true }),
    });
    routeLoadShareProjectConfigMock.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: {
        projectState,
        completedOpIds: [],
        pendingOpIds: [],
      },
    });

    const loaded = await loadShareProjectConfig({
      projectConfigId: "project-beta",
    });

    expect(loaded).toBe(true);
    expect(routeLoadShareProjectConfigMock).toHaveBeenCalledWith({
      path: {
        deploymentName: "demo-share",
        version: "v1",
      },
      body: {
        projectConfigId: "project-beta",
      },
    });
    expect(loadProjectStateMock).toHaveBeenCalledWith(projectState);
    expect(requestAIFollowSnapshotMock).toHaveBeenCalledWith("project-beta");
    expect(useProjectLoading.getState()).toMatchObject({
      projectIsLoading: false,
      projectIs404: false,
    });
  });

  it("refreshes the share session when Go reports an unknown share session", async () => {
    const refreshedSession = buildShareSessionResponse({
      shareSessionId: "share-session-b",
      sessionRunCount: 0,
    });
    const projectState = buildProjectState("project-beta", "Beta");
    setDeploymentShareState({
      shareSessionId: "stale-session",
    });
    routeLoadShareProjectConfigMock
      .mockResolvedValueOnce({
        status: 404,
        hasResponse: true,
        data: {
          error: {
            code: "unknown_share_session",
            message: "Share session not found: stale-session",
          },
        },
      })
      .mockResolvedValueOnce({
        status: 200,
        hasResponse: true,
        data: {
          projectState,
          completedOpIds: [],
          pendingOpIds: [],
        },
      });
    routeCreateShareSessionCurrentMock.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: refreshedSession,
    });

    const loaded = await loadShareProjectConfig({
      projectConfigId: "project-beta",
    });

    expect(loaded).toBe(true);
    expect(routeLoadShareProjectConfigMock).toHaveBeenCalledTimes(2);
    expect(routeLoadShareProjectConfigMock).toHaveBeenLastCalledWith({
      path: {
        deploymentName: "demo-share",
        version: "v1",
      },
      body: {
        projectConfigId: "project-beta",
      },
    });
    expect(routeCreateShareSessionCurrentMock).toHaveBeenCalledTimes(1);
    expect(useShareSession.getState().shareSessionId).toBe(
      refreshedSession.shareSessionId,
    );
  });

  it("does not reset the share session for an unknown project config", async () => {
    setDeploymentShareState();
    routeLoadShareProjectConfigMock.mockResolvedValue({
      status: 404,
      hasResponse: true,
      data: {
        error: {
          code: "project_config_not_found",
          message: "Project config not found.",
        },
      },
    });

    const loaded = await loadShareProjectConfig({
      projectConfigId: "missing-project",
    });

    expect(loaded).toBe(false);
    expect(routeCreateShareSessionCurrentMock).not.toHaveBeenCalled();
    expect(routeLoadShareProjectConfigMock).toHaveBeenCalledTimes(1);
    expect(routeLoadShareProjectConfigMock).toHaveBeenCalledWith({
      path: {
        deploymentName: "demo-share",
        version: "v1",
      },
      body: {
        projectConfigId: "missing-project",
      },
    });
    expect(useProjectLoading.getState()).toMatchObject({
      projectIsLoading: false,
      projectIs404: true,
    });
  });
});
