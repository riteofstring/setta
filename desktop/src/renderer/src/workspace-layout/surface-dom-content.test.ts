import { describe, expect, test } from "vitest";

import { unscaledSnapshotBounds } from "./surface-dom-content";

describe("unscaledSnapshotBounds", () => {
  test("uses the untransformed layout box, ignoring the overview scale transform", () => {
    // In overview a pane host is laid out at full size (offsetWidth/offsetHeight)
    // but visually shrunk by a `scale()` transform, so getBoundingClientRect
    // returns the tiny thumbnail size. The frozen snapshot must be pinned to the
    // full layout size or it renders at a fraction of its pane box.
    const scaled = {
      getBoundingClientRect: () => ({ height: 96, width: 240 }),
      offsetHeight: 480,
      offsetWidth: 1200,
    } as unknown as Element;

    expect(unscaledSnapshotBounds(scaled)).toEqual({ height: 480, width: 1200 });
  });

  test("falls back to the bounding rect for elements without a layout box", () => {
    const svgLike = {
      getBoundingClientRect: () => ({ height: 120.6, width: 200.4 }),
    } as unknown as Element;

    expect(unscaledSnapshotBounds(svgLike)).toEqual({ height: 121, width: 200 });
  });
});
