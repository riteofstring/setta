import {
  afterEach as afterEachWorkspaceTestHost,
  beforeEach as beforeEachWorkspaceTestHost,
} from "vitest";
import {
  createWorkspaceTestHost,
  type WorkspaceTestHost,
} from "../../test/workspaceTestHost";

let testWorkspace: WorkspaceTestHost;
beforeEachWorkspaceTestHost(() => {
  testWorkspace = createWorkspaceTestHost();
});
afterEachWorkspaceTestHost(() => {
  testWorkspace.host.dispose();
});

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
import {
  getItemDndId,
  getTempItemDndId,
  type ItemListKey,
} from "./itemDndState";

describe("itemDndChildren state", () => {
  beforeEach(() => {
    testWorkspace.itemDndChildren.getState().reset();
  });

  it("builds forward and reverse item child maps", () => {
    // Validates map hydration for item parent/child relationships.
    updateItemChildren(testWorkspace.host, {
      parentA: ["child1", "child2"],
      parentB: ["child3"],
    });

    const state = testWorkspace.itemDndChildren.getState();
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
    updateItemChildren(testWorkspace.host, {
      parentA: ["child1", "child2"],
      parentB: ["child3"],
    });

    addItemChild(testWorkspace.host, "parentA", "parentB", "child1", 0);

    const state = testWorkspace.itemDndChildren.getState();
    expect(state.x.parentA).toEqual(["child2"]);
    expect(state.x.parentB).toEqual(["child1", "child3"]);
    expect(getItemDndParentId(testWorkspace.host, "child1")).toBe("parentB");
  });

  it("replaces dragged items with a temporary placeholder", () => {
    // Validates placeholder insertion position and stale temp cleanup.
    const staleTempId = getTempItemDndId(getItemDndId("stale", "pinned"));
    updateItemChildren(testWorkspace.host, {
      parentA: ["item-a", "item-b", "item-c"],
      parentB: [staleTempId],
    });

    replaceItemsWithTemp(testWorkspace.host, "active", "pinned", ["item-b", "item-c"]);

    const tempId = getTempItemDndId(getItemDndId("active", "pinned"));
    const state = testWorkspace.itemDndChildren.getState();
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
    updateItemChildren(testWorkspace.host, {
      parentA: ["child1", tempChildId],
    });

    expect(getItemDndParentByChild(testWorkspace.host, null)).toEqual({
      child1: "parentA",
      [tempChildId]: "parentA",
    });

    expect(getItemDndParentByChild(testWorkspace.host, listKey)).toEqual({
      [getItemDndId("child1", listKey)]: getItemDndId("parentA", listKey),
      [tempChildId]: getItemDndId("parentA", listKey),
    });
  });

  it("supports explicit reset", () => {
    // Validates manual reset path clears both lookup maps.
    updateItemChildren(testWorkspace.host, {
      parentA: ["child1"],
    });

    resetItemDndChildren(testWorkspace.host);

    const state = testWorkspace.itemDndChildren.getState();
    expect(state.x).toEqual({});
    expect(state.y).toEqual({});
  });
});
