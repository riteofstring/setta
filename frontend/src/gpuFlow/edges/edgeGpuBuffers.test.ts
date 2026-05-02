import { describe, expect, it } from "vitest";
import { buildGpuEdgeGeometry } from "./edgeGeometry";
import {
  GPU_EDGE_AGENTIC_FLAG,
  GPU_EDGE_AGENTIC_MISSING_FLAG,
  GPU_EDGE_ACTIVE_FLAG,
  GPU_EDGE_CONNECTION_INVALID_FLAG,
  GPU_EDGE_CONNECTION_VALID_FLAG,
  GPU_EDGE_CUSTOM_COLOR_FLAG,
  GPU_EDGE_SELECTED_FLAG,
  GPU_EDGE_WORKFLOW_FLAG,
  GPU_EDGE_WORKFLOW_PROMPT_LINK_FLAG,
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
      ...edgeVertex(0, 0, 0, GPU_EDGE_SELECTED_FLAG),
      ...edgeVertex(100, 0, 0, GPU_EDGE_SELECTED_FLAG),
      ...edgeVertex(0, 0, 1, GPU_EDGE_ACTIVE_FLAG),
      ...edgeVertex(50, 50, 1, GPU_EDGE_ACTIVE_FLAG),
      ...edgeVertex(50, 50, 1, GPU_EDGE_ACTIVE_FLAG),
      ...edgeVertex(100, 100, 1, GPU_EDGE_ACTIVE_FLAG),
    ]);
  });

  it("encodes per-edge custom colors into line-list vertices", () => {
    const line = buildGpuEdgeGeometry({
      edgeId: "styled",
      source: { x: 0, y: 0 },
      target: { x: 100, y: 0 },
      type: "straight",
    });
    const color = [1, 0.5, 0.25, 0.75] as const;

    const result = buildGpuEdgeLineListBufferData({
      edges: [
        {
          color,
          edgeId: "styled",
          geometry: line,
        },
      ],
    });

    expect(Array.from(result.vertexData)).toEqual([
      ...edgeVertex(0, 0, 0, GPU_EDGE_CUSTOM_COLOR_FLAG, color),
      ...edgeVertex(100, 0, 0, GPU_EDGE_CUSTOM_COLOR_FLAG, color),
    ]);
  });

  it("encodes connection preview validity separately from active state", () => {
    const line = buildGpuEdgeGeometry({
      edgeId: "preview",
      source: { x: 0, y: 0 },
      target: { x: 100, y: 0 },
      type: "straight",
    });

    const result = buildGpuEdgeLineListBufferData({
      edges: [
        {
          active: true,
          connectionStatus: "valid",
          edgeId: "valid-preview",
          geometry: line,
        },
        {
          active: true,
          connectionStatus: "invalid",
          edgeId: "invalid-preview",
          geometry: line,
        },
      ],
    });

    expect(Array.from(result.vertexData)).toEqual([
      ...edgeVertex(
        0,
        0,
        0,
        GPU_EDGE_ACTIVE_FLAG | GPU_EDGE_CONNECTION_VALID_FLAG,
      ),
      ...edgeVertex(
        100,
        0,
        0,
        GPU_EDGE_ACTIVE_FLAG | GPU_EDGE_CONNECTION_VALID_FLAG,
      ),
      ...edgeVertex(
        0,
        0,
        1,
        GPU_EDGE_ACTIVE_FLAG | GPU_EDGE_CONNECTION_INVALID_FLAG,
      ),
      ...edgeVertex(
        100,
        0,
        1,
        GPU_EDGE_ACTIVE_FLAG | GPU_EDGE_CONNECTION_INVALID_FLAG,
      ),
    ]);
  });

  it("encodes edge family visual styles separately from interaction state", () => {
    const line = buildGpuEdgeGeometry({
      edgeId: "family",
      source: { x: 0, y: 0 },
      target: { x: 26, y: 0 },
      type: "straight",
    });

    const result = buildGpuEdgeLineListBufferData({
      edges: [
        {
          active: true,
          edgeId: "agentic",
          geometry: line,
          visualFamily: "agentic",
        },
        {
          edgeId: "agentic-missing",
          geometry: line,
          visualFamily: "agentic-missing",
        },
        {
          edgeId: "workflow",
          geometry: line,
          selected: true,
          visualFamily: "workflow",
        },
        {
          edgeId: "workflow-prompt-link",
          geometry: line,
          visualFamily: "workflow-prompt-link",
        },
      ],
    });

    expect(Array.from(result.vertexData)).toEqual([
      ...edgeVertex(0, 0, 0, GPU_EDGE_ACTIVE_FLAG | GPU_EDGE_AGENTIC_FLAG),
      ...edgeVertex(7, 0, 0, GPU_EDGE_ACTIVE_FLAG | GPU_EDGE_AGENTIC_FLAG),
      ...edgeVertex(12, 0, 0, GPU_EDGE_ACTIVE_FLAG | GPU_EDGE_AGENTIC_FLAG),
      ...edgeVertex(19, 0, 0, GPU_EDGE_ACTIVE_FLAG | GPU_EDGE_AGENTIC_FLAG),
      ...edgeVertex(24, 0, 0, GPU_EDGE_ACTIVE_FLAG | GPU_EDGE_AGENTIC_FLAG),
      ...edgeVertex(26, 0, 0, GPU_EDGE_ACTIVE_FLAG | GPU_EDGE_AGENTIC_FLAG),
      ...edgeVertex(0, 0, 1, GPU_EDGE_AGENTIC_MISSING_FLAG),
      ...edgeVertex(8, 0, 1, GPU_EDGE_AGENTIC_MISSING_FLAG),
      ...edgeVertex(13, 0, 1, GPU_EDGE_AGENTIC_MISSING_FLAG),
      ...edgeVertex(21, 0, 1, GPU_EDGE_AGENTIC_MISSING_FLAG),
      ...edgeVertex(0, 0, 2, GPU_EDGE_SELECTED_FLAG | GPU_EDGE_WORKFLOW_FLAG),
      ...edgeVertex(26, 0, 2, GPU_EDGE_SELECTED_FLAG | GPU_EDGE_WORKFLOW_FLAG),
      ...edgeVertex(0, 0, 3, GPU_EDGE_WORKFLOW_PROMPT_LINK_FLAG),
      ...edgeVertex(7, 0, 3, GPU_EDGE_WORKFLOW_PROMPT_LINK_FLAG),
      ...edgeVertex(12, 0, 3, GPU_EDGE_WORKFLOW_PROMPT_LINK_FLAG),
      ...edgeVertex(19, 0, 3, GPU_EDGE_WORKFLOW_PROMPT_LINK_FLAG),
      ...edgeVertex(24, 0, 3, GPU_EDGE_WORKFLOW_PROMPT_LINK_FLAG),
      ...edgeVertex(26, 0, 3, GPU_EDGE_WORKFLOW_PROMPT_LINK_FLAG),
    ]);
    expect(result.ranges).toEqual([
      { edgeId: "agentic", vertexCount: 6, vertexOffset: 0 },
      { edgeId: "agentic-missing", vertexCount: 4, vertexOffset: 6 },
      { edgeId: "workflow", vertexCount: 2, vertexOffset: 10 },
      { edgeId: "workflow-prompt-link", vertexCount: 6, vertexOffset: 12 },
    ]);
  });
});

function edgeVertex(
  x: number,
  y: number,
  edgeIndex: number,
  flags: number,
  color: readonly [number, number, number, number] = [0, 0, 0, 0],
): number[] {
  return [x, y, edgeIndex, flags, ...color];
}
