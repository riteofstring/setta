import { describe, expect, test } from "vitest";

import {
  redrawSemanticCellAnimation,
  semanticCellBreathScale,
  setNodeContainerScaleAroundCenter,
} from "./pixi-renderer-cell-animation";

describe("semantic cell animation rendering", () => {
  test("keeps default semantic cells stationary", () => {
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

    expect(scale).toBe(1);
    setNodeContainerScaleAroundCenter(container, node, scale);

    expect(container.scale.value).toBe(1);
    expect(container.x).toBe(node.x);
    expect(container.y).toBe(node.y);
  });

  test("does not draw default orbiting semantic-cell particles", () => {
    const graphics = new RecordingGraphics();

    redrawSemanticCellAnimation({
      cellAnimationGraphics: graphics,
      nodes: [semanticNode("semantic:active", 0, 0)],
      now: 2400,
    });

    expect(graphics.operations).toEqual([["clear"]]);
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
