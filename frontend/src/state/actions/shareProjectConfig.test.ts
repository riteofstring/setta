import { useProjectLoading } from "state/stores/projectStatusStores";
import { useShareSession } from "state/stores/sessionStores";
import { resetProjectStores } from "state/utils";
import { createSharePolicy } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { loadShareProjectConfig } from "./shareProjectConfig";

vi.mock("state/actions/aiFollow", () => ({
  requestAIFollowSnapshot: vi.fn(),
}));

vi.mock("state/actions/project/loadProject", () => ({
  loadProjectState: vi.fn(),
}));

vi.mock("./shareSessionBootstrap", () => ({
  ensureShareSessionFromCurrentDeployment: vi.fn(),
}));

vi.mock("utils/generatedEndpoints", () => ({
  route_load_share_project_config: vi.fn(),
}));

describe("shareProjectConfig", () => {
  beforeEach(() => {
    resetProjectStores();
    vi.clearAllMocks();
    useShareSession.setState({
      isDeploymentMode: true,
      deploymentMode: "share",
      shareSessionId: "share-session-1",
      sessionRunCount: 2,
      sharePolicy: createSharePolicy({ allowLLM: true }),
      shareDeploymentName: "demo-share",
      shareDeploymentVersion: "v1",
    });
    useProjectLoading.setState({
      projectIsLoading: false,
      projectIs404: false,
    });
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("retries once with a fresh share session after a 404 and then loads the project config", async () => {
    const { requestAIFollowSnapshot } = await import("state/actions/aiFollow");
    const { loadProjectState } = await import(
      "state/actions/project/loadProject"
    );
    const { ensureShareSessionFromCurrentDeployment } = await import(
      "./shareSessionBootstrap"
    );
    const { route_load_share_project_config } = await import(
      "utils/generatedEndpoints"
    );
    vi.mocked(route_load_share_project_config)
      .mockResolvedValueOnce({
        data: undefined,
        status: 404,
        hasResponse: true,
      })
      .mockResolvedValueOnce({
        data: {
          projectState: { projectConfig: { id: "config-1" } },
        },
        status: 200,
        hasResponse: true,
      });
    vi.mocked(ensureShareSessionFromCurrentDeployment).mockResolvedValue({
      deploymentName: "demo-share",
      deploymentVersion: "v1",
      shareSessionId: "share-session-2",
      sessionRunCount: 1,
      defaultProjectConfigId: "config-1",
      projectMetadata: [],
      sharePolicy: createSharePolicy({ allowLLM: true }),
      manifest: null,
    });

    const loaded = await loadShareProjectConfig({
      projectConfigId: "config-1",
    });

    expect(loaded).toBe(true);
    expect(route_load_share_project_config).toHaveBeenCalledTimes(2);
    expect(ensureShareSessionFromCurrentDeployment).toHaveBeenCalledWith({
      forceNewSession: true,
    });
    expect(loadProjectState).toHaveBeenCalledWith({
      projectConfig: { id: "config-1" },
    });
    expect(requestAIFollowSnapshot).toHaveBeenCalledWith("config-1");
    expect(useProjectLoading.getState()).toMatchObject({
      projectIsLoading: false,
      projectIs404: false,
    });
  });
});
