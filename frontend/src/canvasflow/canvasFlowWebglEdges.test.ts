import { describe, expect, it } from "vitest";
import type { CanvasFlowDrawableEdge } from "./canvasFlowTypes";
import {
  buildCanvasFlowWebglStrokeVertices,
  getCanvasFlowWebglEdgeLabelScreenRect,
  parseCanvasFlowWebglColor,
} from "./canvasFlowWebglEdges";

describe("canvasFlowWebglEdges", () => {
  it("tessellates a horizontal line segment into two triangles", () => {
    expect(
      Array.from(
        buildCanvasFlowWebglStrokeVertices({
          lineWidth: 4,
          points: [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
          ],
        }),
      ),
    ).toEqual([0, 2, 10, 2, 0, -2, 0, -2, 10, 2, 10, -2]);
  });

  it("skips dash gaps while preserving line width", () => {
    expect(
      Array.from(
        buildCanvasFlowWebglStrokeVertices({
          dashPattern: [4, 4],
          lineWidth: 2,
          points: [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
          ],
        }),
      ),
    ).toEqual([
      0, 1, 4, 1, 0, -1, 0, -1, 4, 1, 4, -1, 8, 1, 10, 1, 8, -1, 8, -1, 10, 1,
      10, -1,
    ]);
  });

  it("parses supported CSS color forms into WebGL rgba values", () => {
    expect(parseCanvasFlowWebglColor("#336699", 0.5)).toEqual([
      0.2, 0.4, 0.6, 0.5,
    ]);
    expect(parseCanvasFlowWebglColor("rgba(255, 128, 0, 0.25)")).toEqual([
      1,
      128 / 255,
      0,
      0.25,
    ]);
  });

  it("projects edge label layout into screen coordinates", () => {
    expect(
      getCanvasFlowWebglEdgeLabelScreenRect({
        edge: createEdge({
          label: "Ready",
          source: { x: 10, y: 30 },
          target: { x: 210, y: 70 },
        }),
        viewport: { x: 20, y: 30, zoom: 0.5 },
      }),
    ).toEqual({
      height: 10,
      width: 40,
      x: 55,
      y: 50,
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
    selectable: true,
    zIndex: 0,
    ...overrides,
  };
}
