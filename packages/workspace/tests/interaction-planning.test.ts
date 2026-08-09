import { describe, expect, it } from "vitest";

import {
  applySectionMovePlan,
  createInteractionRect,
  planSectionMove,
  resolveCanvasDropPositions,
  resolveRectBoundsById,
  resolveSelectionBlock,
  resolveSortingPreview,
  type SectionHierarchySnapshot,
} from "../src/testing.js";
import { INTERACTION_FIXTURE_EVIDENCE } from "./fixtures/interaction-evidence.js";

function hierarchy(): SectionHierarchySnapshot {
  return {
    rootSectionIds: ["root-b", "root-a", "container", "empty"],
    childrenByParent: {
      container: ["child-a", "child-b", "nested"],
      empty: [],
      nested: ["grandchild"],
    },
    parentByChild: {
      "child-a": "container",
      "child-b": "container",
      container: null,
      empty: null,
      grandchild: "nested",
      nested: "container",
      "root-a": null,
      "root-b": null,
    },
    rootPositions: {
      container: { x: 100, y: 100 },
      empty: { x: 500, y: 100 },
      "root-a": { x: 0, y: 0 },
      "root-b": { x: 20, y: 0 },
    },
  };
}

describe("Phase 0 selection characterization", () => {
  it("normalizes ancestor/descendant selection to one movement root", () => {
    expect(resolveSelectionBlock(["grandchild", "nested"], hierarchy())).toEqual({
      allowed: true,
      block: {
        sectionIds: ["nested"],
        sourceParentId: "container",
      },
    });
  });

  it("orders nested blocks canonically and top-level blocks spatially", () => {
    expect(resolveSelectionBlock(["child-b", "child-a"], hierarchy())).toEqual({
      allowed: true,
      block: {
        sectionIds: ["child-a", "child-b"],
        sourceParentId: "container",
      },
    });
    expect(resolveSelectionBlock(["root-b", "root-a"], hierarchy())).toEqual({
      allowed: true,
      block: {
        sectionIds: ["root-a", "root-b"],
        sourceParentId: null,
      },
    });
  });

  it("rejects mixed-parent blocks with one specific result", () => {
    expect(resolveSelectionBlock(["root-a", "child-a"], hierarchy())).toEqual({
      allowed: false,
      code: "mixed-parent-selection",
      reason: "Selected sections must share one parent for batch movement.",
    });
  });

  it("uses the same generic normalization and bounds for item-tree blocks", () => {
    const itemHierarchy: SectionHierarchySnapshot = {
      rootSectionIds: [],
      childrenByParent: { group: ["item-a", "item-b", "item-c"] },
      parentByChild: {
        "item-a": "group",
        "item-b": "group",
        "item-c": "group",
      },
      rootPositions: {},
    };
    const selection = resolveSelectionBlock(["item-c", "item-a"], itemHierarchy);
    const bounds = resolveRectBoundsById(["item-a", "item-c"], {
      "item-a": createInteractionRect(0, 0, 100, 20),
      "item-c": createInteractionRect(0, 60, 100, 20),
    });

    expect(selection).toEqual({
      allowed: true,
      block: { sectionIds: ["item-a", "item-c"], sourceParentId: "group" },
    });
    expect(bounds).toEqual(createInteractionRect(0, 0, 100, 80));
  });
});

