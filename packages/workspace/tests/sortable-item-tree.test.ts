import { describe, expect, it, vi } from "vitest";

import {
  SortableItemTreeValidationError,
  applySortableItemMove,
  deriveSortableItemParentLookup,
  getSortableItemOrder,
  normalizeSortableItemSelectionRoots,
  planSortableItemKeyboardMove,
  planSortableItemMove,
  resolveSortableItemDragBlock,
  resolveSortableItemSelectionChange,
  validateSortableItemTree,
  type ItemMovePlan,
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
      itemIds: ["a-1", "a-2"],
      selectedItemIds: ["a-1", "a-2"],
      sourceParentIds: ["a", "a"],
    });
  });

  it("keeps mixed-parent selection as one canonical movement block", () => {
    expect(resolveSortableItemDragBlock(tree(), ["group-1", "a-1"], "a-1")).toEqual({
      itemIds: ["a-1", "group-1"],
      selectedItemIds: ["a-1", "group-1"],
      sourceParentIds: ["a", "group"],
    });
  });

  it("selects only an unselected active item and rejects stale selection IDs", () => {
    expect(resolveSortableItemDragBlock(tree(), ["a-1", "a-2"], "group-1")).toEqual({
      itemIds: ["group-1"],
      selectedItemIds: ["group-1"],
      sourceParentIds: ["group"],
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
        sourceParentIds: ["root"],
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
        sourceParentIds: ["root", "root"],
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
      plan: { destinationIndex: 1, destinationParentId: "a", sourceParentIds: ["root"] },
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
      plan: { destinationParentId: "group", sourceParentIds: ["a"] },
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
      plan: { destinationIndex: 0, destinationParentId: "root", sourceParentIds: ["group"] },
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
    const canMove = vi.fn((plan: ItemMovePlan) => {
      expect(Object.isFrozen(plan)).toBe(true);
      expect(Object.isFrozen(plan.itemIds)).toBe(true);
      expect(Object.isFrozen(plan.sourceParentIds)).toBe(true);
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
      sourceParentIds: ["a", "a"],
    });
  });

  it("plans a mixed-parent batch against one destination", () => {
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
        itemIds: ["a-1", "group-1"],
        selectedItemIds: ["a-1", "group-1"],
        sourceParentIds: ["a", "group"],
      },
      plan: {
        destinationParentId: "empty",
        itemIds: ["a-1", "group-1"],
        sourceParentIds: ["a", "group"],
      },
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

describe("sortable item move application", () => {
  it("applies one immutable sibling block move and preserves unaffected tree fields", () => {
    const candidate = tree();
    const next = applySortableItemMove(candidate, {
      destinationIndex: 2,
      destinationParentId: "root",
      itemIds: ["b", "group"],
      sourceParentIds: ["root", "root"],
    });

    expect(next).not.toBe(candidate);
    expect(next.itemIds).toBe(candidate.itemIds);
    expect(next.childrenByParent).toEqual({
      a: ["a-1", "a-2"],
      group: ["group-1"],
      root: ["a", "empty", "b", "group"],
    });
    expect(candidate.childrenByParent.root).toEqual(["b", "a", "group", "empty"]);
  });

  it("moves a sibling block across parents and keeps its subtree attached", () => {
    const candidate = tree();
    const next = applySortableItemMove(candidate, {
      destinationIndex: 0,
      destinationParentId: "empty",
      itemIds: ["a-1", "a-2"],
      sourceParentIds: ["a", "a"],
    });

    expect(next.childrenByParent.a).toEqual([]);
    expect(next.childrenByParent.empty).toEqual(["a-1", "a-2"]);
    expect(next.childrenByParent.group).toBe(candidate.childrenByParent.group);
    expect(getSortableItemOrder(next)).toEqual([
      "b",
      "a",
      "group",
      "group-1",
      "empty",
      "a-1",
      "a-2",
    ]);
  });

  it("removes mixed-parent roots atomically and keeps complete subtrees attached", () => {
    const candidate = tree();
    const next = applySortableItemMove(candidate, {
      destinationIndex: 0,
      destinationParentId: "empty",
      itemIds: ["a-1", "group"],
      sourceParentIds: ["a", "root"],
    });

    expect(next.childrenByParent.a).toEqual(["a-2"]);
    expect(next.childrenByParent.root).toEqual(["b", "a", "empty"]);
    expect(next.childrenByParent.empty).toEqual(["a-1", "group"]);
    expect(next.childrenByParent.group).toBe(candidate.childrenByParent.group);
    expect(getSortableItemOrder(next)).toEqual([
      "b",
      "a",
      "a-2",
      "empty",
      "a-1",
      "group",
      "group-1",
    ]);
  });

  it("returns the original tree for a no-op and rejects stale or unsafe plans", () => {
    const candidate = tree();
    expect(
      applySortableItemMove(candidate, {
        destinationIndex: 1,
        destinationParentId: "root",
        itemIds: ["a"],
        sourceParentIds: ["root"],
      }),
    ).toBe(candidate);
    expect(() =>
      applySortableItemMove(candidate, {
        destinationIndex: 0,
        destinationParentId: "a-1",
        itemIds: ["a"],
        sourceParentIds: ["root"],
      }),
    ).toThrow("cannot move an item into its own subtree");
    expect(() =>
      applySortableItemMove(candidate, {
        destinationIndex: 0,
        destinationParentId: "empty",
        itemIds: ["a-2", "a-1"],
        sourceParentIds: ["a", "a"],
      }),
    ).toThrow("canonical tree order");
    expect(() =>
      applySortableItemMove(candidate, {
        destinationIndex: 0,
        destinationParentId: "empty",
        itemIds: ["a-1"],
        sourceParentIds: ["root"],
      }),
    ).toThrow("must match canonical item placement");
  });

  it("preserves prototype-mutator parent IDs in the returned serializable record", () => {
    const childrenByParent = Object.create(null) as Record<string, readonly string[]>;
    childrenByParent.root = ["__proto__", "constructor"];
    const candidate: SortableItemTree = {
      childrenByParent,
      itemIds: ["__proto__", "constructor"],
      rootId: "root",
    };
    const next = applySortableItemMove(candidate, {
      destinationIndex: 0,
      destinationParentId: "__proto__",
      itemIds: ["constructor"],
      sourceParentIds: ["root"],
    });

    expect(Object.hasOwn(next.childrenByParent, "__proto__")).toBe(true);
    expect(next.childrenByParent.__proto__).toEqual(["constructor"]);
    expect(() => validateSortableItemTree(next)).not.toThrow();
  });
});

describe("sortable item keyboard move planning", () => {
  it("moves selected roots one sibling boundary up or down", () => {
    expect(
      planSortableItemKeyboardMove({
        activeItemId: "a",
        command: "move-up",
        selectedItemIds: ["a"],
        tree: tree(),
      }),
    ).toMatchObject({
      plan: { destinationIndex: 0, destinationParentId: "root", itemIds: ["a"] },
      status: "planned",
    });
    expect(
      planSortableItemKeyboardMove({
        activeItemId: "b",
        command: "move-down",
        selectedItemIds: ["group", "b"],
        tree: tree(),
      }),
    ).toMatchObject({
      plan: { destinationIndex: 2, itemIds: ["b", "group"] },
      status: "planned",
    });
  });

  it("indents under the previous sibling and outdents after the current parent", () => {
    expect(
      planSortableItemKeyboardMove({
        activeItemId: "group",
        command: "indent",
        selectedItemIds: ["group"],
        tree: tree(),
      }),
    ).toMatchObject({
      plan: { destinationIndex: 2, destinationParentId: "a", itemIds: ["group"] },
      status: "planned",
    });
    expect(
      planSortableItemKeyboardMove({
        activeItemId: "a-1",
        command: "outdent",
        selectedItemIds: ["a-1", "a-2"],
        tree: tree(),
      }),
    ).toMatchObject({
      plan: {
        destinationIndex: 2,
        destinationParentId: "root",
        itemIds: ["a-1", "a-2"],
      },
      status: "planned",
    });
  });

  it("anchors mixed-parent keyboard movement to the active normalized root", () => {
    const decision = planSortableItemKeyboardMove({
      activeItemId: "a-1",
      command: "move-down",
      selectedItemIds: ["a-1", "group-1"],
      tree: tree(),
    });

    expect(decision).toMatchObject({
      plan: {
        destinationIndex: 1,
        destinationParentId: "a",
        itemIds: ["a-1", "group-1"],
        sourceParentIds: ["a", "group"],
      },
      status: "planned",
    });
  });

  it("reports unchanged edge commands and applies containment and host policy", () => {
    expect(
      planSortableItemKeyboardMove({
        activeItemId: "b",
        command: "move-up",
        selectedItemIds: ["b"],
        tree: tree(),
      }),
    ).toMatchObject({ status: "unchanged" });
    expect(
      planSortableItemKeyboardMove({
        activeItemId: "b",
        command: "indent",
        selectedItemIds: ["b"],
        tree: tree(),
      }),
    ).toMatchObject({ status: "unchanged" });
    expect(
      planSortableItemKeyboardMove({
        activeItemId: "group",
        canContainChildren: () => false,
        command: "indent",
        selectedItemIds: ["group"],
        tree: tree(),
      }),
    ).toMatchObject({ code: "destination-cannot-contain", status: "rejected" });
    expect(
      planSortableItemKeyboardMove({
        activeItemId: "a-1",
        canMove: () => false,
        command: "outdent",
        selectedItemIds: ["a-1"],
        tree: tree(),
      }),
    ).toMatchObject({ code: "host-policy", status: "rejected" });
  });
});
