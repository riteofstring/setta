import { HandlePosition } from "forks/xyflow/core/types";
import { describe, expect, it } from "vitest";
import { getBezierControls } from "./canvasFlowEdges";

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
});
