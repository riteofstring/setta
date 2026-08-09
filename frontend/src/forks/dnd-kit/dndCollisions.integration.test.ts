import { CollisionPriority, CollisionType } from "@dnd-kit/abstract";
import { resetProjectStores } from "state/utils";
import { beforeEach, describe, expect, it } from "vitest";
import { resolveOverCollision } from "./adapter/collisionCompare";
import { mapDragEvent } from "./adapter/dragEventMapping";
import type { SettaCollision } from "./adapter/types";
import { updateDndChildren } from "./dndChildren";
import { updateParamChildren } from "./paramDndChildren";
import { getParamDndItemId, setParamDndState } from "./paramDndState";

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
    resetProjectStores();
  });

  it("resolves section over-collision with live dndChildren store mapping", () => {
    // Validates collision resolution pulls parentByChild from shared dnd store.
    updateDndChildren({
      parent: ["child"],
    });

    const resolved = resolveOverCollision([
      collision("parent", 10),
      collision("child", 1),
    ]);

    expect(resolved?.id).toBe("child");
  });

  it("maps param drag collisions using list-key aware parentByChild state", () => {
    // Validates drag event mapping integrates param dnd stores + collision promotion.
    const listKey = "pinned";
    const parentId = "param-parent";
    const childId = "param-child";

    updateParamChildren({
      [parentId]: [childId],
    });
    setParamDndState({ listKey });

    const parentDndId = getParamDndItemId(parentId, listKey);
    const childDndId = getParamDndItemId(childId, listKey);

    const mapped = mapDragEvent(
      {
        operation: {
          source: {
            id: childDndId,
            data: { current: { type: "param" } },
          },
          target: null,
          activatorEvent: null,
          transform: { x: 0, y: 0 },
        },
      },
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
