import type { Node } from "gpuFlow/flowTypes";
import { createGpuFlowLayoutStore } from "gpuFlow/layoutStore";
import { describe, expect, it } from "vitest";

import {
  getProjectGpuLayoutNode,
  getProjectGpuLayoutNodesFromNodeInternals,
  syncProjectGpuLayoutStoreFromNodeInternals,
} from "./projectGpuLayoutAdapter";

describe("project GPU layout adapter", () => {
  it("maps project node internals into renderer layout nodes", () => {
    const node = projectNode("section-a", {
      height: null,
      position: { x: 10, y: 20 },
      tempZIndex: 7,
      width: 120,
      zIndex: 3,
    });

    expect(getProjectGpuLayoutNode(node)).toEqual({
      height: null,
      nodeId: "section-a",
      tempZIndex: 7,
      width: 120,
      x: 10,
      y: 20,
      zIndex: 3,
    });
    expect(
      getProjectGpuLayoutNodesFromNodeInternals({
        x: new Map([[node.id, node]]),
      }),
    ).toEqual([getProjectGpuLayoutNode(node)]);
  });

  it("replaces the renderer layout store from authoritative project state", () => {
    const store = createGpuFlowLayoutStore({
      nodes: [
        {
          height: 40,
          nodeId: "stale-section",
          width: 80,
          x: 0,
          y: 0,
          zIndex: 1,
        },
      ],
    });
    const current = projectNode("current-section", {
      height: 60,
      position: { x: 100, y: 140 },
      width: 180,
      zIndex: 2,
    });

    const change = syncProjectGpuLayoutStoreFromNodeInternals(store, {
      x: new Map([[current.id, current]]),
    });

    expect(change).toMatchObject({
      changedNodeIds: ["stale-section", "current-section"],
      phase: "commit",
      reason: "project-sync",
    });
    expect(store.getState().getNodes()).toEqual([
      {
        height: 60,
        nodeId: "current-section",
        tempZIndex: 2,
        width: 180,
        x: 100,
        y: 140,
        zIndex: 2,
      },
    ]);
    expect(store.getState().dirty).toEqual([
      "node-geometry",
      "edge-geometry",
      "selection-bounds",
      "visible-set",
      "texture-size",
      "source-size",
    ]);
  });
});

function projectNode(
  id: string,
  overrides: Partial<Omit<Node, "id">> = {},
): Node {
  return {
    height: 50,
    id,
    position: { x: 0, y: 0 },
    tempZIndex: overrides.zIndex ?? 1,
    width: 100,
    zIndex: 1,
    ...overrides,
  };
}
