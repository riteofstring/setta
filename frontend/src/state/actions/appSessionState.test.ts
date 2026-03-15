// @vitest-environment jsdom

import { useAppConfigs } from "state/stores/appStores";
import {
  useAllProjectMetadata,
  useServerMode,
  useShareSession,
} from "state/stores/sessionStores";
import { resetProjectStores } from "state/utils";
import type { AppDeploymentSessionResponse } from "utils/generatedTypes";
import {
  createProjectConfig,
  createProjectStateSingleConfig,
  createSharePolicy,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ensureAppSessionFromCurrentDeployment,
  incrementAppSessionRunCount,
  initializeAppSessionFromCurrentDeployment,
} from "./appSessionState";

vi.mock("utils/generatedEndpoints", () => ({
  route_create_app_session_current: vi.fn(),
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

describe("appSessionState", () => {
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

  it("reuses the cached app session from session storage", async () => {
    const { route_create_app_session_current } = await import(
      "utils/generatedEndpoints"
    );
    const session = buildAppSessionResponse();
    window.sessionStorage.setItem("settaAppSession", JSON.stringify(session));
    useServerMode.setState({
      mode: "app",
      modeResolved: true,
      modeError: null,
    });

    const loaded = await ensureAppSessionFromCurrentDeployment();

    expect(loaded).toEqual(session);
    expect(route_create_app_session_current).not.toHaveBeenCalled();
    expect(useShareSession.getState().shareSessionId).toBe("app-session-1");
    expect(useAllProjectMetadata.getState().defaultProjectConfigId).toBe(
      "config-1",
    );
  });

  it("persists the incremented run count back to session storage", async () => {
    const session = buildAppSessionResponse();
    window.sessionStorage.setItem("settaAppSession", JSON.stringify(session));
    useShareSession.setState({
      isDeploymentMode: true,
      deploymentMode: "app",
      shareSessionId: session.shareSessionId,
      sessionRunCount: session.sessionRunCount,
      sharePolicy: session.appPolicy,
      shareDeploymentName: session.deploymentName,
      shareDeploymentVersion: session.deploymentVersion,
    });

    incrementAppSessionRunCount();

    expect(useShareSession.getState().sessionRunCount).toBe(3);
    expect(
      JSON.parse(
        window.sessionStorage.getItem("settaAppSession") ?? "null",
      ) as AppDeploymentSessionResponse | null,
    ).toMatchObject({
      shareSessionId: "app-session-1",
      sessionRunCount: 3,
    });
  });

  it("clears app session state when the server is already resolved to non-app mode", async () => {
    useServerMode.setState({
      mode: "ide",
      modeResolved: true,
      modeError: null,
    });
    useShareSession.setState({
      isDeploymentMode: true,
      deploymentMode: "app",
      shareSessionId: "app-session-1",
      sessionRunCount: 2,
      sharePolicy: createSharePolicy(),
      shareDeploymentName: "demo-app",
      shareDeploymentVersion: "v1",
    });
    useAllProjectMetadata.setState({
      defaultProjectConfigId: "config-1",
      projectMetadata: [],
    });
    useAppConfigs.setState({
      configs: {
        "config-1": {
          ...createProjectStateSingleConfig({
            projectConfig: createProjectConfig({ id: "config-1" }),
          }),
          previewSectionVariantMap: {},
        },
      },
    });
    window.sessionStorage.setItem(
      "settaAppSession",
      JSON.stringify(buildAppSessionResponse()),
    );

    const recovered = await initializeAppSessionFromCurrentDeployment();

    expect(recovered).toBe(false);
    expect(useShareSession.getState().shareSessionId).toBeNull();
    expect(useAllProjectMetadata.getState().defaultProjectConfigId).toBeNull();
    expect(useAppConfigs.getState().configs).toEqual({});
    expect(window.sessionStorage.getItem("settaAppSession")).toBeNull();
  });
});
