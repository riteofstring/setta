import type { GetAppDeploymentCurrentSessionResponses } from "openapi/http";
import { createRuntimeAppSubsystemFrontendHost } from "plugins/appSubsystemFrontendHost";
import {
  useAllProjectMetadata,
  useServerMode,
  useShareSession,
} from "state/definitions";
import {
  createPolicy,
  createProjectConfig,
  createSingleConfig,
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
import { createAppDefinition } from "../../../src/appSubsystemContracts";
import { useAppDefinition } from "../../../src/appSubsystemDefinitionState";
import { useAppConfigs } from "../../../src/appSubsystemProjectState";

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
  loadAppDeploymentState,
  resetAppSessionState,
} from "../../../src/state/actions/app";

type AppDeploymentSession = GetAppDeploymentCurrentSessionResponses[200];
const frontendHost = createRuntimeAppSubsystemFrontendHost();

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
  useShareSession.setState({
    isDeploymentMode: true,
    shareSessionId: resolved.shareSessionId,
    sessionRunCount: resolved.sessionRunCount,
    sharePolicy: resolved.appPolicy,
    shareDeploymentName: resolved.deploymentName,
    shareDeploymentVersion: resolved.deploymentVersion,
    deploymentMode: "app",
  });
  useServerMode.setState({
    mode: "app",
    modeResolved: true,
    modeError: null,
  });
  useAllProjectMetadata.setState({
    defaultProjectConfigId: resolved.defaultProjectConfigId,
    projectMetadata: resolved.projectMetadata,
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
    resetAppSessionState(frontendHost);
    useServerMode.setState({
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
    expect(useShareSession.getState()).toMatchObject({
      isDeploymentMode: true,
      shareSessionId: session.shareSessionId,
      shareDeploymentName: session.deploymentName,
      shareDeploymentVersion: session.deploymentVersion,
      deploymentMode: "app",
    });
    expect(useAllProjectMetadata.getState()).toMatchObject({
      defaultProjectConfigId: session.defaultProjectConfigId,
      projectMetadata: session.projectMetadata,
    });
    expect(useServerMode.getState()).toEqual({
      mode: "app",
      modeResolved: true,
      modeError: null,
    });
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
    expect(useShareSession.getState().shareSessionId).toBe(
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
