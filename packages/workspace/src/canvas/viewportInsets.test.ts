import { describe, expect, it } from "vitest";
import { getPhysicalViewportInsets, getVisibleCanvasRect } from "./viewportInsets";

describe("workspace viewport insets", () => {
  it("maps logical shell panes to physical canvas edges", () => {
    expect(getPhysicalViewportInsets({ direction: "ltr", leading: 335, trailing: 40 })).toEqual({
      bottom: 0,
      left: 335,
      right: 40,
      top: 0,
    });
    expect(getPhysicalViewportInsets({ direction: "rtl", leading: 335, trailing: 40 })).toEqual({
      bottom: 0,
      left: 40,
      right: 335,
      top: 0,
    });
  });

  it("returns the unobscured rectangle inside the full canvas", () => {
    expect(
      getVisibleCanvasRect(
        { width: 800, height: 600 },
        { top: 10, right: 100, bottom: 20, left: 200 },
      ),
    ).toEqual({ x: 200, y: 10, width: 500, height: 570 });
  });
});
