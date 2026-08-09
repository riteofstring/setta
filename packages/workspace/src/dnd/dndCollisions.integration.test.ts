import { CollisionPriority, CollisionType } from "@dnd-kit/abstract";
import { beforeEach, describe, expect, it } from "vitest";
import { resolveOverCollision } from "./adapter/collisionCompare";
import { mapDragEvent } from "./adapter/dragEventMapping";
import type { SettaCollision } from "./adapter/types";
import { updateDndChildren, useDndChildren } from "./dndChildren";

// The reference suite also exercises the param drag mapping; that surface left with the
// Phase 4 parameter/item batch.

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
});
