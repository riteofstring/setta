import { describe, expect, it } from "vitest";
import { getBoundsOfGpuRects, getGpuNodesBounds } from "./nodeBounds";

describe("gpu node bounds", () => {
  it("builds one bounds rect from measured nodes", () => {
    expect(
      getGpuNodesBounds([
        { position: { x: 10, y: 20 }, width: 100, height: 40 },
        { position: { x: -30, y: 90 }, width: 20, height: 30 },
      ]),
    ).toEqual({
      height: 100,
      width: 140,
      x: -30,
      y: 20,
    });
  });

  it("ignores missing or zero node dimensions", () => {
    expect(
      getGpuNodesBounds([
        { position: { x: 10, y: 20 }, width: null, height: 40 },
        { position: { x: -30, y: 90 }, width: 20, height: 0 },
      ]),
    ).toEqual({ height: 0, width: 0, x: 0, y: 0 });
  });

  it("unions gpu rects", () => {
    expect(
      getBoundsOfGpuRects(
        { height: 40, width: 60, x: 10, y: 15 },
        { height: 20, width: 30, x: -5, y: 50 },
      ),
    ).toEqual({
      height: 55,
      width: 75,
      x: -5,
      y: 15,
    });
  });
});
