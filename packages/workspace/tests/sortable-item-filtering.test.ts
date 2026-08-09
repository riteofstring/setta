import { describe, expect, it } from "vitest";

import {
  applySortableItemMove,
  createFilteredSortableItemTree,
  reconcileFilteredSortableItemMove,
  type SortableItemTree,
} from "../src/core.js";

function canonicalTree(): SortableItemTree {
  return {
    childrenByParent: {
      group: ["hidden-child", "visible-child"],
      root: ["hidden-first", "alpha", "hidden-middle", "beta", "group", "hidden-last"],
    },
    itemIds: [
      "hidden-first",
      "alpha",
      "hidden-middle",
      "beta",
      "group",
      "hidden-child",
      "visible-child",
      "hidden-last",
    ],
    rootId: "root",
  };
}

describe("filtered sortable item trees", () => {
  it("projects an ancestry-closed view without mutating the canonical tree", () => {
    const canonical = canonicalTree();
    const filtered = createFilteredSortableItemTree(canonical, [
      "group",
      "beta",
      "visible-child",
      "alpha",
    ]);

    expect(filtered).not.toBe(canonical);
    expect(filtered).toEqual({
      childrenByParent: {
        group: ["visible-child"],
        root: ["alpha", "beta", "group"],
      },
      itemIds: ["alpha", "beta", "group", "visible-child"],
      rootId: "root",
    });
    expect(canonicalTree()).toEqual(canonical);
    expect(createFilteredSortableItemTree(canonical, canonical.itemIds)).toBe(canonical);
  });

  it("supports a completely filtered branch and preserves known empty branches", () => {
    const canonical = canonicalTree();
    const filtered = createFilteredSortableItemTree(canonical, ["group"]);

    expect(filtered.childrenByParent.root).toEqual(["group"]);
    expect(filtered.childrenByParent.group).toEqual([]);
    expect(filtered.itemIds).toEqual(["group"]);
  });

  it("rejects malformed, duplicate, unknown, and ancestry-gapped projections specifically", () => {
    const canonical = canonicalTree();
    expect(() => createFilteredSortableItemTree(canonical, ["alpha", "alpha"])).toThrow(
      'Filtered sortable item ID "alpha" is duplicated',
    );
    expect(() => createFilteredSortableItemTree(canonical, ["missing"])).toThrow(
      'Filtered sortable item ID "missing" is unknown',
    );
    expect(() => createFilteredSortableItemTree(canonical, ["visible-child"])).toThrow(
      'requires visible ancestor "group"',
    );
    expect(() =>
      createFilteredSortableItemTree(canonical, Object.assign(["alpha"], { extra: true })),
    ).toThrow("must be a dense array without extra fields");
    expect(() =>
      createFilteredSortableItemTree(canonical, ["alpha", undefined] as unknown as string[]),
    ).toThrow("at index 1 must be a non-empty string");
  });

  it("anchors an upward filtered reorder before the next visible canonical sibling", () => {
    const canonical = canonicalTree();
    const filteredPlan = {
      destinationIndex: 0,
      destinationParentId: "root",
      itemIds: ["beta"],
      sourceParentId: "root",
    } as const;
    const plan = reconcileFilteredSortableItemMove(
      canonical,
      ["alpha", "beta", "group", "visible-child"],
      filteredPlan,
    );

    expect(plan).toEqual({ ...filteredPlan, destinationIndex: 1 });
    expect(applySortableItemMove(canonical, plan).childrenByParent.root).toEqual([
      "hidden-first",
      "beta",
      "alpha",
      "hidden-middle",
      "group",
      "hidden-last",
    ]);
  });

  it("anchors a downward filtered reorder after the previous visible canonical sibling", () => {
    const canonical = canonicalTree();
    const plan = reconcileFilteredSortableItemMove(
      canonical,
      ["alpha", "beta", "group", "visible-child"],
      {
        destinationIndex: 2,
        destinationParentId: "root",
        itemIds: ["alpha"],
        sourceParentId: "root",
      },
    );

    expect(plan.destinationIndex).toBe(4);
    expect(applySortableItemMove(canonical, plan).childrenByParent.root).toEqual([
      "hidden-first",
      "hidden-middle",
      "beta",
      "group",
      "alpha",
      "hidden-last",
    ]);
  });

  it("moves canonical hidden descendants with their visible subtree root", () => {
    const canonical = canonicalTree();
    const plan = reconcileFilteredSortableItemMove(
      canonical,
      ["alpha", "beta", "group", "visible-child"],
      {
        destinationIndex: 1,
        destinationParentId: "root",
        itemIds: ["group"],
        sourceParentId: "root",
      },
    );
    const next = applySortableItemMove(canonical, plan);

    expect(next.childrenByParent.root).toEqual([
      "hidden-first",
      "alpha",
      "hidden-middle",
      "group",
      "beta",
      "hidden-last",
    ]);
    expect(next.childrenByParent.group).toEqual(["hidden-child", "visible-child"]);
  });

  it("appends to a destination with no visible children while preserving hidden order", () => {
    const canonical = canonicalTree();
    const plan = reconcileFilteredSortableItemMove(canonical, ["alpha", "group"], {
      destinationIndex: 0,
      destinationParentId: "group",
      itemIds: ["alpha"],
      sourceParentId: "root",
    });
    const next = applySortableItemMove(canonical, plan);

    expect(plan.destinationIndex).toBe(2);
    expect(next.childrenByParent.group).toEqual(["hidden-child", "visible-child", "alpha"]);
  });

  it("validates the move against both the filtered and canonical trees", () => {
    const canonical = canonicalTree();
    expect(() =>
      reconcileFilteredSortableItemMove(canonical, ["alpha", "beta"], {
        destinationIndex: 1,
        destinationParentId: "root",
        itemIds: ["hidden-middle"],
        sourceParentId: "root",
      }),
    ).toThrow('move plan item "hidden-middle" is unknown');
    expect(() =>
      reconcileFilteredSortableItemMove(canonical, ["alpha", "beta"], {
        destinationIndex: 3,
        destinationParentId: "root",
        itemIds: ["alpha"],
        sourceParentId: "root",
      }),
    ).toThrow("destinationIndex must be an integer from 0 through 1");
  });
});
