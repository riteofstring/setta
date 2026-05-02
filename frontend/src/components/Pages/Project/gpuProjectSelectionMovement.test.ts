import { describe, expect, it } from "vitest";
import {
  buildProjectSelectionKeyboardNudgePlan,
  snapProjectNodePosition,
} from "./gpuProjectSelectionMovement";

describe("gpu project selection movement", () => {
  it("builds arrow-key nudge updates with the non-grid velocity", () => {
    const plan = buildProjectSelectionKeyboardNudgePlan({
      direction: { x: 1, y: 0 },
      isShiftPressed: false,
      selectedNodes: [
        {
          height: 40,
          id: "section-a",
          position: { x: 10, y: 20 },
          width: 80,
        },
        {
          height: null,
          id: "section-b",
          position: { x: -5, y: 30 },
          width: null,
        },
      ],
      snapGrid: [16, 12],
      snapToGrid: false,
    });

    expect(plan).toEqual({
      delta: { x: 5, y: 0 },
      forceRefreshBounds: false,
      items: [
        {
          distance: { x: 0, y: 0 },
          height: 40,
          id: "section-a",
          position: { x: 15, y: 20 },
          width: 80,
        },
        {
          distance: { x: 0, y: 0 },
          height: null,
          id: "section-b",
          position: { x: 0, y: 30 },
          width: null,
        },
      ],
    });
  });

  it("uses snap-grid increments, shift acceleration, and snapped positions", () => {
    const plan = buildProjectSelectionKeyboardNudgePlan({
      direction: { x: 0, y: -1 },
      isShiftPressed: true,
      selectedNodes: [
        {
          height: 40,
          id: "section-a",
          position: { x: 23, y: 58 },
          width: 80,
        },
      ],
      snapGrid: [16, 12],
      snapToGrid: true,
    });

    expect(plan).toEqual({
      delta: { x: 0, y: -48 },
      forceRefreshBounds: true,
      items: [
        {
          distance: { x: 0, y: 0 },
          height: 40,
          id: "section-a",
          position: { x: 16, y: 12 },
          width: 80,
        },
      ],
    });
  });

  it("does not build a nudge plan without movable selected nodes", () => {
    expect(
      buildProjectSelectionKeyboardNudgePlan({
        direction: { x: 1, y: 0 },
        isShiftPressed: false,
        selectedNodes: [],
        snapGrid: [16, 12],
        snapToGrid: false,
      }),
    ).toBeNull();
  });

  it("snaps flow positions to the configured grid", () => {
    expect(snapProjectNodePosition({ x: 23, y: 58 }, [16, 12])).toEqual({
      x: 16,
      y: 60,
    });
  });
});
