import { describe, expect, it } from "vitest";
import { buildGpuEdgeGeometry } from "./edgeGeometry";
import {
  GPU_EDGE_ACTIVE_FLAG,
  GPU_EDGE_SELECTED_FLAG,
  buildGpuEdgeLineListBufferData,
} from "./edgeGpuBuffers";

describe("GPU edge buffer data", () => {
  it("builds viewport-independent line-list vertices sorted by z index", () => {
    const straight = buildGpuEdgeGeometry({
      edgeId: "straight",
      source: { x: 0, y: 0 },
      target: { x: 100, y: 0 },
      type: "straight",
    });
    const bezier = buildGpuEdgeGeometry({
      edgeId: "bezier",
      source: { x: 0, y: 0 },
      sourceSide: "bottom",
      target: { x: 100, y: 100 },
      targetSide: "top",
      type: "bezier",
    });

    const result = buildGpuEdgeLineListBufferData({
      bezierSegments: 2,
      edges: [
        {
          active: true,
          edgeId: "bezier",
          geometry: bezier,
          zIndex: 2,
        },
        {
          edgeId: "straight",
          geometry: straight,
          selected: true,
          zIndex: 1,
        },
      ],
    });

    expect(result.ranges).toEqual([
      { edgeId: "straight", vertexCount: 2, vertexOffset: 0 },
      { edgeId: "bezier", vertexCount: 4, vertexOffset: 2 },
    ]);
    expect(result.vertexCount).toBe(6);
    expect(Array.from(result.vertexData)).toEqual([
      0,
      0,
      0,
      GPU_EDGE_SELECTED_FLAG,
      100,
      0,
      0,
      GPU_EDGE_SELECTED_FLAG,
      0,
      0,
      1,
      GPU_EDGE_ACTIVE_FLAG,
      50,
      50,
      1,
      GPU_EDGE_ACTIVE_FLAG,
      50,
      50,
      1,
      GPU_EDGE_ACTIVE_FLAG,
      100,
      100,
      1,
      GPU_EDGE_ACTIVE_FLAG,
    ]);
  });
});
