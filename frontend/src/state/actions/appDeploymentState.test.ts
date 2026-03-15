// @vitest-environment jsdom

import { useAppConfigs, useAppDefinition } from "state/stores/appStores";
import { useProjectLoading } from "state/stores/projectStatusStores";
import { useServerMode, useShareSession } from "state/stores/sessionStores";
import { resetProjectStores } from "state/utils";
import type { AppDeploymentSessionResponse } from "utils/generatedTypes";
import {
  createAppDefinition,
  createProjectConfig,
  createProjectStateSingleConfig,
  createSharePolicy,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ensureAppProjectConfigLoaded,
  loadAppDeploymentState,
  resetAppDeployment,
} from "./appDeploymentState";

vi.mock("utils/generatedEndpoints", () => ({
  route_create_app_session_current: vi.fn(),
  route_get_app_deployment_state: vi.fn(),
  route_load_app_project_config: vi.fn(),
}));

function buildAppSessionResponse(): AppDeploymentSessionResponse {
  return {
    deploymentName: "demo-app",
    deploymentVersion: "v1",
    shareSessionId: "app-session-1",
    sessionRunCount: 2,
    defaultProjectConfigId: "config-1",
    projectMetadata: [],
    appPolicy: createSharePolicy({ allowRun: true }),
    manifest: null,
  };
}

describe("appDeploymentState", () => {
  beforeEach(() => {
    resetProjectStores();
    vi.clearAllMocks();
    window.sessionStorage.clear();
    document.cookie = "shareSessionId=; path=/; Max-Age=0; SameSite=Lax";
    useServerMode.setState({
      mode: null,
      modeResolved: false,
      modeError: null,
    });
  });

  afterEach(() => {
    resetProjectStores();
    window.sessionStorage.clear();
    document.cookie = "shareSessionId=; path=/; Max-Age=0; SameSite=Lax";
    useServerMode.setState({
      mode: null,
      modeResolved: false,
      modeError: null,
    });
  });

  it("returns false when app deployment state is requested without an app session", async () => {
    const { route_get_app_deployment_state } = await import(
      "utils/generatedEndpoints"
    );

    const loaded = await loadAppDeploymentState();

    expect(loaded).toBe(false);
    expect(route_get_app_deployment_state).not.toHaveBeenCalled();
  });

  it("hydrates app definition and cached config state from the deployment payload", async () => {
    const { route_get_app_deployment_state } = await import(
      "utils/generatedEndpoints"
    );
    const appDefinition = createAppDefinition({ catalogId: "demo.catalog" });
    const projectState = createProjectStateSingleConfig({
      projectConfig: createProjectConfig({ id: "config-1" }),
    });
    useShareSession.setState({
      isDeploymentMode: true,
      deploymentMode: "app",
      shareSessionId: "app-session-1",
      sessionRunCount: 2,
      sharePolicy: createSharePolicy({ allowRun: true }),
      shareDeploymentName: "demo-app",
      shareDeploymentVersion: "v1",
    });
    vi.mocked(route_get_app_deployment_state).mockResolvedValue({
      status: 200,
      data: {
        appDefinition,
        appSpec: { root: "root-1" },
        projectState,
      },
      hasResponse: true,
    });

    const loaded = await loadAppDeploymentState();

    expect(loaded).toBe(true);
    expect(useAppDefinition.getState()).toMatchObject({
      appDefinition,
      appSpec: { root: "root-1" },
    });
    expect(useAppConfigs.getState().configs["config-1"]).toMatchObject({
      projectConfig: { id: "config-1" },
      previewSectionVariantMap: {},
    });
  });

  it("loads a missing config by project config id and caches it", async () => {
    const { route_load_app_project_config } = await import(
      "utils/generatedEndpoints"
    );
    const projectState = createProjectStateSingleConfig({
      projectConfig: createProjectConfig({ id: "config-2" }),
    });
    useShareSession.setState({
      isDeploymentMode: true,
      deploymentMode: "app",
      shareSessionId: "app-session-1",
      sessionRunCount: 2,
      sharePolicy: createSharePolicy({ allowRun: true }),
      shareDeploymentName: "demo-app",
      shareDeploymentVersion: "v1",
    });
    vi.mocked(route_load_app_project_config).mockResolvedValue({
      status: 200,
      data: {
        appDefinition: null,
        appSpec: null,
        projectState,
      },
      hasResponse: true,
    });

    const loaded = await ensureAppProjectConfigLoaded("config-2");

    expect(loaded).toBe(true);
    expect(route_load_app_project_config).toHaveBeenCalledWith(
      "demo-app",
      "v1",
      { projectConfigId: "config-2" },
    );
    expect(useAppConfigs.getState().configs["config-2"]).toMatchObject({
      projectConfig: { id: "config-2" },
      previewSectionVariantMap: {},
    });
  });

  it("restarts app deployment by refreshing session and deployment state", async () => {
    const { route_create_app_session_current, route_get_app_deployment_state } =
      await import("utils/generatedEndpoints");
    const session = buildAppSessionResponse();
    const projectState = createProjectStateSingleConfig({
      projectConfig: createProjectConfig({ id: "config-1" }),
    });
    vi.mocked(route_create_app_session_current).mockResolvedValue({
      status: 200,
      data: session,
      hasResponse: true,
    });
    vi.mocked(route_get_app_deployment_state).mockResolvedValue({
      status: 200,
      data: {
        appDefinition: createAppDefinition({ catalogId: "demo.catalog" }),
        appSpec: { root: "root-1" },
        projectState,
      },
      hasResponse: true,
    });

    const reset = await resetAppDeployment();

    expect(reset).toBe(true);
    expect(useProjectLoading.getState()).toMatchObject({
      projectIsLoading: false,
      projectIs404: false,
    });
    expect(useShareSession.getState().shareSessionId).toBe("app-session-1");
    expect(useAppConfigs.getState().configs["config-1"]).toBeDefined();
  });
});
