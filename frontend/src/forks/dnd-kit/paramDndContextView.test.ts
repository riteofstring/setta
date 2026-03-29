import { describe, expect, it } from "vitest";
import {
  buildParamDndCollisionScopeView,
  buildParamDndContextView,
} from "./paramDndContextView";

type TestCollision = {
  id: string;
  data?: {
    droppable?: {
      data?: unknown;
    };
  };
};

function collision(
  id: string,
  listKey: "pinned" | "unpinned" | "other" | null,
): TestCollision {
  if (listKey === null) {
    return { id };
  }

  return {
    id,
    data: {
      droppable: {
        data: {
          current: {
            listKey,
          },
        },
      },
    },
  };
}

describe("buildParamDndContextView", () => {
  it("keeps helper overlays enabled while a param drag is still active", () => {
    // Validates the overlay helpers survive through an active drag even after edit mode toggles off.
    expect(
      buildParamDndContextView({
        canEditStructure: false,
        isSelectingParams: false,
        paramDndActive: true,
      }).shouldRenderHelpers,
    ).toBe(true);
  });

  it("reuses the same inert dnd context object across calls", () => {
    // Validates the provider can keep passing a stable non-sorting/non-free-move context.
    const first = buildParamDndContextView({
      canEditStructure: true,
      isSelectingParams: true,
      paramDndActive: false,
    });
    const second = buildParamDndContextView({
      canEditStructure: true,
      isSelectingParams: false,
      paramDndActive: false,
    });

    expect(first.dndContext).toBe(second.dndContext);
    expect(first.dndContext).toEqual({
      isMovingFree: false,
      isSorting: false,
    });
  });
});

describe("buildParamDndCollisionScopeView", () => {
  it("returns the original collisions untouched when no param list is active", () => {
    // Validates the scope helper stays inert until the param dnd store selects a list.
    const collisions = [collision("match", "pinned"), collision("other", null)];
    const view = buildParamDndCollisionScopeView({
      collisions,
      listKey: null,
    });

    expect(view).toEqual({
      collisions,
      filteredOutCollisions: false,
      filteredToEmpty: false,
    });
  });

  it("filters collisions down to the active param list key", () => {
    // Validates pinned/unpinned lists cannot cross-feed collision targets during a param drag.
    expect(
      buildParamDndCollisionScopeView({
        collisions: [
          collision("pinned-match", "pinned"),
          collision("unpinned-mismatch", "unpinned"),
          collision("missing-data", null),
          collision("invalid-list", "other"),
        ],
        listKey: "pinned",
      }),
    ).toEqual({
      collisions: [collision("pinned-match", "pinned")],
      filteredOutCollisions: true,
      filteredToEmpty: false,
    });
  });

  it("reports an empty scope when every collision belongs to another list", () => {
    // Validates the tracker can deliberately clear collisions instead of falling through to the wrong list.
    expect(
      buildParamDndCollisionScopeView({
        collisions: [
          collision("unpinned-a", "unpinned"),
          collision("unpinned-b", "unpinned"),
        ],
        listKey: "pinned",
      }),
    ).toEqual({
      collisions: null,
      filteredOutCollisions: true,
      filteredToEmpty: true,
    });
  });
});