describe("Phase 0 layout-stable preview characterization", () => {
  it("keeps vertical DOM order stable while translating active and displaced siblings", () => {
    const ids = ["a", "b", "c"];
    const preview = resolveSortingPreview({
      activeId: "a",
      ids,
      orientation: "vertical",
      pastMidpoint: true,
      rectsById: {
        a: createInteractionRect(0, 0, 100, 10),
        b: createInteractionRect(0, 20, 100, 10),
        c: createInteractionRect(0, 40, 100, 10),
      },
      targetId: "b",
    });

    expect(ids).toEqual(["a", "b", "c"]);
    expect(preview).toMatchObject({
      destinationIndex: 1,
      order: ["b", "a", "c"],
      transformsById: {
        a: { x: 0, y: 20, scaleX: 1, scaleY: 1 },
        b: { x: 0, y: -20, scaleX: 1, scaleY: 1 },
        c: { x: 0, y: 0, scaleX: 1, scaleY: 1 },
      },
    });
  });

  it("uses the horizontal axis and does not insert before the midpoint is crossed", () => {
    const rects = {
      a: createInteractionRect(0, 0, 10, 100),
      b: createInteractionRect(20, 0, 10, 100),
      c: createInteractionRect(40, 0, 10, 100),
    };
    const before = resolveSortingPreview({
      activeId: "a",
      ids: ["a", "b", "c"],
      orientation: "horizontal",
      pastMidpoint: false,
      rectsById: rects,
      targetId: "b",
    });
    const after = resolveSortingPreview({
      activeId: "a",
      ids: ["a", "b", "c"],
      orientation: "horizontal",
      pastMidpoint: true,
      rectsById: rects,
      targetId: "b",
    });

    expect(before?.order).toEqual(["a", "b", "c"]);
    expect(after?.transformsById).toMatchObject({
      a: { x: 20, y: 0 },
      b: { x: -20, y: 0 },
    });
  });
});

