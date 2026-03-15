// @vitest-environment jsdom

import {
  useAllProjectMetadata,
  useServerMode,
  useShareSession,
} from "state/stores/sessionStores";
import { resetProjectStores } from "state/utils";
import type { ShareDeploymentSessionResponse } from "utils/generatedTypes";
import { createProjectConfig, createSharePolicy } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  hydrateShareSessionFromStorage,
  resetShareSessionState,
  setShareSessionFromResponse,
} from "./shareSessionStoredState";

function buildShareSessionResponse(): ShareDeploymentSessionResponse {
  return {
    deploymentName: "demo-share",
    deploymentVersion: "v1",
    shareSessionId: "share-session-1",
    sessionRunCount: 2,
    defaultProjectConfigId: "config-1",
    projectMetadata: [createProjectConfig({ id: "config-1", name: "Project" })],
    sharePolicy: createSharePolicy({ allowRun: true, allowLLM: true }),
    manifest: null,
  };
}

describe("shareSessionStoredState", () => {
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

  it("hydrates the stored share session into the session and metadata stores", () => {
    // Stored share sessions should fully restore deployment-mode state on reload.
    const session = buildShareSessionResponse();
    window.sessionStorage.setItem("settaShareSession", JSON.stringify(session));

    const hydrated = hydrateShareSessionFromStorage();

    expect(hydrated).toEqual(session);
    expect(useShareSession.getState()).toMatchObject({
      isDeploymentMode: true,
      deploymentMode: "share",
      shareSessionId: "share-session-1",
      sessionRunCount: 2,
      shareDeploymentName: "demo-share",
      shareDeploymentVersion: "v1",
    });
    expect(useAllProjectMetadata.getState()).toMatchObject({
      defaultProjectConfigId: "config-1",
      projectMetadata: session.projectMetadata,
    });
    expect(useServerMode.getState()).toMatchObject({
      mode: "share",
      modeResolved: true,
      modeError: null,
    });
  });

  it("clears persisted share-session state and store state during reset", () => {
    // Forced session replacement should wipe storage and reset the session stores.
    const session = buildShareSessionResponse();
    setShareSessionFromResponse(session);

    resetShareSessionState();

    expect(window.sessionStorage.getItem("settaShareSession")).toBeNull();
    expect(useShareSession.getState().shareSessionId).toBeNull();
    expect(useAllProjectMetadata.getState().defaultProjectConfigId).toBeNull();
  });
});
