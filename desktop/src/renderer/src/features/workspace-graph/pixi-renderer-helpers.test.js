import { describe, expect, it } from "vitest";

import { screenPointFromPointer, screenPointFromWheel } from "./pixi-renderer-helpers";

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
