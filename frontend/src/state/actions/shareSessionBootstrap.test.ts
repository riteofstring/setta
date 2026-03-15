// @vitest-environment jsdom

import { useServerMode, useShareSession } from "state/stores/sessionStores";
import { resetProjectStores } from "state/utils";
import type { ShareDeploymentSessionResponse } from "utils/generatedTypes";
import { createProjectConfig, createSharePolicy } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ensureShareSessionFromCurrentDeployment,
  initializeShareSessionFromCurrentDeployment,
} from "./shareSessionBootstrap";

vi.mock("utils/generatedEndpoints", () => ({
  route_create_share_session_current: vi.fn(),
}));

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

describe("shareSessionBootstrap", () => {
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

  it("reuses the cached share session from session storage when share mode is already resolved", async () => {
    const { route_create_share_session_current } = await import(
      "utils/generatedEndpoints"
    );
    const session = buildShareSessionResponse();
    window.sessionStorage.setItem("settaShareSession", JSON.stringify(session));
    useServerMode.setState({
      mode: "share",
      modeResolved: true,
      modeError: null,
    });

    const loaded = await ensureShareSessionFromCurrentDeployment();

    expect(loaded).toEqual(session);
    expect(route_create_share_session_current).not.toHaveBeenCalled();
    expect(useShareSession.getState().shareSessionId).toBe("share-session-1");
  });

  it("clears share session state when the server is already resolved to non-share mode", async () => {
    useServerMode.setState({
      mode: "ide",
      modeResolved: true,
      modeError: null,
    });
    useShareSession.setState({
      isDeploymentMode: true,
      deploymentMode: "share",
      shareSessionId: "share-session-1",
      sessionRunCount: 2,
      sharePolicy: createSharePolicy(),
      shareDeploymentName: "demo-share",
      shareDeploymentVersion: "v1",
    });
    window.sessionStorage.setItem(
      "settaShareSession",
      JSON.stringify(buildShareSessionResponse()),
    );

    const recovered = await initializeShareSessionFromCurrentDeployment();

    expect(recovered).toBe(false);
    expect(useShareSession.getState().shareSessionId).toBeNull();
    expect(window.sessionStorage.getItem("settaShareSession")).toBeNull();
  });
});
