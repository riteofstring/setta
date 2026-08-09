import { describe, expect, it } from "vitest";
import {
  buildItemParentMap,
  buildItemTreeView,
  getItemOrThrow,
  getRootSelectedItemIds,
  getSharedItemParentId,
  isDescendantOfItemSelection,
  resolveFullIndexForVisibleInsertion,
} from "./itemTree";
import type { WorkspaceSectionItemTree } from "./types";

function makeItemTree(
  childrenById: Record<string, Array<string>>,
  selectedItemIds: Array<string> = [],
): WorkspaceSectionItemTree {
  const ids = new Set<string>(["item-root", ...Object.keys(childrenById)]);
  for (const children of Object.values(childrenById)) {
    for (const childId of children) {
      ids.add(childId);
    }
  }
  return {
    rootId: "item-root",
    items: Object.fromEntries([...ids].map((id) => [id, { id, children: childrenById[id] ?? [] }])),
    selectedItemIds,
  };
}

describe("buildItemParentMap", () => {
  it("maps every item to its parent with a null root", () => {
    const parentById = buildItemParentMap(
      makeItemTree({
        "item-root": ["a", "group"],
        group: ["nested"],
      }),
    );
    expect(parentById).toEqual({
      "item-root": null,
      a: "item-root",
      group: "item-root",
      nested: "group",
    });
  });

  it("throws for a child id without an item record", () => {
    const itemTree = makeItemTree({ "item-root": ["a"] });
    delete itemTree.items["a"];
    expect(() => buildItemParentMap(itemTree)).toThrowError(/Unknown item a/);
  });
});

describe("buildItemTreeView", () => {
  it("walks visible items depth-first with depths and per-parent visible children", () => {
    const view = buildItemTreeView(
      makeItemTree({
        "item-root": ["a", "group", "b"],
        group: ["nested-1", "nested-2"],
      }),
      ["a", "group", "b"],
      new Set(["a", "group", "b", "nested-1", "nested-2"]),
    );
    expect(view.rootId).toBe("item-root");
    expect(view.flat).toEqual([
      { id: "a", parentId: "item-root", depth: 0 },
      { id: "group", parentId: "item-root", depth: 0 },
      { id: "nested-1", parentId: "group", depth: 1 },
      { id: "nested-2", parentId: "group", depth: 1 },
      { id: "b", parentId: "item-root", depth: 0 },
    ]);
    expect(view.visibleChildrenByParent).toEqual({
      "item-root": ["a", "group", "b"],
      group: ["nested-1", "nested-2"],
    });
  });

  it("prunes invisible items and their whole subtree while keeping the full parent map", () => {
    const view = buildItemTreeView(
      makeItemTree({
        "item-root": ["a", "group"],
        group: ["nested"],
      }),
      ["a", "group"],
      new Set(["a", "nested"]),
    );
    expect(view.flat).toEqual([{ id: "a", parentId: "item-root", depth: 0 }]);
    expect(view.visibleChildrenByParent).toEqual({ "item-root": ["a"] });
    expect(view.parentById).toEqual({
      "item-root": null,
      a: "item-root",
      group: "item-root",
      nested: "group",
    });
  });
});

describe("getRootSelectedItemIds", () => {
  it("drops selected items whose ancestor is also selected", () => {
    const parentById = buildItemParentMap(
      makeItemTree({
        "item-root": ["a", "group"],
        group: ["nested"],
      }),
    );
    expect(getRootSelectedItemIds(parentById, ["group", "nested", "a"])).toEqual(["group", "a"]);
  });
});

describe("getSharedItemParentId", () => {
  const parentById = buildItemParentMap(
    makeItemTree({
      "item-root": ["a", "b", "group"],
      group: ["nested"],
    }),
  );

  it("returns the shared parent for same-parent selections", () => {
    expect(getSharedItemParentId(parentById, ["a", "b"])).toBe("item-root");
    expect(getSharedItemParentId(parentById, ["nested"])).toBe("group");
  });

  it("returns null for cross-parent selections, empty selections, and the root", () => {
    expect(getSharedItemParentId(parentById, ["a", "nested"])).toBeNull();
    expect(getSharedItemParentId(parentById, [])).toBeNull();
    expect(getSharedItemParentId(parentById, ["item-root"])).toBeNull();
  });
});

describe("isDescendantOfItemSelection", () => {
  it("finds selected items and their descendants", () => {
    const parentById = buildItemParentMap(
      makeItemTree({
        "item-root": ["a", "group"],
        group: ["nested"],
      }),
    );
    expect(isDescendantOfItemSelection(parentById, "group", new Set(["group"]))).toBe(true);
    expect(isDescendantOfItemSelection(parentById, "nested", new Set(["group"]))).toBe(true);
    expect(isDescendantOfItemSelection(parentById, "a", new Set(["group"]))).toBe(false);
  });
});

describe("resolveFullIndexForVisibleInsertion", () => {
  const fullChildren = ["hidden-1", "a", "hidden-2", "b", "c"];
  const visibleSiblings = ["a", "b", "c"];

  it("lands before the visible anchor, leaving hidden siblings undisturbed", () => {
    expect(
      resolveFullIndexForVisibleInsertion({
        targetVisibleIndex: 1,
        movingIds: new Set(["c"]),
        visibleSiblings,
        fullChildren,
      }),
    ).toBe(3);
  });

  it("appends after the last visible sibling for end insertions", () => {
    expect(
      resolveFullIndexForVisibleInsertion({
        targetVisibleIndex: 2,
        movingIds: new Set(["a"]),
        visibleSiblings,
        fullChildren,
      }),
    ).toBe(4);
  });

  it("appends to the full children when no visible sibling remains", () => {
    expect(
      resolveFullIndexForVisibleInsertion({
        targetVisibleIndex: 0,
        movingIds: new Set(["a", "b", "c"]),
        visibleSiblings,
        fullChildren,
      }),
    ).toBe(2);
  });

  it("returns null for out-of-range visible indices", () => {
    expect(
      resolveFullIndexForVisibleInsertion({
        targetVisibleIndex: 3,
        movingIds: new Set(["a"]),
        visibleSiblings,
        fullChildren,
      }),
    ).toBeNull();
  });
});

describe("getItemOrThrow", () => {
  it("returns known items and throws for unknown ids", () => {
    const itemTree = makeItemTree({ "item-root": ["a"] });
    expect(getItemOrThrow(itemTree, "a").id).toBe("a");
    expect(() => getItemOrThrow(itemTree, "ghost")).toThrowError(/Unknown item ghost/);
  });
});