describe("Phase 0 section-move planning characterization", () => {
  it("records planning and preview source evidence", () => {
    expect(INTERACTION_FIXTURE_EVIDENCE.movement.sources).toContain(
      "frontend/src/forks/dnd-kit/useMoveSectionPlans.ts",
    );
    expect(INTERACTION_FIXTURE_EVIDENCE.preview.sources).toContain(
      "frontend/src/forks/dnd-kit/adapter/sorting.ts",
    );
  });

  it("plans an atomic sibling-block sort and applies it without mutating input", () => {
    const snapshot = hierarchy();
    const before = structuredClone(snapshot);
    const decision = planSectionMove({
      destination: { parentId: "container", index: 0, topLevelPositions: null },
      hierarchy: snapshot,
      mode: "sort",
      selectedIds: ["child-b", "child-a"],
    });

    expect(decision).toMatchObject({ status: "unchanged" });
    expect(snapshot).toEqual(before);

    const moved = planSectionMove({
      destination: { parentId: "container", index: 1, topLevelPositions: null },
      hierarchy: snapshot,
      mode: "sort",
      selectedIds: ["child-a"],
    });
    expect(moved).toMatchObject({
      status: "planned",
      plan: {
        destinationIndex: 1,
        destinationParentId: "container",
        mode: "sort",
        sectionIds: ["child-a"],
        sourceParentId: "container",
      },
    });
    if (moved.status === "planned") {
      expect(applySectionMovePlan(snapshot, moved.plan).childrenByParent.container).toEqual([
        "child-b",
        "child-a",
        "nested",
      ]);
    }
    expect(snapshot).toEqual(before);
  });

  it("plans canvas-to-nested, nested-to-canvas, and nested-to-nested moves", () => {
    const snapshot = hierarchy();
    const canvasToNested = planSectionMove({
      destination: { parentId: "container", index: 1, topLevelPositions: null },
      hierarchy: snapshot,
      mode: "free",
      selectedIds: ["root-a"],
    });
    const nestedToCanvas = planSectionMove({
      destination: {
        parentId: null,
        index: 1,
        topLevelPositions: { "child-a": { x: -50, y: 250 } },
      },
      hierarchy: snapshot,
      mode: "free",
      selectedIds: ["child-a"],
    });
    const nestedToNested = planSectionMove({
      destination: { parentId: "nested", index: 1, topLevelPositions: null },
      hierarchy: snapshot,
      mode: "free",
      selectedIds: ["child-a"],
    });

    expect(canvasToNested).toMatchObject({
      status: "planned",
      plan: { destinationParentId: "container", sectionIds: ["root-a"] },
    });
    expect(nestedToCanvas).toMatchObject({
      status: "planned",
      plan: {
        destinationParentId: null,
        topLevelPositions: { "child-a": { x: -50, y: 250 } },
      },
    });
    expect(nestedToNested).toMatchObject({
      status: "planned",
      plan: { destinationParentId: "nested", destinationIndex: 1 },
    });
  });

  it("inserts into an empty container and preserves selected sibling order", () => {
    const decision = planSectionMove({
      destination: { parentId: "empty", index: 0, topLevelPositions: null },
      hierarchy: hierarchy(),
      mode: "free",
      selectedIds: ["child-b", "child-a"],
    });

    expect(decision).toMatchObject({
      status: "planned",
      plan: { sectionIds: ["child-a", "child-b"] },
    });
    if (decision.status === "planned") {
      expect(applySectionMovePlan(hierarchy(), decision.plan).childrenByParent.empty).toEqual([
        "child-a",
        "child-b",
      ]);
    }
  });

  it("preserves relative offsets for a top-level selection block", () => {
    const topLevelPositions = resolveCanvasDropPositions(
      ["root-a", "root-b"],
      {
        "root-a": createInteractionRect(0, 0, 100, 80),
        "root-b": createInteractionRect(40, 0, 100, 80),
      },
      { x: 200, y: 100 },
      { x: 0, y: 0, zoom: 2 },
    );
    expect(topLevelPositions).not.toBeNull();
    const decision = planSectionMove({
      destination: {
        parentId: null,
        index: 0,
        topLevelPositions,
      },
      hierarchy: hierarchy(),
      mode: "free",
      selectedIds: ["root-b", "root-a"],
    });

    expect(decision).toMatchObject({
      status: "planned",
      plan: {
        sectionIds: ["root-a", "root-b"],
        topLevelPositions: {
          "root-a": { x: 100, y: 50 },
          "root-b": { x: 120, y: 50 },
        },
      },
    });
    if (decision.status === "planned") {
      expect(applySectionMovePlan(hierarchy(), decision.plan).rootSectionIds).toEqual([
        "root-b",
        "root-a",
        "container",
        "empty",
      ]);
    }
  });

  it("rejects descendant cycles and sort-mode parent changes before preview", () => {
    expect(
      planSectionMove({
        destination: { parentId: "grandchild", index: 0, topLevelPositions: null },
        hierarchy: hierarchy(),
        mode: "free",
        selectedIds: ["container"],
      }),
    ).toEqual({
      status: "rejected",
      code: "invalid-move",
      reason: "A section cannot move into itself or one of its descendants.",
    });
    expect(
      planSectionMove({
        destination: { parentId: "nested", index: 0, topLevelPositions: null },
        hierarchy: hierarchy(),
        mode: "sort",
        selectedIds: ["child-a"],
      }),
    ).toEqual({
      status: "rejected",
      code: "invalid-move",
      reason: "Sorting mode cannot change a section's parent.",
    });
  });

  it("rejects unknown destination parents before preview", () => {
    expect(
      planSectionMove({
        destination: { parentId: "missing", index: 0, topLevelPositions: null },
        hierarchy: hierarchy(),
        mode: "free",
        selectedIds: ["child-a"],
      }),
    ).toEqual({
      status: "rejected",
      code: "invalid-move",
      reason: 'Destination parent "missing" is not in the hierarchy.',
    });
  });

  it("represents cancellation and host rejection without a partial plan", () => {
    expect(
      planSectionMove({
        cancelled: true,
        destination: { parentId: "empty", index: 0, topLevelPositions: null },
        hierarchy: hierarchy(),
        mode: "free",
        selectedIds: ["child-a"],
      }),
    ).toEqual({ status: "cancelled" });
    expect(
      planSectionMove({
        destination: { parentId: "empty", index: 0, topLevelPositions: null },
        hierarchy: hierarchy(),
        mode: "free",
        selectedIds: ["child-a"],
        validate: () => ({ allowed: false, reason: "Host policy rejected Empty." }),
      }),
    ).toEqual({
      status: "rejected",
      code: "host-policy",
      reason: "Host policy rejected Empty.",
    });
  });
});
