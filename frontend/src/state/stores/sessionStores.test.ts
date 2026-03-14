import { resetProjectStores } from "state/utils";
import { createProjectConfig, createSharePolicy } from "utils/generatedTypes";
import { beforeEach, describe, expect, it } from "vitest";
import {
  useAllProjectMetadata,
  useServerMode,
  useShareSession,
} from "./sessionStores";

describe("sessionStores", () => {
  beforeEach(() => {
    resetProjectStores();
    useAllProjectMetadata.getState().reset?.();
    useServerMode.setState({
      mode: null,
      modeResolved: false,
      modeError: null,
    });
  });

  it("resets only the project-scoped share session through resetProjectStores", () => {
    // The moved share-session store is still project-scoped, while the other
    // extracted session stores remain global and should survive project resets.
    useShareSession.setState({
      isDeploymentMode: true,
      shareSessionId: "share-1",
      sessionRunCount: 3,
      sharePolicy: createSharePolicy({
        allowParamChanges: false,
        allowVariantChanges: false,
        allowLayoutChanges: false,
        allowRun: true,
        allowLLM: false,
        allowExternalLinks: false,
        allowFileDownloads: false,
        allowMultipleRuns: true,
        runSnapshotMode: "ephemeral",
      }),
      shareDeploymentName: "demo",
      shareDeploymentVersion: "v1",
      deploymentMode: "share",
    });
    useServerMode.setState({
      mode: "share",
      modeResolved: true,
      modeError: "stale",
    });
    useAllProjectMetadata.setState({
      defaultProjectConfigId: "config-a",
      projectMetadata: [
        createProjectConfig({
          id: "config-a",
          name: "Config A",
        }),
      ],
    });

    resetProjectStores();

    expect(useShareSession.getState()).toMatchObject({
      isDeploymentMode: false,
      shareSessionId: null,
      sessionRunCount: 0,
      sharePolicy: null,
      shareDeploymentName: null,
      shareDeploymentVersion: null,
      deploymentMode: null,
    });
    expect(useAllProjectMetadata.getState()).toEqual(
      expect.objectContaining({
        defaultProjectConfigId: "config-a",
        projectMetadata: [
          expect.objectContaining({
            id: "config-a",
            name: "Config A",
          }),
        ],
      }),
    );
    expect(useServerMode.getState()).toEqual({
      mode: "share",
      modeResolved: true,
      modeError: "stale",
    });
  });

  it("keeps all-project metadata on the extracted session store owner", () => {
    // Global metadata defaults should stay attached to sessionStores even
    // though definitions.ts still re-exports the store.
    expect(useAllProjectMetadata.getState()).toEqual({
      defaultProjectConfigId: null,
      projectMetadata: [],
      reset: expect.any(Function),
    });
  });
});
