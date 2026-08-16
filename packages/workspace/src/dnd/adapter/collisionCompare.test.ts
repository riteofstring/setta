import { CollisionPriority, CollisionType } from "@dnd-kit/abstract";
import { describe, expect, it } from "vitest";
import {
  promoteBestCollision,
  resolveOverCollision,
  resolveOverCollisionId,
} from "./collisionCompare";
import type { SettaCollision } from "./types";

const EMPTY_PARENT_BY_CHILD: Record<string, string | null> = {};

type CollisionInput = {
  id: string;
  containerId?: string;
  intersectionRatio?: number;
  absTriggerDist?: number;
  triggerDist?: number;
};

function collision({
  id,
  containerId,
  intersectionRatio = 0,
  absTriggerDist,
  triggerDist,
}: CollisionInput): SettaCollision {
  const droppable = containerId
    ? {
        data: {
          current: {
            sortable: {
              containerId,
            },
          },
        },
      }
    : undefined;

  return {
    id,
    priority: CollisionPriority.Normal,
    type: CollisionType.Collision,
    value: intersectionRatio,
    data: {
      droppable: droppable as NonNullable<SettaCollision["data"]>["droppable"],
      intersectionRatio,
      absTriggerDist,
      triggerDist,
    },
  };
}

describe("collision comparison", () => {
  it("returns null for empty collision input", () => {
    // Validates null-safe behavior for no collision candidates.
    expect(resolveOverCollision(null, EMPTY_PARENT_BY_CHILD)).toBeNull();
    expect(resolveOverCollision([], EMPTY_PARENT_BY_CHILD)).toBeNull();
    expect(
      resolveOverCollisionId(null, "fallback", EMPTY_PARENT_BY_CHILD),
    ).toBe("fallback");
  });

  it("prefers sortable container collisions over non-sortable", () => {
    // Validates sortable collisions win even when raw ratio is lower.
    const plain = collision({ id: "plain", intersectionRatio: 100 });
    const sortable = collision({
      id: "sortable",
      containerId: "parent-1",
      intersectionRatio: 1,
    });

    expect(
      resolveOverCollision([plain, sortable], EMPTY_PARENT_BY_CHILD)?.id,
    ).toBe("sortable");
  });

  it("uses intersection ratio when both collisions are plain", () => {
    // Validates higher overlap wins in non-sortable comparisons.
    const low = collision({ id: "low", intersectionRatio: 4 });
    const high = collision({ id: "high", intersectionRatio: 8 });

    expect(
      resolveOverCollision([low, high], EMPTY_PARENT_BY_CHILD)?.id,
    ).toBe("high");
  });

  it("uses sortable trigger distance when both collisions are sortable", () => {
    // Validates sortable tie-breaker favors smaller absolute trigger distance.
    const farther = collision({
      id: "farther",
      containerId: "container",
      intersectionRatio: 100,
      absTriggerDist: 30,
      triggerDist: 30,
    });
    const nearer = collision({
      id: "nearer",
      containerId: "container",
      intersectionRatio: 1,
      absTriggerDist: 10,
      triggerDist: 10,
    });

    expect(
      resolveOverCollision([farther, nearer], EMPTY_PARENT_BY_CHILD)?.id,
    ).toBe("nearer");
  });

  it("keeps the earlier sortable collision when the nearer target has passed the trigger", () => {
    // Validates signed trigger distance still outranks raw proximity after crossing.
    const earlier = collision({
      id: "earlier",
      containerId: "container",
      intersectionRatio: 1,
      absTriggerDist: 30,
      triggerDist: -5,
    });
    const nearerPassed = collision({
      id: "nearer-passed",
      containerId: "container",
      intersectionRatio: 100,
      absTriggerDist: 10,
      triggerDist: 10,
    });

    expect(
      resolveOverCollision([earlier, nearerPassed], EMPTY_PARENT_BY_CHILD)?.id,
    ).toBe("earlier");
  });

  it("prefers the nearer sortable collision when it is still before the trigger", () => {
    // Validates the nearer pre-trigger sortable candidate can still win.
    const fartherPassed = collision({
      id: "farther-passed",
      containerId: "container",
      intersectionRatio: 100,
      absTriggerDist: 30,
      triggerDist: 30,
    });
    const nearerBefore = collision({
      id: "nearer-before",
      containerId: "container",
      intersectionRatio: 1,
      absTriggerDist: 10,
      triggerDist: -5,
    });

    expect(
      resolveOverCollision(
        [fartherPassed, nearerBefore],
        EMPTY_PARENT_BY_CHILD,
      )?.id,
    ).toBe("nearer-before");
  });

  it("prefers an exactly-at-trigger sortable collision over a farther post-trigger candidate", () => {
    // Validates trigger-state priority outranks absolute distance when signs differ.
    const fartherPassed = collision({
      id: "farther-passed",
      containerId: "container",
      intersectionRatio: 100,
      absTriggerDist: 30,
      triggerDist: 30,
    });
    const nearerAtTrigger = collision({
      id: "nearer-at-trigger",
      containerId: "container",
      intersectionRatio: 1,
      absTriggerDist: 10,
      triggerDist: 0,
    });

    expect(
      resolveOverCollision(
        [fartherPassed, nearerAtTrigger],
        EMPTY_PARENT_BY_CHILD,
      )?.id,
    ).toBe("nearer-at-trigger");
  });

  it("falls back to ratio when sortable distances tie", () => {
    // Validates equal-distance sortable collisions use overlap as the tie-breaker.
    const lowRatio = collision({
      id: "low-ratio",
      containerId: "container",
      intersectionRatio: 2,
      absTriggerDist: 10,
      triggerDist: 10,
    });
    const highRatio = collision({
      id: "high-ratio",
      containerId: "container",
      intersectionRatio: 5,
      absTriggerDist: 10,
      triggerDist: 10,
    });

    expect(
      resolveOverCollision([lowRatio, highRatio], EMPTY_PARENT_BY_CHILD)?.id,
    ).toBe("high-ratio");
  });

  it("promotes child collision when best candidate is its parent", () => {
    // Validates parent-child map drives child promotion for nested droppables.
    const parent = collision({ id: "parent", intersectionRatio: 20 });
    const child = collision({ id: "child", intersectionRatio: 5 });

    const parentByChild = { child: "parent" };

    expect(resolveOverCollision([parent, child], parentByChild)?.id).toBe(
      "child",
    );
    expect(
      resolveOverCollisionId([parent, child], "fallback", parentByChild),
    ).toBe("child");
  });

  it("reorders collisions so the best candidate appears first", () => {
    // Validates consumers can read collisions[0] as the preferred target.
    const plain = collision({ id: "plain", intersectionRatio: 100 });
    const sortable = collision({
      id: "sortable",
      containerId: "parent-1",
      intersectionRatio: 1,
    });

    const reordered = promoteBestCollision(
      [plain, sortable],
      EMPTY_PARENT_BY_CHILD,
    );
    expect(reordered.map((entry) => entry.id)).toEqual(["sortable", "plain"]);
  });
});
