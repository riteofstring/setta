// @vitest-environment jsdom

import { useAppConfigs, useAppDefinition } from "state/stores/appStores";
import {
  useAllProjectMetadata,
  useServerMode,
  useShareSession,
} from "state/stores/sessionStores";
import { resetProjectStores } from "state/utils";
import type { AppDeploymentSessionResponse } from "utils/generatedTypes";
import {
  createAppDefinition,
  createProjectConfig,
  createProjectStateSingleConfig,
  createSharePolicy,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  hydrateAppSessionFromStorage,
  resetAppSessionState,
} from "./appSessionStoredState";

function buildAppSessionResponse(): AppDeploymentSessionResponse {
  return {
    deploymentName: "demo-app",
    deploymentVersion: "v1",
    shareSessionId: "app-session-1",
    sessionRunCount: 2,
    defaultProjectConfigId: "config-1",
    projectMetadata: [createProjectConfig({ id: "config-1", name: "Project" })],
    appPolicy: createSharePolicy({ allowRun: true }),
    manifest: null,
  };
}

describe("appSessionStoredState", () => {
  beforeEach(() => {
    resetProjectStores();
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

  it("hydrates app session stores from the stored deployment session", () => {
    // App-mode refreshes should restore the deployment session before any network round trip.
    const session = buildAppSessionResponse();
    window.sessionStorage.setItem("settaAppSession", JSON.stringify(session));

    expect(hydrateAppSessionFromStorage()).toEqual(session);
    expect(useShareSession.getState()).toMatchObject({
      isDeploymentMode: true,
      deploymentMode: "app",
      shareSessionId: "app-session-1",
      sessionRunCount: 2,
      shareDeploymentName: "demo-app",
      shareDeploymentVersion: "v1",
    });
    expect(useServerMode.getState()).toMatchObject({
      mode: "app",
      modeResolved: true,
      modeError: null,
    });
    expect(useAllProjectMetadata.getState()).toMatchObject({
      defaultProjectConfigId: "config-1",
      projectMetadata: session.projectMetadata,
    });
  });

  it("clears stored deployment state and app caches when reset", () => {
    // Forced app-session replacement should wipe both session storage and the deployment-only caches.
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
      projectMetadata: [createProjectConfig({ id: "config-1" })],
    });
    useAppDefinition.setState({
      appDefinition: createAppDefinition({ catalogId: "demo.catalog" }),
      appSpec: { root: "root-1" },
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

    resetAppSessionState();

    expect(useShareSession.getState().shareSessionId).toBeNull();
    expect(useAllProjectMetadata.getState().defaultProjectConfigId).toBeNull();
    expect(useAppDefinition.getState()).toMatchObject({
      appDefinition: null,
      appSpec: null,
    });
    expect(useAppConfigs.getState().configs).toEqual({});
    expect(window.sessionStorage.getItem("settaAppSession")).toBeNull();
  });
});
