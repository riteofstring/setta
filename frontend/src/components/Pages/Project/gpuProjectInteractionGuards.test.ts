import { describe, expect, it } from "vitest";
import {
  isProjectGpuNodeDragDisabled,
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
