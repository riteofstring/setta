import {
  createPolicy,
  createProjectConfig,
  createSingleConfig,
  type GetAppDeploymentCurrentSessionResponses,
  type SingleConfig,
} from "@setta/app-subsystem-frontend-sdk";
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
import { createAppDefinition } from "../../../src/appSubsystemContracts";
import { useAppDefinition } from "../../../src/appSubsystemDefinitionState";
import { useAppConfigs } from "../../../src/appSubsystemProjectState";
import { createStatefulAppSubsystemFrontendHost } from "../../testUtils/appSubsystemTestState";

const routeCreateAppSessionCurrentMock = vi.hoisted(() => vi.fn());
const routeGetAppDeploymentStateMock = vi.hoisted(() => vi.fn());
const routeLoadAppProjectConfigMock = vi.hoisted(() => vi.fn());
const callOpenAPIMock = vi.hoisted(() =>
  vi.fn((promise: Promise<unknown>) => promise),
);

vi.mock("@setta/app-subsystem-frontend-sdk", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@setta/app-subsystem-frontend-sdk")>();
  return {
    ...actual,
    callOpenAPI: callOpenAPIMock,
    getAppDeploymentCurrentSession: (options?: unknown) =>
      options === undefined
        ? routeCreateAppSessionCurrentMock()
        : routeCreateAppSessionCurrentMock(options),
    getAppDeploymentState: (options?: unknown) =>
      options === undefined
        ? routeGetAppDeploymentStateMock()
        : routeGetAppDeploymentStateMock(options),
    getAppDeploymentProjectConfig: (options?: unknown) =>
      options === undefined
        ? routeLoadAppProjectConfigMock()
        : routeLoadAppProjectConfigMock(options),
  };
});

import {
  ensureAppProjectConfigLoaded,
  ensureAppSessionFromCurrentDeployment,
  initializeAppSessionFromCurrentDeployment,
  loadAppDeploymentState,
  resetAppSessionState,
} from "../../../src/state/actions/app";

type AppDeploymentSession = GetAppDeploymentCurrentSessionResponses[200];
let frontendHost = createStatefulAppSubsystemFrontendHost();

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

