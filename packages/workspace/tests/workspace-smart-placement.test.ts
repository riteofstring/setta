import { describe, expect, it } from "vitest";

import { planWorkspaceSectionPlacement } from "../src/core.js";

describe("workspace smart placement", () => {
  it("prefers deterministic visible non-overlapping space", () => {
    expect(
      planWorkspaceSectionPlacement({
        rootRects: [{ height: 80, width: 100, x: 24, y: 24 }],
        size: { height: 80, width: 100 },
        viewport: { height: 400, width: 600, x: 0, y: 0 },
      }),
    ).toEqual({ panTarget: null, position: { x: 148, y: 24 } });
  });

  it("aligns smart candidates to an optional grid at negative coordinates", () => {
    expect(
      planWorkspaceSectionPlacement({
        grid: [24, 24],
        rootRects: [],
        size: { height: 96, width: 120 },
        viewport: { height: 360, width: 480, x: -240, y: -120 },
      }),
    ).toEqual({ panTarget: null, position: { x: -216, y: -96 } });
  });

  it("uses an outward grid candidate instead of needlessly panning", () => {
    expect(
      planWorkspaceSectionPlacement({
        grid: [24, 24],
        rootRects: [{ height: 80, width: 100, x: 24, y: 24 }],
        size: { height: 80, width: 100 },
        viewport: { height: 400, width: 600, x: 0, y: 0 },
      }),
    ).toEqual({ panTarget: null, position: { x: 168, y: 24 } });
  });

  it("falls back beside existing roots and returns a pan target", () => {
    expect(
      planWorkspaceSectionPlacement({
        padding: 24,
        rootRects: [{ height: 100, width: 100, x: 0, y: 0 }],
        size: { height: 120, width: 120 },
        viewport: { height: 100, width: 100, x: 0, y: 0 },
      }),
    ).toEqual({ panTarget: { x: 184, y: 84 }, position: { x: 124, y: 24 } });
  });

  it("rejects malformed placement input without evaluating accessors", () => {
    let evaluated = false;
    const rect = Object.defineProperty({ height: 80, width: 100, y: 0 }, "x", {
      enumerable: true,
      get: () => {
        evaluated = true;
        return 0;
      },
    });

    expect(() =>
      planWorkspaceSectionPlacement({
        rootRects: [rect as { height: number; width: number; x: number; y: number }],
        size: { height: 80, width: 100 },
        viewport: { height: 400, width: 600, x: 0, y: 0 },
      }),
    ).toThrow("Unknown workspace placement rectangle field x");
    expect(evaluated).toBe(false);
  });
});
