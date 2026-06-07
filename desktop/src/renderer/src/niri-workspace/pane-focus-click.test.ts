import { describe, expect, test } from "vitest";

import { paneFocusHitContainsPoint } from "./pane-focus-click";

const rect = {
  bottom: 260,
  left: 100,
  right: 420,
  top: 40,
};

describe("niri pane focus click zones", () => {
  test("accepts top strip and edge hits inside the pane", () => {
    expect(paneFocusHitContainsPoint(rect, { x: 220, y: 52 })).toBe(true);
    expect(paneFocusHitContainsPoint(rect, { x: 108, y: 160 })).toBe(true);
    expect(paneFocusHitContainsPoint(rect, { x: 414, y: 160 })).toBe(true);
    expect(paneFocusHitContainsPoint(rect, { x: 220, y: 254 })).toBe(true);
  });

  test("rejects center and outside points", () => {
    expect(paneFocusHitContainsPoint(rect, { x: 220, y: 160 })).toBe(false);
    expect(paneFocusHitContainsPoint(rect, { x: 220, y: 36 })).toBe(false);
    expect(paneFocusHitContainsPoint(rect, { x: 96, y: 52 })).toBe(false);
  });
});
