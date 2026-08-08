import { describe, expect, it } from "vitest";

import { WORKSPACE_DEFAULT_GESTURE_OPTIONS, resolveWorkspaceGestureOptions } from "../src/core.js";

describe("workspace gesture options", () => {
  it("resolves documented defaults without sharing mutable key lists", () => {
    const first = resolveWorkspaceGestureOptions();
    const second = resolveWorkspaceGestureOptions();

    expect(first).toEqual(WORKSPACE_DEFAULT_GESTURE_OPTIONS);
    expect(first.zoomActivationKey).not.toBe(second.zoomActivationKey);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.zoomActivationKey)).toBe(true);
  });

  it("resolves every gesture family through package-owned values", () => {
    expect(
      resolveWorkspaceGestureOptions({
        initialZoom: 1.25,
        maxZoom: 3,
        minZoom: 0.5,
        panActivationKey: ["Space", "Alt"],
        panOnDrag: [1, 2],
        panOnScroll: true,
        panOnScrollMode: "horizontal",
        panOnScrollSpeed: 0.75,
        zoomActivationKey: null,
        zoomOnDoubleClick: false,
        zoomOnPinch: false,
        zoomOnScroll: false,
      }),
    ).toEqual({
      initialZoom: 1.25,
      maxZoom: 3,
      minZoom: 0.5,
      panActivationKey: ["Space", "Alt"],
      panOnDrag: [1, 2],
      panOnScroll: true,
      panOnScrollMode: "horizontal",
      panOnScrollSpeed: 0.75,
      zoomActivationKey: null,
      zoomOnDoubleClick: false,
      zoomOnPinch: false,
      zoomOnScroll: false,
    });
  });

  it.each([
    [{ minZoom: 2, maxZoom: 1 }, "minZoom cannot exceed maxZoom"],
    [{ minZoom: 0.5, initialZoom: 0.25 }, "initialZoom must be within"],
    [{ minZoom: 0.05 }, "must stay within 0.1 and 10"],
    [{ maxZoom: 11 }, "must stay within 0.1 and 10"],
    [{ panOnDrag: [5] }, "mouse-button list from 0 through 4"],
    [{ panOnScroll: "yes" }, "panOnScroll must be a boolean"],
    [{ panOnScrollMode: "diagonal" }, "must be free, horizontal, or vertical"],
    [{ panActivationKey: [] }, "non-empty key, key list, or null"],
    [{ panOnScrollSpeed: 0 }, "positive finite number"],
    [{ unknownOption: true }, "Unknown workspace gesture option unknownOption"],
  ])("rejects invalid gesture policy %# specifically", (options, message) => {
    expect(() =>
      resolveWorkspaceGestureOptions(
        options as Parameters<typeof resolveWorkspaceGestureOptions>[0],
      ),
    ).toThrow(message as string);
  });
});
