import { describe, expect, it } from "vitest";
import { buildGpuEdgeGeometry } from "./edges/edgeGeometry";
import type { GpuEdgeScene, GpuEdgeSceneEntry } from "./edges/edgeSources";
import {
  clearUploadedGpuActiveFinalizingNodeIds,
  resolveGpuActiveNodeFrameSync,
  resolveGpuFlowEdgeDrawInputs,
} from "./GpuFlow";

describe("GpuFlow edge input helpers", () => {
  it("uses scene draw inputs when a GPU edge scene is provided", () => {
    const scene = createEdgeScene();

    expect(resolveGpuFlowEdgeDrawInputs({ edgeScene: scene })).toBe(
      scene.edges,
    );
  });

  it("rejects ambiguous edge buffer and scene inputs", () => {
    const scene = createEdgeScene();

    expect(() =>
      resolveGpuFlowEdgeDrawInputs({
        edgeScene: scene,
        edges: scene.edges,
      }),
    ).toThrow("Setta GPU flow accepts either edgeScene or edges, not both.");
  });
});

describe("GpuFlow active node final settle helpers", () => {
  it("defers and suppresses a teleported active node", () => {
    expect(
      resolveGpuActiveNodeFrameSync({
        finalizingNodeIds: new Set(),
        pendingPaintNodeIds: new Set(),
        teleportedNodeId: "node-a",
      }),
    ).toEqual({
      deferUploadNodeIds: ["node-a"],
      suppressNodeIds: ["node-a"],
    });
  });

  it("keeps a restored active node suppressed until final upload", () => {
    expect(
      resolveGpuActiveNodeFrameSync({
        finalizingNodeIds: new Set(["node-a"]),
        pendingPaintNodeIds: new Set(["node-a"]),
        teleportedNodeId: null,
      }),
    ).toEqual({
      deferUploadNodeIds: ["node-a"],
      suppressNodeIds: ["node-a"],
    });

    expect(
      resolveGpuActiveNodeFrameSync({
        finalizingNodeIds: new Set(["node-a"]),
        pendingPaintNodeIds: new Set(),
        teleportedNodeId: null,
      }),
    ).toEqual({
      deferUploadNodeIds: undefined,
      suppressNodeIds: ["node-a"],
    });
  });

  it("clears final settle suppression only after the node uploads", () => {
    const finalizingNodeIds = new Set(["node-a", "node-b"]);

    expect(
      clearUploadedGpuActiveFinalizingNodeIds(finalizingNodeIds, ["node-c"]),
    ).toEqual([]);
    expect([...finalizingNodeIds]).toEqual(["node-a", "node-b"]);

    expect(
      clearUploadedGpuActiveFinalizingNodeIds(finalizingNodeIds, ["node-a"]),
    ).toEqual(["node-a"]);
    expect([...finalizingNodeIds]).toEqual(["node-b"]);
  });
});

function createEdgeScene(): GpuEdgeScene {
  const entry: GpuEdgeSceneEntry = {
    edgeId: "data:edge-a",
    family: "data",
    geometry: buildGpuEdgeGeometry({
      edgeId: "data:edge-a",
      source: { x: 0, y: 0 },
      target: { x: 10, y: 0 },
      type: "straight",
    }),
    selectable: true,
    sourceEdgeId: "edge-a",
  };
  return {
    edges: [entry],
    entries: [entry],
    hitTestEdges: [entry],
  };
}
