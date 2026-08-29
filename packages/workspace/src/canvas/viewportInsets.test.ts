import { describe, expect, it } from "vitest";
import {
  getPhysicalViewportInsets,
  getVisibleCanvasRect,
} from "./viewportInsets";

describe("workspace viewport insets", () => {
  it("maps logical shell panes to physical canvas edges", () => {
    expect(
      getPhysicalViewportInsets({
        direction: "ltr",
        leading: 335,
        trailing: 40,
      }),
    ).toEqual({
      bottom: 0,
      left: 335,
      right: 40,
      top: 0,
    });
    expect(
      getPhysicalViewportInsets({
        direction: "rtl",
        leading: 335,
        trailing: 40,
      }),
    ).toEqual({
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

  // The compact host: the open pane spans the canvas between the two rails, so there is no
  // unobscured area to frame content against and the canvas itself is the framing area.
  it("returns the whole canvas when open panes leave no unobscured area", () => {
    expect(
      getVisibleCanvasRect(
        { width: 320, height: 861 },
        { top: 0, right: 40, bottom: 0, left: 280 },
      ),
    ).toEqual({ x: 0, y: 0, width: 320, height: 861 });
    expect(
      getVisibleCanvasRect(
        { width: 756, height: 431 },
        { top: 0, right: 40, bottom: 0, left: 756 },
      ),
    ).toEqual({ x: 0, y: 0, width: 756, height: 431 });
    expect(
      getVisibleCanvasRect(
        { width: 800, height: 600 },
        { top: 400, right: 0, bottom: 400, left: 0 },
      ),
    ).toEqual({ x: 0, y: 0, width: 800, height: 600 });
  });

  it("rejects unmeasurable dimensions and negative insets", () => {
    expect(() =>
      getVisibleCanvasRect(
        { width: Number.NaN, height: 600 },
        { top: 0, right: 0, bottom: 0, left: 0 },
      ),
    ).toThrowError(
      "Workspace viewport dimensions and insets must be finite and non-negative.",
    );
    expect(() =>
      getVisibleCanvasRect(
        { width: 800, height: 600 },
        { top: 0, right: 0, bottom: 0, left: -1 },
      ),
    ).toThrowError(
      "Workspace viewport dimensions and insets must be finite and non-negative.",
    );
  });
});
