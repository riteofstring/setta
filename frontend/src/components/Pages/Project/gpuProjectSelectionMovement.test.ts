import { describe, expect, it } from "vitest";
import {
  buildProjectSelectionKeyboardNudgePlan,
  moveProjectSelectionDragItems,
  snapProjectNodePosition,
  snapProjectSelectionDragItems,
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

  it("moves selection drag items by the flow-space pointer delta", () => {
    expect(
      moveProjectSelectionDragItems({
        items: [
          {
            distance: { x: 2, y: 3 },
            height: 40,
            id: "section-a",
            position: { x: 10, y: 20 },
            width: 80,
          },
          {
            distance: { x: 4, y: 5 },
            height: null,
            id: "section-b",
            position: { x: -5, y: 30 },
            width: null,
          },
        ],
        lastFlowPoint: { x: 100, y: 200 },
        nextFlowPoint: { x: 112, y: 194 },
      }),
    ).toEqual({
      changed: true,
      delta: { x: 12, y: -6 },
      items: [
        {
          distance: { x: 2, y: 3 },
          height: 40,
          id: "section-a",
          position: { x: 22, y: 14 },
          width: 80,
        },
        {
          distance: { x: 4, y: 5 },
          height: null,
          id: "section-b",
          position: { x: 7, y: 24 },
          width: null,
        },
      ],
    });
  });

  it("snaps selection drag items only at drag stop", () => {
    expect(
      snapProjectSelectionDragItems({
        items: [
          {
            distance: { x: 0, y: 0 },
            height: 40,
            id: "section-a",
            position: { x: 23, y: 58 },
            width: 80,
          },
          {
            distance: { x: 0, y: 0 },
            height: 20,
            id: "section-b",
            position: { x: 32, y: 24 },
            width: 30,
          },
        ],
        snapGrid: [16, 12],
      }),
    ).toEqual({
      changed: true,
      delta: { x: -7, y: 2 },
      items: [
        {
          distance: { x: 0, y: 0 },
          height: 40,
          id: "section-a",
          position: { x: 16, y: 60 },
          width: 80,
        },
        {
          distance: { x: 0, y: 0 },
          height: 20,
          id: "section-b",
          position: { x: 32, y: 24 },
          width: 30,
        },
      ],
    });
  });
});
