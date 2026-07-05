import { describe, expect, test } from "vitest";

import {
  classifyOverviewWheel,
  overviewWheelZoomFactor,
  wheelDeltaModePixelFactor,
} from "./overview-wheel-gesture";

const base = { ctrlKey: false, deltaMode: 0, deltaX: 0, deltaY: 0, metaKey: false };

describe("classifyOverviewWheel", () => {
  test("pinch and modifier wheels zoom", () => {
    // Browsers deliver a trackpad pinch as a ctrl+wheel event.
    expect(classifyOverviewWheel({ ...base, ctrlKey: true, deltaY: -2 })).toBe("zoom");
    expect(classifyOverviewWheel({ ...base, metaKey: true, deltaY: 4 })).toBe("zoom");
  });

  test("line and page mode wheels are physical mouse wheels (zoom)", () => {
    expect(classifyOverviewWheel({ ...base, deltaMode: 1, deltaY: -3 })).toBe("zoom");
    expect(classifyOverviewWheel({ ...base, deltaMode: 2, deltaY: 1 })).toBe("zoom");
  });

  test("a coarse vertical notch in pixel mode is a mouse wheel (zoom)", () => {
    expect(classifyOverviewWheel({ ...base, deltaY: 120, wheelDeltaY: -120 })).toBe("zoom");
    expect(classifyOverviewWheel({ ...base, deltaY: -100, wheelDeltaY: 360 })).toBe("zoom");
    // No legacy field: a coarse whole-pixel vertical step still reads as a notch.
    expect(classifyOverviewWheel({ ...base, deltaY: -53 })).toBe("zoom");
  });

  test("smooth, fractional, or horizontal scrolling is a trackpad pan", () => {
    expect(classifyOverviewWheel({ ...base, deltaY: -4, wheelDeltaY: 12 })).toBe("pan");
    // A horizontal component rules out a vertical wheel notch.
    expect(classifyOverviewWheel({ ...base, deltaX: 8, deltaY: 0, wheelDeltaY: -120 })).toBe("pan");
    // Fractional pixel delta with no legacy field is trackpad inertia.
    expect(classifyOverviewWheel({ ...base, deltaY: 2.5 })).toBe("pan");
    expect(classifyOverviewWheel({ ...base, deltaY: -8 })).toBe("pan");
  });
});

describe("overviewWheelZoomFactor", () => {
  test("scroll up zooms in, scroll down zooms out", () => {
    expect(overviewWheelZoomFactor(-100, 0, false)).toBeGreaterThan(1);
    expect(overviewWheelZoomFactor(100, 0, false)).toBeLessThan(1);
    expect(overviewWheelZoomFactor(0, 0, false)).toBe(1);
  });

  test("a pinch is boosted so its tiny per-event deltas still zoom meaningfully", () => {
    expect(overviewWheelZoomFactor(-5, 0, true)).toBeGreaterThan(
      overviewWheelZoomFactor(-5, 0, false),
    );
  });

  test("line mode steps coarser than pixel mode", () => {
    expect(overviewWheelZoomFactor(-3, 1, false)).toBeGreaterThan(
      overviewWheelZoomFactor(-3, 0, false),
    );
  });
});

describe("wheelDeltaModePixelFactor", () => {
  test("maps pixel / line / page modes to a common scale", () => {
    expect(wheelDeltaModePixelFactor(0)).toBe(1);
    expect(wheelDeltaModePixelFactor(1)).toBe(16);
    expect(wheelDeltaModePixelFactor(2)).toBe(720);
  });
});
