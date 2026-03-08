import { describe, expect, it } from "vitest";
import { getXYWidthHeight, syncSelectedMiniMapNodes } from "./MiniMap";

describe("getXYWidthHeight", () => {
  it("centers bounds and applies offset when bounds are smaller", () => {
    const result = getXYWidthHeight({
      boundingRect: { x: 0, y: 0, width: 100, height: 50 },
      elementWidth: 200,
      elementHeight: 100,
      offsetScale: 5,
    });

    expect(result.viewScale).toBeCloseTo(0.5);
    expect(result.offset).toBeCloseTo(2.5);
    expect(result.x).toBeCloseTo(-2.5);
    expect(result.y).toBeCloseTo(-2.5);
    expect(result.width).toBeCloseTo(105);
    expect(result.height).toBeCloseTo(55);
  });

  it("expands view when bounds are wider than the minimap element", () => {
    const result = getXYWidthHeight({
      boundingRect: { x: 10, y: 20, width: 300, height: 100 },
      elementWidth: 200,
      elementHeight: 100,
      offsetScale: 2,
    });

    expect(result.viewScale).toBeCloseTo(1.5);
    expect(result.offset).toBeCloseTo(3);
    expect(result.x).toBeCloseTo(7);
    expect(result.y).toBeCloseTo(-8);
    expect(result.width).toBeCloseTo(306);
    expect(result.height).toBeCloseTo(156);
  });
});

describe("syncSelectedMiniMapNodes", () => {
  it("does nothing when the minimap svg is not available yet", () => {
    // Route transitions can briefly mount the selection sync before the svg ref exists.
    expect(() => {
      syncSelectedMiniMapNodes(undefined, ["alpha"], []);
    }).not.toThrow();
  });
});
