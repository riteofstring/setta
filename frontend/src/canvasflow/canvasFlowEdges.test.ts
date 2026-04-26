import { HandlePosition } from "forks/xyflow/core/types";
import { makeEdgeHandleKey } from "state/actions/edgeHandles";
import { describe, expect, it } from "vitest";
import {
  getBezierControls,
  getCanvasFlowConnectionPreviewEdge,
  getCanvasFlowEdgeHit,
  getCanvasFlowEdgePolyline,
  getCanvasFlowEdgeStroke,
} from "./canvasFlowEdges";
import type { CanvasFlowDrawableEdge } from "./canvasFlowTypes";

describe("canvasFlowEdges", () => {
  it("computes horizontal bezier controls for left-right handles", () => {
    expect(
      getBezierControls({
        source: { x: 0, y: 10 },
        target: { x: 100, y: 30 },
        sourcePosition: HandlePosition.Right,
        targetPosition: HandlePosition.Left,
      }),
    ).toEqual({
      sourceControl: { x: 50, y: 10 },
      targetControl: { x: 50, y: 30 },
    });
  });

  it("uses curvature offset when target is behind the source", () => {
    const controls = getBezierControls({
      source: { x: 100, y: 0 },
      target: { x: 0, y: 0 },
      sourcePosition: HandlePosition.Right,
      targetPosition: HandlePosition.Left,
      curvature: 0.25,
    });

    expect(controls.sourceControl.x).toBeGreaterThan(100);
    expect(controls.targetControl.x).toBeLessThan(0);
  });

  it("hit-tests straight edge paths in world coordinates", () => {
    const edge = createEdge({
      id: "edge-a",
      pathType: "straight",
      source: { x: 0, y: 0 },
      target: { x: 100, y: 0 },
    });

    expect(
      getCanvasFlowEdgeHit({
        edges: [edge],
        point: { x: 50, y: 8 },
        viewport: { x: 0, y: 0, zoom: 1 },
      })?.edge.id,
    ).toBe("edge-a");
    expect(
      getCanvasFlowEdgeHit({
        edges: [edge],
        point: { x: 50, y: 18 },
        viewport: { x: 0, y: 0, zoom: 1 },
      }),
    ).toBeNull();
  });

  it("returns reconnectable endpoint hits before path hits", () => {
    const edge = createEdge({
      id: "edge-a",
      reconnectable: true,
      source: { x: 0, y: 0 },
      target: { x: 100, y: 0 },
    });

    const hit = getCanvasFlowEdgeHit({
      edges: [edge],
      point: { x: 4, y: 3 },
      viewport: { x: 0, y: 0, zoom: 1 },
    });

    expect(hit?.edge.id).toBe("edge-a");
    expect(hit?.endpoint).toBe("source");
  });

  it("keeps edge hit radii stable in screen pixels across zoom", () => {
    const edge = createEdge({
      id: "edge-a",
      pathType: "straight",
      source: { x: 0, y: 0 },
      target: { x: 100, y: 0 },
    });

    expect(
      getCanvasFlowEdgeHit({
        edges: [edge],
        point: { x: 50, y: 6 },
        viewport: { x: 0, y: 0, zoom: 2 },
      }),
    ).toBeNull();
  });

  it("ignores nonselectable and missing edge records", () => {
    const edges = [
      createEdge({ id: "prompt", selectable: false }),
      createEdge({ id: "missing", missing: true }),
    ];

    expect(
      getCanvasFlowEdgeHit({
        edges,
        point: { x: 50, y: 0 },
        viewport: { x: 0, y: 0, zoom: 1 },
      }),
    ).toBeNull();
  });

  it("prefers the last drawn edge when overlapping paths are hit", () => {
    const first = createEdge({ id: "first" });
    const second = createEdge({ id: "second" });

    expect(
      getCanvasFlowEdgeHit({
        edges: [first, second],
        point: { x: 50, y: 0 },
        viewport: { x: 0, y: 0, zoom: 1 },
      })?.edge.id,
    ).toBe("second");
  });

  it("exposes shared stroke styles for WebGL edge drawing", () => {
    expect(
      getCanvasFlowEdgeStroke({
        edge: createEdge({ animated: true }),
        wireColor: "#111827",
      }),
    ).toEqual({
      alpha: 1,
      color: "#111827",
      dashPattern: [8, 6],
      lineWidth: 1.25,
    });

    expect(
      getCanvasFlowEdgeStroke({
        edge: createEdge({ kind: "agentic", missing: true }),
        wireColor: "#111827",
      }),
    ).toEqual({
      alpha: 0.7,
      color: "#ef4444",
      dashPattern: [4, 8],
      lineWidth: 2,
    });
  });

  it("samples bezier edges into a polyline ending at the target", () => {
    const polyline = getCanvasFlowEdgePolyline(
      createEdge({
        source: { x: 0, y: 0 },
        target: { x: 100, y: 50 },
      }),
      4,
    );

    expect(polyline).toHaveLength(5);
    expect(polyline[0]).toEqual({ x: 0, y: 0 });
    expect(polyline[4]).toEqual({ x: 100, y: 50 });
  });

  it("builds connection preview edges from registered handle positions", () => {
    const previewEdge = getCanvasFlowConnectionPreviewEdge({
      connectionState: {
        connectionPosition: { x: 180, y: 90 },
        connectionStartHandle: {
          handleId: "out",
          sectionId: "source",
          type: "source",
        },
        connectionStatus: "invalid",
      },
      positions: {
        [makeEdgeHandleKey("source", "out", "source")]: {
          portId: "out",
          sectionId: "source",
          side: HandlePosition.Right,
          type: "source",
          x: 20,
          y: 30,
        },
      },
      viewport: { x: 100, y: 50, zoom: 2 },
    });

    expect(previewEdge).toMatchObject({
      source: { x: 20, y: 30 },
      target: { x: 40, y: 20 },
      sourcePosition: HandlePosition.Right,
      targetPosition: HandlePosition.Left,
      style: { stroke: "#ef4444", strokeWidth: 2 },
    });
  });
});

function createEdge(
  overrides: Partial<CanvasFlowDrawableEdge>,
): CanvasFlowDrawableEdge {
  return {
    id: "edge",
    kind: "data",
    pathType: "bezier",
    source: { x: 0, y: 0 },
    target: { x: 100, y: 0 },
    sourcePosition: HandlePosition.Right,
    targetPosition: HandlePosition.Left,
    selectable: true,
    zIndex: 0,
    ...overrides,
  };
}
