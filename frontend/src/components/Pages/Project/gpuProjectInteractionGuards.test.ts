import { describe, expect, it } from "vitest";
import {
  isProjectGpuNodeDragDisabled,
  isProjectGpuSelectionBoxDragDisabled,
  isProjectGpuSelectionDisabled,
  isProjectGpuViewportGestureDisabled,
  shouldShiftProjectGpuSelectionBoundsForNodeMove,
} from "./gpuProjectInteractionGuards";

describe("gpu project interaction guards", () => {
  it.each([
    ["pan activation key", true, false, false, false],
    ["AI follow transition", false, true, false, false],
    ["dnd sorting mode", false, false, true, false],
    ["dnd moving-free mode", false, false, false, true],
  ])(
    "disables GPU direct node drag during %s",
    (
      _label,
      panActivationKeyPressed,
      isFollowTransitioning,
      isSorting,
      isMovingFree,
    ) => {
      expect(
        isProjectGpuNodeDragDisabled({
          dndMode: { isMovingFree, isSorting },
          isFollowTransitioning,
          panActivationKeyPressed,
        }),
      ).toBe(true);
    },
  );

  it("allows GPU direct node drag in normal mode", () => {
    expect(
      isProjectGpuNodeDragDisabled({
        dndMode: { isMovingFree: false, isSorting: false },
        isFollowTransitioning: false,
        panActivationKeyPressed: false,
      }),
    ).toBe(false);
  });

  it.each([
    ["AI follow transition", false, false, true],
    ["dnd sorting mode", true, false, false],
    ["dnd moving-free mode", false, true, false],
  ])(
    "disables GPU viewport gestures during %s",
    (_label, isSorting, isMovingFree, isFollowTransitioning) => {
      expect(
        isProjectGpuViewportGestureDisabled({
          dndMode: { isMovingFree, isSorting },
          isFollowTransitioning,
        }),
      ).toBe(true);
    },
  );

  it("allows GPU viewport gestures in normal mode", () => {
    expect(
      isProjectGpuViewportGestureDisabled({
        dndMode: { isMovingFree: false, isSorting: false },
        isFollowTransitioning: false,
      }),
    ).toBe(false);
  });

  it.each([
    ["dnd sorting mode", true, false],
    ["dnd moving-free mode", false, true],
  ])(
    "disables GPU marquee selection during %s",
    (_label, isSorting, isMovingFree) => {
      expect(
        isProjectGpuSelectionDisabled({
          dndMode: { isMovingFree, isSorting },
        }),
      ).toBe(true);
    },
  );

  it("allows GPU marquee selection in normal mode", () => {
    expect(
      isProjectGpuSelectionDisabled({
        dndMode: { isMovingFree: false, isSorting: false },
      }),
    ).toBe(false);
  });

  it.each([
    ["dnd sorting mode", true, false],
    ["dnd moving-free mode", false, true],
  ])(
    "disables direct selection-box movement during %s",
    (_label, isSorting, isMovingFree) => {
      expect(
        isProjectGpuSelectionBoxDragDisabled({
          dndMode: { isMovingFree, isSorting },
        }),
      ).toBe(true);
    },
  );

  it("allows direct selection-box movement in normal mode", () => {
    expect(
      isProjectGpuSelectionBoxDragDisabled({
        dndMode: { isMovingFree: false, isSorting: false },
      }),
    ).toBe(false);
  });

  it("shifts selection bounds only when every active selected node moved", () => {
    expect(
      shouldShiftProjectGpuSelectionBoundsForNodeMove({
        activeSelectedNodeIds: ["a", "b"],
        movedNodeIds: ["b", "a"],
      }),
    ).toBe(true);
    expect(
      shouldShiftProjectGpuSelectionBoundsForNodeMove({
        activeSelectedNodeIds: ["a", "b"],
        movedNodeIds: ["a"],
      }),
    ).toBe(false);
    expect(
      shouldShiftProjectGpuSelectionBoundsForNodeMove({
        activeSelectedNodeIds: ["a"],
        movedNodeIds: ["a", "c"],
      }),
    ).toBe(false);
    expect(
      shouldShiftProjectGpuSelectionBoundsForNodeMove({
        activeSelectedNodeIds: [],
        movedNodeIds: ["a"],
      }),
    ).toBe(false);
  });
});
