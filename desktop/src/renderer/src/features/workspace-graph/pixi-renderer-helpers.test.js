import { describe, expect, it } from "vitest";

import {
  drawWorkspaceGlow,
  sampleCurvedEdge,
  screenPointFromPointer,
  screenPointFromWheel,
} from "./pixi-renderer-helpers";

describe("Pixi renderer helpers", () => {
  it("converts transformed canvas pointer coordinates into canvas-local coordinates", () => {
    const canvas = scaledCanvas();

    expect(screenPointFromPointer(canvas, { clientX: 350, clientY: 175 })).toEqual({
      x: 500,
      y: 250,
    });
    expect(screenPointFromWheel(canvas, { clientX: 600, clientY: 300 })).toEqual({
      x: 1000,
      y: 500,
    });
  });

  it("samples the same cubic curve used for renderer edges", () => {
    const start = { x: 0, y: 0 };
    const end = { x: 200, y: 100 };

    expect(sampleCurvedEdge(start, end, 0)).toMatchObject(start);
    expect(sampleCurvedEdge(start, end, 1)).toMatchObject(end);
    expect(sampleCurvedEdge(start, end, 0.5)).toMatchObject({
      x: 100,
      y: 50,
    });
    expect(sampleCurvedEdge(start, end, -1)).toMatchObject(start);
    expect(sampleCurvedEdge(start, end, 2)).toMatchObject(end);
  });

  it("draws workflow node auras by status and motion mode", () => {
    const staticGlow = new RecordingGraphics();
    drawWorkspaceGlow(
      staticGlow,
      [
        workflowNode("running", "running"),
        workflowNode("succeeded", "succeeded"),
        workflowNode("cancelled", "cancelled"),
      ],
      1000,
      { mode: "static" },
    );

    const staticStrokes = staticGlow.operations.filter(([operation]) => operation === "stroke");
    expect(staticStrokes).toHaveLength(6);
    expect(staticStrokes[0][1].alpha).toBeGreaterThan(staticStrokes[4][1].alpha);
    expect(staticStrokes[2][1].alpha).toBeGreaterThan(staticStrokes[4][1].alpha);

    const animatedFirst = new RecordingGraphics();
    drawWorkspaceGlow(animatedFirst, [workflowNode("failed", "failed")], 1000, {
      mode: "animated",
    });
    const animatedSecond = new RecordingGraphics();
    drawWorkspaceGlow(animatedSecond, [workflowNode("failed", "failed")], 1260, {
      mode: "animated",
    });

    expect(firstStrokeAlpha(animatedFirst)).not.toBe(firstStrokeAlpha(animatedSecond));

    const steady = new RecordingGraphics();
    drawWorkspaceGlow(steady, [workflowNode("ready", "ready")], 1000, { mode: "steady" });

    expect(firstStrokeAlpha(steady)).toBeGreaterThan(firstStrokeAlpha(staticGlow));
  });

  it("scale-compensates workflow node aura strokes for fit zoom", () => {
    const normalZoom = new RecordingGraphics();
    const fitZoom = new RecordingGraphics();
    const node = workflowNode("idle", "not_started");

    drawWorkspaceGlow(normalZoom, [node], 1000, { mode: "static", zoom: 1 });
    drawWorkspaceGlow(fitZoom, [node], 1000, { mode: "static", zoom: 0.5 });

    expect(firstStrokeWidth(fitZoom) * 0.5).toBeCloseTo(firstStrokeWidth(normalZoom), 5);
    expect(firstCircleRadius(fitZoom)).toBeGreaterThan(firstCircleRadius(normalZoom));

    const nodeRadius = Math.max(node.width, node.height) / 2;
    expect(firstCircleRadius(fitZoom) * 0.5 - nodeRadius * 0.5).toBeCloseTo(
      firstCircleRadius(normalZoom) - nodeRadius,
      5,
    );
  });
});

function scaledCanvas() {
  return {
    clientHeight: 500,
    clientWidth: 1000,
    getBoundingClientRect: () => ({
      height: 250,
      left: 100,
      top: 50,
      width: 500,
    }),
  };
}

function workflowNode(id, status) {
  return {
    color: 0x38bdf8,
    height: 82,
    id,
    layer: "workflow",
    status,
    width: 168,
    x: 0,
    y: 0,
  };
}

function firstStrokeAlpha(graphics) {
  return graphics.operations.find(([operation]) => operation === "stroke")[1].alpha;
}

function firstStrokeWidth(graphics) {
  return graphics.operations.find(([operation]) => operation === "stroke")[1].width;
}

function firstCircleRadius(graphics) {
  return graphics.operations.find(([operation]) => operation === "circle")[3];
}

class RecordingGraphics {
  constructor() {
    this.operations = [];
  }

  clear() {
    this.operations.push(["clear"]);
    return this;
  }

  roundRect(x, y, width, height, radius) {
    this.operations.push(["roundRect", x, y, width, height, radius]);
    return this;
  }

  circle(x, y, radius) {
    this.operations.push(["circle", x, y, radius]);
    return this;
  }

  stroke(style) {
    this.operations.push(["stroke", style]);
    return this;
  }
}
