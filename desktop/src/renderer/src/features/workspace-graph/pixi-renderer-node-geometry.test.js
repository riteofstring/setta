import { describe, expect, test } from "vitest";

import { drawNodeActivityMarker } from "./pixi-renderer-node-geometry";
import { workspaceNeonTheme } from "./workspace-neon-theme";

describe("workflow graph node geometry", () => {
  test("draws semantic activity as a status ring marker", () => {
    const marker = new RecordingGraphics();

    drawNodeActivityMarker(marker, {
      activity: {
        active: true,
        count: 1,
        kind: "exploring",
      },
      color: 0x38bdf8,
      height: 68,
      id: "semantic:constraint",
      layer: "semantic",
      width: 68,
      x: 0,
      y: 0,
    });

    expect(marker.visible).toBe(true);
    expect(marker.operations[0]).toEqual(["clear"]);
    expect(marker.operations.some(([operation]) => operation === "circle")).toBe(true);
    expect(
      marker.operations.some(
        ([operation, style]) =>
          operation === "stroke" && style.color === workspaceNeonTheme.semantic.activity.exploring,
      ),
    ).toBe(true);
    expect(marker.operations.some(([operation]) => operation === "fill")).toBe(true);
  });

  test("draws aggregate workflow runtime markers without source-pulse nodes", () => {
    const marker = new RecordingGraphics();

    drawNodeActivityMarker(marker, {
      color: 0x22c55e,
      height: 82,
      id: "reviewer",
      layer: "workflow",
      runtime: {
        hiddenSourceCount: 0,
        patchIds: ["patch_review"],
        pulseCount: 1,
        recentPulses: [],
        runIds: ["run_review"],
        sourceCount: 4,
        sourceRefs: [],
        status: "pending_review",
        statusCounts: [{ count: 4, status: "pending_review" }],
        windowIds: ["window_review"],
      },
      status: "running",
      width: 180,
      x: 0,
      y: 0,
    });

    expect(marker.visible).toBe(true);
    expect(marker.operations[0]).toEqual(["clear"]);
    expect(marker.operations.some(([operation]) => operation === "roundRect")).toBe(true);
    expect(
      marker.operations.some(
        ([operation, style]) =>
          operation === "stroke" &&
          style.color === workspaceNeonTheme.semantic.workingSetStatus.pending_review,
      ),
    ).toBe(true);
    expect(marker.operations.some(([operation]) => operation === "fill")).toBe(true);
  });

  test("hides workflow runtime marker when no aggregate runtime is present", () => {
    const marker = new RecordingGraphics();

    drawNodeActivityMarker(marker, {
      color: 0x22c55e,
      height: 82,
      id: "reviewer",
      layer: "workflow",
      runtime: null,
      status: "running",
      width: 180,
      x: 0,
      y: 0,
    });

    expect(marker.visible).toBe(false);
    expect(marker.operations).toEqual([["clear"]]);
  });
});

class RecordingGraphics {
  constructor() {
    this.operations = [];
    this.visible = true;
  }

  clear() {
    this.operations.push(["clear"]);
    return this;
  }

  circle(x, y, radius) {
    this.operations.push(["circle", x, y, radius]);
    return this;
  }

  closePath() {
    this.operations.push(["closePath"]);
    return this;
  }

  fill(style) {
    this.operations.push(["fill", style]);
    return this;
  }

  lineTo(x, y) {
    this.operations.push(["lineTo", x, y]);
    return this;
  }

  moveTo(x, y) {
    this.operations.push(["moveTo", x, y]);
    return this;
  }

  roundRect(x, y, width, height, radius) {
    this.operations.push(["roundRect", x, y, width, height, radius]);
    return this;
  }

  stroke(style) {
    this.operations.push(["stroke", style]);
    return this;
  }
}
