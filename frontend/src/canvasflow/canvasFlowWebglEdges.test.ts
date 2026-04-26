import { describe, expect, it } from "vitest";
import {
  buildCanvasFlowWebglStrokeVertices,
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
      0, 1, 4, 1, 0, -1, 0, -1, 4, 1, 4, -1, 8, 1, 10, 1, 8, -1, 8, -1, 10,
      1, 10, -1,
    ]);
  });

  it("parses supported CSS color forms into WebGL rgba values", () => {
    expect(parseCanvasFlowWebglColor("#336699", 0.5)).toEqual([
      0.2, 0.4, 0.6, 0.5,
    ]);
    expect(parseCanvasFlowWebglColor("rgba(255, 128, 0, 0.25)")).toEqual([
      1, 128 / 255, 0, 0.25,
    ]);
  });
});
