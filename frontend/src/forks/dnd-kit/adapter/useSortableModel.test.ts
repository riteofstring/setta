import { describe, expect, it, vi } from "vitest";

import type { ClientRect, SettaCollision, Transform } from "./types";
import {
  DEFAULT_SORTABLE_TRANSITION,
  buildSortablePresentationState,
  getRelevantCollision,
  normalizeLocalDisabled,
} from "./useSortableModel";

const items = ["a", "b", "c"];
const sortedRects: Array<ClientRect | undefined> = [
  { top: 0, left: 0, right: 100, bottom: 20, width: 100, height: 20 },
  { top: 20, left: 0, right: 100, bottom: 40, width: 100, height: 20 },
  { top: 40, left: 0, right: 100, bottom: 60, width: 100, height: 20 },
];

function collision(id: string, pastHalfway?: boolean): SettaCollision {
  return { id, pastHalfway } as SettaCollision;
}

describe("useSortableModel", () => {
  it("keeps the active item on its live drag transform without calling the strategy", () => {
    const dragTransform: Transform = {
      x: 18,
      y: 6,
      scaleX: 1,
      scaleY: 1,
    };
    const strategy = vi.fn(() => null);

    const state = buildSortablePresentationState({
      activeIndex: 1,
      activeRect: sortedRects[1] ?? null,
      collisions: [collision("c", true)],
      disableTransforms: false,
      dragTransform,
      index: 1,
      isDragging: false,
      items,
      itemsHaveChanged: false,
      overIndex: 2,
      shouldTrackSorting: true,
      sortedRects,
      sortingEnabled: true,
      strategy,
      transition: DEFAULT_SORTABLE_TRANSITION,
      useDragOverlay: false,
      wasDragActive: false,
    });

    expect(strategy).not.toHaveBeenCalled();
    expect(state.finalTransform).toEqual(dragTransform);
    expect(state.effectiveOverIndex).toBe(2);
    expect(state.isSorting).toBe(true);
    expect(state.isDraggingActive).toBe(true);
    expect(state.transitionValue).toBeUndefined();
  });

  it("uses the sorting strategy for displaced peer items and forwards past-halfway state", () => {
    const strategy = vi.fn(
      () =>
        [
          {
            x: 0,
            y: -20,
            scaleX: 1,
            scaleY: 1,
          },
          2,
        ] as const,
    );

    const state = buildSortablePresentationState({
      activeIndex: 0,
      activeRect: sortedRects[0] ?? null,
      collisions: [collision("b", true)],
      disableTransforms: false,
      dragTransform: null,
      index: 2,
      isDragging: false,
      items,
      itemsHaveChanged: false,
      overIndex: 1,
      shouldTrackSorting: true,
      sortedRects,
      sortingEnabled: true,
      strategy,
      transition: DEFAULT_SORTABLE_TRANSITION,
      useDragOverlay: false,
      wasDragActive: false,
    });

    expect(strategy).toHaveBeenCalledWith(
      expect.objectContaining({
        activeIndex: 0,
        index: 2,
        overIndex: 1,
        pastHalfway: true,
      }),
    );
    expect(state.finalTransform).toEqual({
      x: 0,
      y: -20,
      scaleX: 1,
      scaleY: 1,
    });
    expect(state.effectiveOverIndex).toBe(2);
    expect(state.isDraggingActive).toBe(false);
    expect(state.transitionValue).toBe(
      "transform 250ms cubic-bezier(0.25, 1, 0.5, 1)",
    );
  });

  it("forces the disabled transition after drag deactivation when items changed", () => {
    const state = buildSortablePresentationState({
      activeIndex: 0,
      activeRect: sortedRects[0] ?? null,
      collisions: null,
      disableTransforms: false,
      dragTransform: null,
      index: 2,
      isDragging: false,
      items,
      itemsHaveChanged: true,
      overIndex: -1,
      shouldTrackSorting: true,
      sortedRects,
      sortingEnabled: true,
      strategy: () => null,
      transition: DEFAULT_SORTABLE_TRANSITION,
      useDragOverlay: false,
      wasDragActive: true,
    });

    expect(state.finalTransform).toBeNull();
    expect(state.transitionValue).toBe("transform 0ms linear");
  });

  it("prefers direct collisions, then falls back to the first sortable item collision", () => {
    const collisions = [collision("outside"), collision("b"), collision("a")];

    expect(getRelevantCollision(collisions, items, "a")).toBe(collisions[2]);
    expect(getRelevantCollision(collisions, items, null)).toBe(collisions[1]);
  });

  it("merges local disabled state without changing the backend-owned global default shape", () => {
    expect(
      normalizeLocalDisabled(true, {
        draggable: false,
        droppable: true,
      }),
    ).toEqual({
      draggable: true,
      droppable: false,
    });
    expect(
      normalizeLocalDisabled(
        {
          draggable: true,
        },
        {
          draggable: false,
          droppable: true,
        },
      ),
    ).toEqual({
      draggable: true,
      droppable: true,
    });
  });
});
