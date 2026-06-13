import { describe, expect, test } from "vitest";

import {
  redrawSemanticCellAnimation,
  semanticCellBreathScale,
  setNodeContainerScaleAroundCenter,
} from "./pixi-renderer-cell-animation";

describe("semantic cell animation rendering", () => {
  test("keeps breathing subtle and centered on the node", () => {
    const node = semanticNode("semantic:active", 20, 40);
    const container = {
      scale: {
        value: 1,
        set(value) {
          this.value = value;
        },
      },
      x: node.x,
      y: node.y,
    };
    const scale = semanticCellBreathScale(node, 1200);

    expect(scale).toBeGreaterThan(0.97);
    expect(scale).toBeLessThan(1.03);
    setNodeContainerScaleAroundCenter(container, node, scale);

    expect(container.scale.value).toBe(scale);
    expect(container.x + (node.width * scale) / 2).toBeCloseTo(node.x + node.width / 2);
    expect(container.y + (node.height * scale) / 2).toBeCloseTo(node.y + node.height / 2);
  });

  test("draws active cell shimmer, drifting nucleus, and organelles into one graphics target", () => {
    const graphics = new RecordingGraphics();

    redrawSemanticCellAnimation({
      cellAnimationGraphics: graphics,
      nodes: [semanticNode("semantic:active", 0, 0)],
      now: 2400,
    });

    expect(graphics.operations[0]).toEqual(["clear"]);
    expect(graphics.operations.filter(([operation]) => operation === "stroke")).toHaveLength(2);
    expect(
      graphics.operations.filter(([operation]) => operation === "fill").length,
    ).toBeGreaterThan(7);
  });
});

function semanticNode(id, x, y) {
  return {
    activity: { active: true, count: 1, kind: "exploring" },
    color: 0x38bdf8,
    height: 68,
    id,
    layer: "semantic",
    width: 68,
    x,
    y,
  };
}

class RecordingGraphics {
  constructor() {
    this.operations = [];
  }

  clear() {
    this.operations.push(["clear"]);
    return this;
  }

  circle(x, y, radius) {
    this.operations.push(["circle", x, y, radius]);
    return this;
  }

  fill(style) {
    this.operations.push(["fill", style]);
    return this;
  }

  stroke(style) {
    this.operations.push(["stroke", style]);
    return this;
  }
}