function buildAppSessionResponse(
  overrides: Partial<AppDeploymentSession> = {},
): AppDeploymentSession {
  const defaultProject = createProjectConfig({
    id: "project-alpha",
    name: "Alpha",
  });
  return {
    deploymentName: "demo-app",
    deploymentVersion: "v1",
    shareSessionId: "app-session-a",
    sessionRunCount: 1,
    defaultProjectConfigId: defaultProject.id,
    projectMetadata: [defaultProject],
    appPolicy: createPolicy({ allowRun: true }),
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

function setDeploymentAppState(
  session: Partial<AppDeploymentSession> = {},
): void {
  const resolved = buildAppSessionResponse(session);
  frontendHost.setAppDeploymentSession(resolved);
  frontendHost.setServerModeState({
    mode: "app",
    modeResolved: true,
    modeError: null,
  });
}

describe("app deployment actions", () => {
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
    frontendHost = createStatefulAppSubsystemFrontendHost();
    resetAppSessionState(frontendHost);
    frontendHost.setServerModeState({
      mode: null,
      modeResolved: false,
      modeError: null,
    });
    window.sessionStorage.clear();
    document.cookie = "shareSessionId=; path=/; Max-Age=0; SameSite=Lax";
    routeCreateAppSessionCurrentMock.mockReset();
    routeGetAppDeploymentStateMock.mockReset();
    routeLoadAppProjectConfigMock.mockReset();
    callOpenAPIMock.mockClear();
  });

  afterEach(() => {
    resetAppSessionState(frontendHost);
    frontendHost.setServerModeState({
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

  it("stores current deployment app session metadata and reuses it", async () => {
    const session = buildAppSessionResponse();
    routeCreateAppSessionCurrentMock.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: session,
    });

    const first = await ensureAppSessionFromCurrentDeployment(frontendHost);
    const second = await ensureAppSessionFromCurrentDeployment(frontendHost);

    expect(first).toEqual(session);
    expect(second).toEqual(session);
    expect(routeCreateAppSessionCurrentMock).toHaveBeenCalledTimes(1);
    expect(routeCreateAppSessionCurrentMock).toHaveBeenCalledWith();
    expect(frontendHost.getAppDeploymentSession()).toMatchObject({
      deploymentName: session.deploymentName,
      deploymentVersion: session.deploymentVersion,
      shareSessionId: session.shareSessionId,
    });
    expect(frontendHost.getServerModeState()).toEqual({
      mode: "app",
      modeResolved: true,
      modeError: null,
    });
  });

  it("initializes the current deployment session and loads app deployment state", async () => {
    const loadStates: Array<{ projectIsLoading: boolean; projectIs404: boolean }> =
      [];
    const resetProjectRuntimeStateMock = vi.fn();
    frontendHost = createStatefulAppSubsystemFrontendHost({
      onProjectLoadState: (loadState) => {
        loadStates.push(loadState);
      },
      onResetProjectRuntimeState: resetProjectRuntimeStateMock,
    });
    const session = buildAppSessionResponse();
    const projectState = buildProjectState("project-alpha", "Alpha");
    const appDefinition = createAppDefinition({
      catalogId: "catalog-demo",
      appSpecPath: "plugins/setta-json-render-app-gen/app_specs/spec.json",
    });
    const appSpec = { root: { key: "root", type: "Stack" } };
    routeCreateAppSessionCurrentMock.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: session,
    });
    routeGetAppDeploymentStateMock.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: {
        projectState,
        appDefinition,
        appSpec,
        appPolicy: createPolicy({ allowRun: true }),
      },
    });

    const initialized =
      await initializeAppSessionFromCurrentDeployment(frontendHost);

    expect(initialized).toBe(true);
    expect(resetProjectRuntimeStateMock).toHaveBeenCalledTimes(1);
    expect(routeCreateAppSessionCurrentMock).toHaveBeenCalledTimes(1);
    expect(routeGetAppDeploymentStateMock).toHaveBeenCalledWith({
      path: {
        deploymentName: session.deploymentName,
        version: session.deploymentVersion,
      },
    });
    expect(useAppDefinition.getState()).toMatchObject({
      appDefinition,
      appSpec,
    });
    expect(useAppConfigs.getState().configs["project-alpha"]).toEqual({
      ...projectState,
      previewSectionVariantMap: {},
    });
    expect(loadStates).toEqual([
      { projectIsLoading: true, projectIs404: false },
      { projectIsLoading: false, projectIs404: false },
    ]);
  });

  it("marks app deployment initialization as not found when state loading fails", async () => {
    const loadStates: Array<{ projectIsLoading: boolean; projectIs404: boolean }> =
      [];
    frontendHost = createStatefulAppSubsystemFrontendHost({
      onProjectLoadState: (loadState) => {
        loadStates.push(loadState);
      },
    });
    routeCreateAppSessionCurrentMock.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: buildAppSessionResponse(),
    });
    routeGetAppDeploymentStateMock.mockResolvedValue({
      status: 404,
      hasResponse: true,
      data: {
        error: {
          code: "deployment_not_found",
          message: "Deployment not found.",
        },
      },
    });

    const initialized =
      await initializeAppSessionFromCurrentDeployment(frontendHost);

    expect(initialized).toBe(false);
    expect(loadStates).toEqual([
      { projectIsLoading: true, projectIs404: false },
      { projectIsLoading: false, projectIs404: true },
    ]);
  });

  it("loads app deployment state into app-definition and app-config stores", async () => {
    const projectState = buildProjectState("project-alpha", "Alpha");
    const appDefinition = createAppDefinition({
      catalogId: "catalog-demo",
      appSpecPath: "plugins/setta-json-render-app-gen/app_specs/spec.json",
    });
    const appSpec = { root: { key: "root", type: "Stack" } };
    setDeploymentAppState();
    routeGetAppDeploymentStateMock.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: {
        projectState,
        appDefinition,
        appSpec,
        appPolicy: createPolicy({ allowRun: true }),
      },
    });

    const loaded = await loadAppDeploymentState({ frontendHost });

    expect(loaded).toBe(true);
    expect(routeGetAppDeploymentStateMock).toHaveBeenCalledWith({
      path: {
        deploymentName: "demo-app",
        version: "v1",
      },
    });
    expect(useAppDefinition.getState()).toMatchObject({
      appDefinition,
      appSpec,
    });
    expect(useAppConfigs.getState().configs["project-alpha"]).toEqual({
      ...projectState,
      previewSectionVariantMap: {},
    });
  });

  it("refreshes the app session when Go reports an unknown share session", async () => {
    const refreshedSession = buildAppSessionResponse({
      shareSessionId: "app-session-b",
      sessionRunCount: 0,
    });
    const projectState = buildProjectState("project-beta", "Beta");
    setDeploymentAppState({
      shareSessionId: "stale-session",
    });
    routeLoadAppProjectConfigMock
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
          appDefinition: null,
          appSpec: null,
          appPolicy: createPolicy({ allowRun: true }),
        },
      });
    routeCreateAppSessionCurrentMock.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: refreshedSession,
    });

    const loaded = await ensureAppProjectConfigLoaded(
      frontendHost,
      "project-beta",
    );

    expect(loaded).toBe(true);
    expect(routeLoadAppProjectConfigMock).toHaveBeenCalledTimes(2);
    expect(routeLoadAppProjectConfigMock).toHaveBeenLastCalledWith({
      path: {
        deploymentName: "demo-app",
        version: "v1",
      },
      body: {
        projectConfigId: "project-beta",
      },
    });
    expect(routeCreateAppSessionCurrentMock).toHaveBeenCalledTimes(1);
    expect(frontendHost.getAppDeploymentSession()?.shareSessionId).toBe(
      refreshedSession.shareSessionId,
    );
    expect(useAppConfigs.getState().configs["project-beta"]).toEqual({
      ...projectState,
      previewSectionVariantMap: {},
    });
  });

  it("does not reset the app session for an unknown project config", async () => {
    setDeploymentAppState();
    routeLoadAppProjectConfigMock.mockResolvedValue({
      status: 404,
      hasResponse: true,
      data: {
        error: {
          code: "project_config_not_found",
          message: "Project config not found.",
        },
      },
    });

    const loaded = await loadAppDeploymentState({
      frontendHost,
      projectConfigId: "missing-project",
    });

    expect(loaded).toBe(false);
    expect(routeCreateAppSessionCurrentMock).not.toHaveBeenCalled();
    expect(routeLoadAppProjectConfigMock).toHaveBeenCalledTimes(1);
    expect(routeLoadAppProjectConfigMock).toHaveBeenCalledWith({
      path: {
        deploymentName: "demo-app",
        version: "v1",
      },
      body: {
        projectConfigId: "missing-project",
      },
    });
  });
});
