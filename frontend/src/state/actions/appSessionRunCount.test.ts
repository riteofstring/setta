// @vitest-environment jsdom

import { useShareSession } from "state/stores/sessionStores";
import { resetProjectStores } from "state/utils";
import type { AppDeploymentSessionResponse } from "utils/generatedTypes";
import { createSharePolicy } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { incrementAppSessionRunCount } from "./appSessionRunCount";

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

describe("appSessionRunCount", () => {
  beforeEach(() => {
    resetProjectStores();
    window.sessionStorage.clear();
  });

  afterEach(() => {
    resetProjectStores();
    window.sessionStorage.clear();
  });

  it("persists the incremented run count back to session storage", () => {
    // App actions should keep the in-memory session counter and persisted session snapshot in sync.
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
});
