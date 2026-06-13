import { describe, expect, it } from "vitest";

import {
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
