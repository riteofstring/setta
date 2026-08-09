import { CollisionPriority, CollisionType } from "@dnd-kit/abstract";
import { beforeEach, describe, expect, it } from "vitest";
import { resolveOverCollision } from "./adapter/collisionCompare";
import { mapDragEvent } from "./adapter/dragEventMapping";
import type { SettaCollision } from "./adapter/types";
import { updateDndChildren, useDndChildren } from "./dndChildren";
import { updateItemChildren, useItemDndChildren } from "./itemDndChildren";
import { getItemDndId, setItemDndState, useItemDndState } from "./itemDndState";

function collision(id: string, intersectionRatio: number): SettaCollision {
  return {
    id,
    priority: CollisionPriority.Normal,
    type: CollisionType.Collision,
    value: intersectionRatio,
    data: {
      intersectionRatio,
    },
  };
}

describe("dnd collision integration", () => {
  beforeEach(() => {
    useDndChildren.getState().reset();
    useItemDndChildren.getState().reset();
    useItemDndState.getState().reset();
  });

  it("resolves section over-collision with live dndChildren store mapping", () => {
    // Validates collision resolution pulls parentByChild from shared dnd store.
    updateDndChildren({
      parent: ["child"],
    });

    const resolved = resolveOverCollision([collision("parent", 10), collision("child", 1)]);

    expect(resolved?.id).toBe("child");
  });

  it("promotes the resolved section collision to the front of the mapped drag event", () => {
    // Validates drag event mapping integrates the section collision promotion.
    updateDndChildren({
      parent: ["child"],
    });

    const mapped = mapDragEvent(
      {
        operation: {
          source: {
            id: "child",
            data: { current: { type: "section" } },
          },
          target: null,
          activatorEvent: null,
          transform: { x: 0, y: 0 },
        },
      } as never,
      {
        collisionObserver: {
          collisions: [collision("parent", 20), collision("child", 1), collision("outside", 5)],
        },
      } as never,
    );

    expect(mapped?.collisions?.[0]?.id).toBe("child");
  });

  it("maps item drag collisions using list-key aware parentByChild state", () => {
    // Validates drag event mapping integrates item dnd stores + collision promotion.
    const listKey = "pinned";
    const parentId = "item-parent";
    const childId = "item-child";

    updateItemChildren({
      [parentId]: [childId],
    });
    setItemDndState({ listKey });

    const parentDndId = getItemDndId(parentId, listKey);
    const childDndId = getItemDndId(childId, listKey);

    const mapped = mapDragEvent(
      {
        operation: {
          source: {
            id: childDndId,
            data: { current: { type: "item" } },
          },
          target: null,
          activatorEvent: null,
          transform: { x: 0, y: 0 },
        },
      } as never,
      {
        collisionObserver: {
          collisions: [
            collision(parentDndId, 20),
            collision(childDndId, 1),
            collision("outside", 5),
          ],
        },
      } as never,
    );

    expect(mapped?.collisions?.[0]?.id).toBe(childDndId);
  });
});
