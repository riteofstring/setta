import { beforeEach, describe, expect, it } from "vitest";
import {
  addItemChild,
  getItemDndParentByChild,
  getItemDndParentId,
  replaceItemsWithTemp,
  resetItemDndChildren,
  updateItemChildren,
  useItemDndChildren,
} from "./itemDndChildren";
import { getItemDndId, getTempItemDndId, type ItemListKey } from "./itemDndState";

describe("itemDndChildren state", () => {
  beforeEach(() => {
    useItemDndChildren.getState().reset();
  });

  it("builds forward and reverse item child maps", () => {
    // Validates map hydration for item parent/child relationships.
    updateItemChildren({
      parentA: ["child1", "child2"],
      parentB: ["child3"],
    });

    const state = useItemDndChildren.getState();
    expect(state.x).toEqual({
      parentA: ["child1", "child2"],
      parentB: ["child3"],
    });
    expect(state.y).toEqual({
      child1: "parentA",
      child2: "parentA",
      child3: "parentB",
    });
  });

  it("moves items between parents and updates reverse lookup", () => {
    // Validates add operation reorders destination list and updates parent mapping.
    updateItemChildren({
      parentA: ["child1", "child2"],
      parentB: ["child3"],
    });

    addItemChild("parentA", "parentB", "child1", 0);

    const state = useItemDndChildren.getState();
    expect(state.x.parentA).toEqual(["child2"]);
    expect(state.x.parentB).toEqual(["child1", "child3"]);
    expect(getItemDndParentId("child1")).toBe("parentB");
  });

  it("replaces dragged items with a temporary placeholder", () => {
    // Validates placeholder insertion position and stale temp cleanup.
    const staleTempId = getTempItemDndId(getItemDndId("stale", "pinned"));
    updateItemChildren({
      parentA: ["item-a", "item-b", "item-c"],
      parentB: [staleTempId],
    });

    replaceItemsWithTemp("active", "pinned", ["item-b", "item-c"]);

    const tempId = getTempItemDndId(getItemDndId("active", "pinned"));
    const state = useItemDndChildren.getState();
    expect(state.x.parentA).toEqual(["item-a", tempId]);
    expect(state.x.parentB).toEqual([]);
    expect(state.y[tempId]).toBe("parentA");
    expect(state.y["item-b"]).toBeUndefined();
    expect(state.y["item-c"]).toBeUndefined();
    expect(state.y[staleTempId]).toBeUndefined();
  });

  it("maps parentByChild to list-key-specific dnd ids", () => {
    // Validates list-key remapping for item collisions and sortable lookups.
    const listKey: ItemListKey = "pinned";
    const tempChildId = getTempItemDndId(getItemDndId("child2", listKey));
    updateItemChildren({
      parentA: ["child1", tempChildId],
    });

    expect(getItemDndParentByChild(null)).toEqual({
      child1: "parentA",
      [tempChildId]: "parentA",
    });

    expect(getItemDndParentByChild(listKey)).toEqual({
      [getItemDndId("child1", listKey)]: getItemDndId("parentA", listKey),
      [tempChildId]: getItemDndId("parentA", listKey),
    });
  });

  it("supports explicit reset", () => {
    // Validates manual reset path clears both lookup maps.
    updateItemChildren({
      parentA: ["child1"],
    });

    resetItemDndChildren();

    const state = useItemDndChildren.getState();
    expect(state.x).toEqual({});
    expect(state.y).toEqual({});
  });
});
