import { describe, expect, it } from "vitest";
import { runWithAtomicallyPublishedProjectStores } from "./atomicProjectStorePublication";
import {
  useActiveSectionUI,
  useNodeInternals,
  useProjectState,
} from "./storeDefinitions";
import { resetProjectStores } from "./utils";

describe("atomicProjectStorePublication", () => {
  it("publishes staged project, node, and active-section state atomically", () => {
    resetProjectStores();

    useProjectState.setState((state) => {
      state.projectConfig.id = "project-live";
    });
    useNodeInternals.setState({
      x: new Map([["node-live", { id: "node-live" }]]),
    });
    useActiveSectionUI.setState({
      activeIds: ["section-live"],
      selectionGeneration: 3,
    });

    const liveProjectIdBefore = useProjectState.getState().projectConfig.id;
    const liveNodeIdsBefore = [...useNodeInternals.getState().x.keys()];
    const liveActiveIdsBefore = useActiveSectionUI.getState().activeIds;

    const stagedProjectState = {
      ...useProjectState.getState(),
      projectConfig: {
        ...useProjectState.getState().projectConfig,
        id: "project-staged",
      },
    };
    const stagedNodeInternals = {
      x: new Map([["node-staged", { id: "node-staged" }]]),
    };

    let observedProjectId: string | null = null;
    let observedNodeIds: Array<string> = [];
    let observedActiveIds: Array<string> = [];
    let observedSelectionGeneration: number | null = null;

    runWithAtomicallyPublishedProjectStores(
      {
        projectState: stagedProjectState,
        nodeInternals: stagedNodeInternals,
        activeSectionUI: {
          activeIds: ["section-staged"],
          selectionGeneration: 8,
        },
      },
      () => {
        observedProjectId = useProjectState.getState().projectConfig.id;
        observedNodeIds = [...useNodeInternals.getState().x.keys()];
        observedActiveIds = useActiveSectionUI.getState().activeIds;
        observedSelectionGeneration =
          useActiveSectionUI.getState().selectionGeneration;
      },
    );

    expect(observedProjectId).toBe("project-staged");
    expect(observedNodeIds).toEqual(["node-staged"]);
    expect(observedActiveIds).toEqual(["section-staged"]);
    expect(observedSelectionGeneration).toBe(8);

    expect(useProjectState.getState().projectConfig.id).toBe(
      liveProjectIdBefore,
    );
    expect([...useNodeInternals.getState().x.keys()]).toEqual(
      liveNodeIdsBefore,
    );
    expect(useActiveSectionUI.getState().activeIds).toEqual(
      liveActiveIdsBefore,
    );
  });
});
