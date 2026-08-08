import { describe, expect, it } from "vitest";

import { WORKSPACE_DEFAULT_GESTURE_OPTIONS, resolveWorkspaceGestureOptions } from "../src/core.js";
import { createWorkspaceCanvasGesturePolicy } from "../src/internal/workspace-canvas-gesture-policy.js";

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

  it.each([
    ["free", "free"],
    ["horizontal", "horizontal"],
    ["vertical", "vertical"],
  ] as const)("maps %s wheel panning without exposing upstream policy", (mode, expectedMode) => {
    const options = resolveWorkspaceGestureOptions({ panOnScrollMode: mode });

    expect(createWorkspaceCanvasGesturePolicy(options).panOnScrollMode).toBe(expectedMode);
  });

  it.each([
    [false, false, null, false],
    [false, false, "Alt", true],
    [false, true, null, true],
    [true, false, null, true],
    [true, true, null, true],
  ] as const)(
    "coordinates native scrolling for pan=%s, zoom=%s, and activation=%s",
    (panOnScroll, zoomOnScroll, zoomActivationKey, preventScrolling) => {
      const policy = createWorkspaceCanvasGesturePolicy(
        resolveWorkspaceGestureOptions({ panOnScroll, zoomActivationKey, zoomOnScroll }),
      );

      expect(policy.preventScrolling).toBe(preventScrolling);
    },
  );

  it("copies mutable upstream key and mouse-button inputs at the adapter boundary", () => {
    const options = resolveWorkspaceGestureOptions({
      panActivationKey: ["Space", "Alt"],
      panOnDrag: [0, 1],
      zoomActivationKey: ["Control", "Meta"],
    });
    const policy = createWorkspaceCanvasGesturePolicy(options);

    expect(policy).toMatchObject({
      panActivationKeyCode: ["Space", "Alt"],
      panOnDrag: [0, 1],
      zoomActivationKeyCode: ["Control", "Meta"],
    });
    expect(policy.panActivationKeyCode).not.toBe(options.panActivationKey);
    expect(policy.panOnDrag).not.toBe(options.panOnDrag);
    expect(policy.zoomActivationKeyCode).not.toBe(options.zoomActivationKey);
  });
});
