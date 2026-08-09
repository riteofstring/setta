import { describe, expect, it, vi } from "vitest";

import {
  SortableItemTreeValidationError,
  deriveSortableItemParentLookup,
  getSortableItemOrder,
  normalizeSortableItemSelectionRoots,
  planSortableItemMove,
  resolveSortableItemDragBlock,
  resolveSortableItemSelectionChange,
  validateSortableItemTree,
  type SortableItemTree,
  type SortableItemTreeValidationCode,
} from "../src/core.js";

function tree(): SortableItemTree {
  return {
    childrenByParent: {
      a: ["a-1", "a-2"],
      group: ["group-1"],
      root: ["b", "a", "group", "empty"],
    },
    itemIds: ["a", "a-1", "a-2", "group", "group-1", "b", "empty"],
    rootId: "root",
  };
}

function expectTreeError(
  value: unknown,
  code: SortableItemTreeValidationCode,
  path?: string,
): void {
  let thrown: unknown;
  try {
    validateSortableItemTree(value);
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(SortableItemTreeValidationError);
  expect(thrown).toMatchObject(path ? { code, path } : { code });
}

describe("sortable item tree validation", () => {
  it("validates one non-rendered root and derives canonical parents and preorder", () => {
    const candidate = tree();

    expect(() => validateSortableItemTree(candidate)).not.toThrow();
    expect([...deriveSortableItemParentLookup(candidate)]).toEqual([
      ["b", "root"],
      ["a", "root"],
      ["a-1", "a"],
      ["a-2", "a"],
      ["group", "root"],
      ["group-1", "group"],
      ["empty", "root"],
    ]);
    expect(getSortableItemOrder(candidate)).toEqual([
      "b",
      "a",
      "a-1",
      "a-2",
      "group",
      "group-1",
      "empty",
    ]);
  });

  it("validates a deeply nested tree without recursive traversal", () => {
    const depth = 2_048;
    const itemIds = Array.from({ length: depth }, (_, index) => `item-${String(index)}`);
    const childrenByParent = Object.create(null) as Record<string, readonly string[]>;
    childrenByParent.root = ["item-0"];
    itemIds.forEach((itemId, index) => {
      const childId = itemIds[index + 1];
      if (childId) {
        childrenByParent[itemId] = [childId];
      }
    });
    const candidate: SortableItemTree = { childrenByParent, itemIds, rootId: "root" };

    expect(getSortableItemOrder(candidate)).toHaveLength(depth);
    expect(getSortableItemOrder(candidate).at(-1)).toBe(`item-${String(depth - 1)}`);
  });

  it("rejects duplicate IDs and any use of the root as a rendered item", () => {
    expectTreeError(
      { childrenByParent: { root: ["a"] }, itemIds: ["a", "a"], rootId: "root" },
      "duplicate-item",
      "$.itemIds[1]",
    );
    expectTreeError(
      { childrenByParent: {}, itemIds: ["root"], rootId: "root" },
      "root-placement",
      "$.itemIds[0]",
    );
    expectTreeError(
      { childrenByParent: { root: ["root"] }, itemIds: [], rootId: "root" },
      "root-placement",
    );
  });

  it("rejects unknown parents, unknown children, duplicate placement, and unreachable items", () => {
    expectTreeError(
      { childrenByParent: { missing: ["a"] }, itemIds: ["a"], rootId: "root" },
      "unknown-parent",
    );
    expectTreeError(
      { childrenByParent: { root: ["missing"] }, itemIds: ["a"], rootId: "root" },
      "unknown-item",
    );
    expectTreeError(
      {
        childrenByParent: { a: ["b"], root: ["a", "b"] },
        itemIds: ["a", "b"],
        rootId: "root",
      },
      "duplicate-placement",
    );
    expectTreeError(
      { childrenByParent: { root: ["a"] }, itemIds: ["a", "b"], rootId: "root" },
      "unreachable-item",
      "$.itemIds[1]",
    );
  });

  it("rejects disconnected self and multi-item cycles specifically", () => {
    expectTreeError({ childrenByParent: { a: ["a"] }, itemIds: ["a"], rootId: "root" }, "cycle");
    expectTreeError(
      {
        childrenByParent: { a: ["b"], b: ["a"] },
        itemIds: ["a", "b"],
        rootId: "root",
      },
      "cycle",
    );
  });

  it("rejects sparse, accessor-backed, symbol, extra, and custom-prototype inputs", () => {
    const sparseItems = Array(1) as string[];
    expectTreeError(
      { childrenByParent: {}, itemIds: sparseItems, rootId: "root" },
      "invalid-tree",
      "$.itemIds",
    );

    const accessor = { itemIds: [], rootId: "root" } as Record<string, unknown>;
    const getter = vi.fn(() => ({}));
    Object.defineProperty(accessor, "childrenByParent", { enumerable: true, get: getter });
    expectTreeError(accessor, "invalid-tree");
    expect(getter).not.toHaveBeenCalled();

    expectTreeError(
      { childrenByParent: {}, extra: true, itemIds: [], rootId: "root" },
      "invalid-tree",
      "$.extra",
    );
    const symbolTree = { childrenByParent: {}, itemIds: [], rootId: "root" } as Record<
      PropertyKey,
      unknown
    >;
    symbolTree[Symbol("hidden")] = true;
    expectTreeError(symbolTree, "invalid-tree");
    expectTreeError(Object.create({ rootId: "root" }), "invalid-tree", "$");
  });

  it("preserves legal prototype-mutator IDs through lookup and ordering", () => {
    const childrenByParent = Object.create(null) as Record<string, readonly string[]>;
    childrenByParent["__proto__"] = ["constructor"];
    childrenByParent["constructor"] = ["toString"];
    const candidate: SortableItemTree = {
      childrenByParent,
      itemIds: ["constructor", "toString"],
      rootId: "__proto__",
    };

    expect(getSortableItemOrder(candidate)).toEqual(["constructor", "toString"]);
    expect(deriveSortableItemParentLookup(candidate).get("constructor")).toBe("__proto__");
  });
});

describe("sortable item selection planning", () => {
  it("supports replacement and modifier-style toggling in canonical tree order", () => {
    expect(resolveSortableItemSelectionChange(tree(), ["a-2"], "group-1", "replace")).toEqual([
      "group-1",
    ]);
    expect(resolveSortableItemSelectionChange(tree(), ["a-2"], "b", "toggle")).toEqual([
      "b",
      "a-2",
    ]);
    expect(resolveSortableItemSelectionChange(tree(), ["b", "a-2"], "b", "toggle")).toEqual([
      "a-2",
    ]);
  });

  it("normalizes parent-plus-descendant selection to stable roots", () => {
    expect(normalizeSortableItemSelectionRoots(tree(), ["group-1", "a-2", "a"])).toEqual([
      "a",
      "group-1",
    ]);
    expect(resolveSortableItemDragBlock(tree(), ["a-2", "a-1"], "a-2")).toEqual({
      fallbackReason: null,
      itemIds: ["a-1", "a-2"],
      selectedItemIds: ["a-1", "a-2"],
      sourceParentId: "a",
    });
  });

  it("keeps mixed-parent selection but falls drag movement back to the active item", () => {
    expect(resolveSortableItemDragBlock(tree(), ["group-1", "a-1"], "a-1")).toEqual({
      fallbackReason: 'Selected items do not share one parent. Only "a-1" will move.',
      itemIds: ["a-1"],
      selectedItemIds: ["a-1", "group-1"],
      sourceParentId: "a",
    });
  });

  it("selects only an unselected active item and rejects stale selection IDs", () => {
    expect(resolveSortableItemDragBlock(tree(), ["a-1", "a-2"], "group-1")).toEqual({
      fallbackReason: null,
      itemIds: ["group-1"],
      selectedItemIds: ["group-1"],
      sourceParentId: "group",
    });
    expect(() => normalizeSortableItemSelectionRoots(tree(), ["missing"])).toThrow(
      '"missing" is not in the sortable item tree',
    );
  });
});

describe("sortable item move planning", () => {
  it("plans flat single-item reordering and resolves the post-removal index", () => {
    const candidate = tree();
    const before = structuredClone(candidate);
    const decision = planSortableItemMove({
      activeItemId: "b",
      destinationIndex: 2,
      destinationParentId: "root",
      selectedItemIds: ["b"],
      tree: candidate,
    });

    expect(decision).toMatchObject({
      plan: {
        destinationIndex: 1,
        destinationParentId: "root",
        itemIds: ["b"],
        sourceParentId: "root",
      },
      status: "planned",
    });
    expect(candidate).toEqual(before);
  });

  it("plans a selected sibling block in stable source order", () => {
    expect(
      planSortableItemMove({
        activeItemId: "b",
        destinationIndex: 4,
        destinationParentId: "root",
        selectedItemIds: ["group", "b"],
        tree: tree(),
      }),
    ).toMatchObject({
      block: { itemIds: ["b", "group"] },
      plan: {
        destinationIndex: 2,
        destinationParentId: "root",
        itemIds: ["b", "group"],
        sourceParentId: "root",
      },
      status: "planned",
    });
  });

  it("plans nested moves into, out of, and across parents, including an empty parent", () => {
    expect(
      planSortableItemMove({
        activeItemId: "b",
        destinationIndex: 1,
        destinationParentId: "a",
        selectedItemIds: ["b"],
        tree: tree(),
      }),
    ).toMatchObject({
      plan: { destinationIndex: 1, destinationParentId: "a", sourceParentId: "root" },
      status: "planned",
    });
    expect(
      planSortableItemMove({
        activeItemId: "a-1",
        destinationIndex: 1,
        destinationParentId: "group",
        selectedItemIds: ["a-1"],
        tree: tree(),
      }),
    ).toMatchObject({
      plan: { destinationParentId: "group", sourceParentId: "a" },
      status: "planned",
    });
    expect(
      planSortableItemMove({
        activeItemId: "group-1",
        destinationIndex: 0,
        destinationParentId: "root",
        selectedItemIds: ["group-1"],
        tree: tree(),
      }),
    ).toMatchObject({
      plan: { destinationIndex: 0, destinationParentId: "root", sourceParentId: "group" },
      status: "planned",
    });
    expect(
      planSortableItemMove({
        activeItemId: "a-1",
        destinationIndex: 0,
        destinationParentId: "empty",
        selectedItemIds: ["a-2", "a-1"],
        tree: tree(),
      }),
    ).toMatchObject({
      plan: { destinationIndex: 0, destinationParentId: "empty", itemIds: ["a-1", "a-2"] },
      status: "planned",
    });
  });

  it("recognizes no-op boundaries before consulting host policy", () => {
    const canMove = vi.fn(() => false);
    expect(
      planSortableItemMove({
        activeItemId: "a",
        canMove,
        destinationIndex: 2,
        destinationParentId: "root",
        selectedItemIds: ["a"],
        tree: tree(),
      }),
    ).toMatchObject({ status: "unchanged" });
    expect(canMove).not.toHaveBeenCalled();
  });

  it("rejects self and descendant destinations without consulting host policy", () => {
    const canMove = vi.fn(() => true);
    for (const destinationParentId of ["a", "a-1"]) {
      expect(
        planSortableItemMove({
          activeItemId: "a",
          canMove,
          destinationIndex: 0,
          destinationParentId,
          selectedItemIds: ["a", "a-2"],
          tree: tree(),
        }),
      ).toMatchObject({ code: "cycle", status: "rejected" });
    }
    expect(canMove).not.toHaveBeenCalled();
  });

  it("rejects unknown parents and invalid current-tree insertion boundaries", () => {
    expect(
      planSortableItemMove({
        activeItemId: "a",
        destinationIndex: 0,
        destinationParentId: "missing",
        selectedItemIds: ["a"],
        tree: tree(),
      }),
    ).toMatchObject({ code: "unknown-destination-parent", status: "rejected" });
    for (const destinationIndex of [-1, 5, 0.5, Number.NaN]) {
      expect(
        planSortableItemMove({
          activeItemId: "a",
          destinationIndex,
          destinationParentId: "root",
          selectedItemIds: ["a"],
          tree: tree(),
        }),
      ).toMatchObject({ code: "invalid-destination-index", status: "rejected" });
    }
  });

  it("applies containment policy only to item destinations", () => {
    const canContainChildren = vi.fn((itemId: string) => itemId !== "empty");
    expect(
      planSortableItemMove({
        activeItemId: "a-1",
        canContainChildren,
        destinationIndex: 0,
        destinationParentId: "empty",
        selectedItemIds: ["a-1"],
        tree: tree(),
      }),
    ).toMatchObject({ code: "destination-cannot-contain", status: "rejected" });
    expect(
      planSortableItemMove({
        activeItemId: "group-1",
        canContainChildren,
        destinationIndex: 0,
        destinationParentId: "root",
        selectedItemIds: ["group-1"],
        tree: tree(),
      }),
    ).toMatchObject({ status: "planned" });
    expect(canContainChildren).toHaveBeenCalledTimes(1);
  });

  it("passes one immutable atomic plan to host policy and reports rejection", () => {
    const canMove = vi.fn((plan: Readonly<{ itemIds: readonly string[] }>) => {
      expect(Object.isFrozen(plan)).toBe(true);
      expect(Object.isFrozen(plan.itemIds)).toBe(true);
      return false;
    });
    const decision = planSortableItemMove({
      activeItemId: "a-2",
      canMove,
      destinationIndex: 0,
      destinationParentId: "group",
      selectedItemIds: ["a-1", "a-2"],
      tree: tree(),
    });

    expect(decision).toMatchObject({ code: "host-policy", status: "rejected" });
    expect(canMove).toHaveBeenCalledOnce();
    expect(canMove.mock.calls[0]?.[0]).toEqual({
      destinationIndex: 0,
      destinationParentId: "group",
      itemIds: ["a-1", "a-2"],
      sourceParentId: "a",
    });
  });

  it("plans only the active item when a selected batch has mixed parents", () => {
    expect(
      planSortableItemMove({
        activeItemId: "a-1",
        destinationIndex: 0,
        destinationParentId: "empty",
        selectedItemIds: ["a-1", "group-1"],
        tree: tree(),
      }),
    ).toMatchObject({
      block: {
        fallbackReason: 'Selected items do not share one parent. Only "a-1" will move.',
        itemIds: ["a-1"],
        selectedItemIds: ["a-1", "group-1"],
      },
      plan: { itemIds: ["a-1"] },
      status: "planned",
    });
  });

  it("fails specifically when host callbacks violate their boolean contracts", () => {
    expect(() =>
      planSortableItemMove({
        activeItemId: "a-1",
        canContainChildren: (() => "yes") as unknown as (itemId: string) => boolean,
        destinationIndex: 0,
        destinationParentId: "empty",
        selectedItemIds: ["a-1"],
        tree: tree(),
      }),
    ).toThrow("canContainChildren must return a boolean");
    expect(() =>
      planSortableItemMove({
        activeItemId: "a-1",
        canMove: (() => null) as unknown as () => boolean,
        destinationIndex: 0,
        destinationParentId: "group",
        selectedItemIds: ["a-1"],
        tree: tree(),
      }),
    ).toThrow("canMove must return a boolean");
  });
});
