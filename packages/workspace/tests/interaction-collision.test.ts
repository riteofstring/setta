import { describe, expect, it } from "vitest";

import {
  createInteractionRect,
  EMPTY_COLLISION_TRACKER_STATE,
  pickCollisionCandidate,
  resolveCollisionFrame,
  type CollisionCandidate,
  type ListOrientation,
} from "../src/testing.js";
import { INTERACTION_FIXTURE_EVIDENCE } from "./fixtures/interaction-evidence.js";

function candidate({
  id,
  intersectionArea,
  orientation = "vertical",
  rect = createInteractionRect(0, 100, 100, 100),
  sortableContainerId = null,
  triggerDistance = null,
}: {
  id: string;
  intersectionArea: number;
  orientation?: ListOrientation;
  rect?: ReturnType<typeof createInteractionRect>;
  sortableContainerId?: string | null;
  triggerDistance?: number | null;
}): CollisionCandidate {
  return {
    id,
    intersectionArea,
    orientation,
    rect,
    sortableContainerId,
    triggerDistance,
  };
}

describe("Phase 0 collision characterization", () => {
  it("records collision and nested-target source evidence", () => {
    expect(INTERACTION_FIXTURE_EVIDENCE.collision.sources).toEqual(
      expect.arrayContaining([
        "frontend/src/forks/dnd-kit/adapter/collision.ts",
        "frontend/src/forks/dnd-kit/adapter/collisionCompare.ts",
      ]),
    );
  });

  it("prefers sortable targets and signed trigger-distance ordering", () => {
    const plain = candidate({ id: "plain", intersectionArea: 1_000 });
    const postTrigger = candidate({
      id: "post-trigger",
      intersectionArea: 900,
      sortableContainerId: "container",
      triggerDistance: 5,
    });
    const preTrigger = candidate({
      id: "pre-trigger",
      intersectionArea: 1,
      sortableContainerId: "container",
      triggerDistance: -30,
    });

    expect(pickCollisionCandidate([plain, postTrigger, preTrigger], {})).toMatchObject({
      id: "pre-trigger",
    });
  });

  it("uses proximity within the same trigger state and overlap for distance ties", () => {
    const far = candidate({
      id: "far",
      intersectionArea: 100,
      sortableContainerId: "container",
      triggerDistance: 30,
    });
    const near = candidate({
      id: "near",
      intersectionArea: 1,
      sortableContainerId: "container",
      triggerDistance: 10,
    });
    const tiedHighOverlap = candidate({
      id: "tied-high-overlap",
      intersectionArea: 5,
      sortableContainerId: "container",
      triggerDistance: 10,
    });

    expect(pickCollisionCandidate([far, near], {})).toMatchObject({ id: "near" });
    expect(pickCollisionCandidate([near, tiedHighOverlap], {})).toMatchObject({
      id: "tied-high-overlap",
    });
  });

  it("promotes a colliding descendant above its higher-overlap ancestors", () => {
    const parent = candidate({ id: "parent", intersectionArea: 100 });
    const child = candidate({ id: "child", intersectionArea: 10 });
    const grandchild = candidate({ id: "grandchild", intersectionArea: 1 });

    expect(
      pickCollisionCandidate([parent, child, grandchild], { child: "parent", grandchild: "child" }),
    ).toMatchObject({ id: "grandchild" });
  });

  it("retains the previous target within the ten-percent overlap tolerance", () => {
    const previous = candidate({ id: "previous", intersectionArea: 100 });
    const challenger = candidate({ id: "challenger", intersectionArea: 105 });
    const first = resolveCollisionFrame({
      activeRect: createInteractionRect(0, 0, 20, 20),
      candidates: [previous],
      parentByChild: {},
      pointer: null,
    });
    const retained = resolveCollisionFrame({
      activeRect: createInteractionRect(0, 0, 20, 20),
      candidates: [previous, challenger],
      parentByChild: {},
      pointer: null,
      previousState: first.state,
    });

    expect(retained.candidate?.id).toBe("previous");

    const cleared = resolveCollisionFrame({
      activeRect: createInteractionRect(0, 0, 20, 20),
      candidates: [],
      parentByChild: {},
      pointer: null,
      previousState: retained.state,
    });
    expect(cleared.state.targetId).toBeNull();
    expect(
      resolveCollisionFrame({
        activeRect: createInteractionRect(0, 0, 20, 20),
        candidates: [previous, challenger],
        parentByChild: {},
        pointer: null,
        previousState: cleared.state,
      }).candidate?.id,
    ).toBe("challenger");
  });

  it("retains the old vertical target rectangle for one frame and buffers midpoint changes", () => {
    const initial = resolveCollisionFrame({
      activeRect: createInteractionRect(0, 140, 20, 20),
      candidates: [candidate({ id: "target", intersectionArea: 10 })],
      parentByChild: {},
      pointer: { x: 10, y: 150 },
    });
    expect(initial.state.pastMidpoint).toBe(false);

    const shiftedTarget = candidate({
      id: "target",
      intersectionArea: 10,
      rect: createInteractionRect(0, 300, 100, 100),
    });
    const crossed = resolveCollisionFrame({
      activeRect: createInteractionRect(0, 141, 20, 20),
      candidates: [shiftedTarget],
      parentByChild: {},
      pointer: { x: 10, y: 151 },
      previousState: initial.state,
    });

    expect(crossed.state.pastMidpoint).toBe(true);
    expect(crossed.state.targetRect).toEqual(shiftedTarget.rect);
  });

  it("uses the logical horizontal axis for sibling midpoint transitions", () => {
    const horizontalTarget = candidate({
      id: "target",
      intersectionArea: 10,
      orientation: "horizontal",
      rect: createInteractionRect(100, 0, 100, 100),
    });
    const initial = resolveCollisionFrame({
      activeRect: createInteractionRect(140, 0, 20, 20),
      candidates: [horizontalTarget],
      parentByChild: {},
      pointer: { x: 150, y: 10 },
      previousState: EMPTY_COLLISION_TRACKER_STATE,
    });
    const crossed = resolveCollisionFrame({
      activeRect: createInteractionRect(141, 0, 20, 20),
      candidates: [horizontalTarget],
      parentByChild: {},
      pointer: { x: 151, y: 10 },
      previousState: initial.state,
    });

    expect(initial.state.pastMidpoint).toBe(false);
    expect(crossed.state.pastMidpoint).toBe(true);
  });
});
