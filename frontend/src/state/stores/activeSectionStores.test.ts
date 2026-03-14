import type { Node } from "forks/xyflow/core/types";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetProjectStores } from "../utils";
import {
  runWithAtomicallyPublishedProjectStores,
  useActiveSectionUI,
  useNodeInternals,
} from "./activeSectionStores";
import { useProjectState } from "./projectStores";

describe("activeSectionStores", () => {
  beforeEach(() => {
    resetProjectStores();
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("publishes staged project, node, and active-section state during the callback only", () => {
    useProjectState.setState((state) => {
      state.projectConfig.id = "project-raw";
    });
    useActiveSectionUI.setState({
      activeIds: ["section-raw"],
      selectionGeneration: 3,
    });

    const publishedProjectState = {
      ...useProjectState.getState(),
      projectConfig: {
        ...useProjectState.getState().projectConfig,
        id: "project-published",
      },
    };
    const publishedNodeInternals = {
      x: new Map<string, Node>(),
    };

    let observedProjectId = "";
    let observedActiveIds: Array<string> = [];
    let observedNodeInternals: Map<string, Node> | null = null;

    runWithAtomicallyPublishedProjectStores(
      {
        projectState: publishedProjectState,
        nodeInternals: publishedNodeInternals,
        activeSectionUI: { activeIds: ["section-published"] },
      },
      () => {
        observedProjectId = useProjectState.getState().projectConfig.id;
        observedActiveIds = useActiveSectionUI.getState().activeIds;
        observedNodeInternals = useNodeInternals.getState().x;
      },
    );

    expect(observedProjectId).toBe("project-published");
    expect(observedActiveIds).toEqual(["section-published"]);
    expect(observedNodeInternals).toBe(publishedNodeInternals.x);
    expect(useProjectState.getState().projectConfig.id).toBe("project-raw");
    expect(useActiveSectionUI.getState().activeIds).toEqual(["section-raw"]);
    expect(useNodeInternals.getState().x).not.toBe(publishedNodeInternals.x);
  });

  it("merges partial active-section publications with the raw store state", () => {
    useActiveSectionUI.setState({
      activeIds: ["section-raw"],
      selectionGeneration: 5,
      backendGeneration: 4,
    });

    runWithAtomicallyPublishedProjectStores(
      {
        projectState: useProjectState.getState(),
        nodeInternals: { x: new Map<string, Node>() },
        activeSectionUI: { activeIds: ["section-published"] },
      },
      () => {
        const state = useActiveSectionUI.getState();
        expect(state.activeIds).toEqual(["section-published"]);
        expect(state.selectionGeneration).toBe(5);
        expect(state.backendGeneration).toBe(4);
      },
    );
  });
});
