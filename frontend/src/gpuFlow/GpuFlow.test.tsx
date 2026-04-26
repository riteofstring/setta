import { describe, expect, it } from "vitest";
import { buildGpuEdgeGeometry } from "./edges/edgeGeometry";
import type { GpuEdgeScene, GpuEdgeSceneEntry } from "./edges/edgeSources";
import { resolveGpuFlowEdgeDrawInputs } from "./GpuFlow";

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
