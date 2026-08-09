import { describe, expect, it, vi } from "vitest";

import {
  applySortableItemMove,
  resolveSortableItemDragBlock,
  type SortableItemTree,
} from "../src/core.js";
import {
  resolveSortableItemKeyboardPreview,
  resolveSortableItemPointerPreview,
  sortableItemMovePlansMatch,
  sortableItemMoveStillAllowed,
  sortableItemPointerTargetForEvent,
  type AdapterDndEvent,
  type SortableItemClientRect,
} from "../src/testing.js";

function tree(): SortableItemTree {
  return {
    childrenByParent: {
      group: ["theme"],
      root: ["name", "email", "group", "notes"],
    },
    itemIds: ["name", "email", "group", "theme", "notes"],
    rootId: "root",
  };
}

describe("sortable item pointer preview", () => {
  it("resolves pointer targets from frozen row and smallest-branch geometry", () => {
    const event = (y: number): AdapterDndEvent => ({
      activatorPoint: { x: 20, y: 20 },
      clientPoint: { x: 20, y },
      input: "pointer",
      keyboardDirection: null,
      sourceId: "source",
      targetId: null,
      transform: { x: 0, y: y - 20 },
    });
    const rect = (top: number, bottom: number): SortableItemClientRect => ({
      bottom,
      height: bottom - top,
      left: 0,
      right: 100,
      top,
      width: 100,
    });
    const rows = new Map([["notes", rect(100, 140)]]);
    const branches = new Map([
      ["root", rect(0, 200)],
      ["preferences", rect(40, 90)],
    ]);

    expect(sortableItemPointerTargetForEvent(event(120), new Map(), rows, branches)).toEqual({
      itemId: "notes",
      rect: { height: 40, top: 100 },
      type: "item",
    });
    expect(sortableItemPointerTargetForEvent(event(70), new Map(), rows, branches)).toEqual({
      parentId: "preferences",
      type: "parent",
    });
  });

  it("uses row bands for before, after, and child destinations", () => {
    const candidate = tree();
    const block = resolveSortableItemDragBlock(candidate, ["name"], "name");
    const common = {
      activeItemId: "name",
      block,
      canContainChildren: (itemId: string) => itemId === "group",
      tree: candidate,
    };

    expect(
      resolveSortableItemPointerPreview({
        ...common,
        clientY: 102,
        target: { itemId: "group", rect: { height: 40, top: 100 }, type: "item" },
      }),
    ).toMatchObject({
      preview: { destinationIndex: 1, destinationParentId: "root" },
      status: "planned",
    });
    expect(
      resolveSortableItemPointerPreview({
        ...common,
        clientY: 138,
        target: { itemId: "email", rect: { height: 40, top: 100 }, type: "item" },
      }),
    ).toMatchObject({
      preview: { destinationIndex: 1, destinationParentId: "root" },
      status: "planned",
    });
    expect(
      resolveSortableItemPointerPreview({
        ...common,
        clientY: 120,
        target: { itemId: "group", rect: { height: 40, top: 100 }, type: "item" },
      }),
    ).toMatchObject({
      preview: { destinationIndex: 1, destinationParentId: "group" },
      status: "planned",
    });
  });

  it("appends to empty parents and reports containment or host rejection", () => {
    const candidate: SortableItemTree = {
      ...tree(),
      childrenByParent: {
        ...tree().childrenByParent,
        empty: [],
        root: [...(tree().childrenByParent.root ?? []), "empty"],
      },
      itemIds: [...tree().itemIds, "empty"],
    };
    const block = resolveSortableItemDragBlock(candidate, ["email"], "email");
    expect(
      resolveSortableItemPointerPreview({
        activeItemId: "email",
        block,
        clientY: 0,
        target: { parentId: "empty", type: "parent" },
        tree: candidate,
      }),
    ).toMatchObject({
      preview: { destinationIndex: 0, destinationParentId: "empty" },
      status: "planned",
    });
    expect(
      resolveSortableItemPointerPreview({
        activeItemId: "email",
        block,
        canContainChildren: () => false,
        clientY: 0,
        target: { parentId: "empty", type: "parent" },
        tree: candidate,
      }),
    ).toMatchObject({
      reason: 'Destination item "empty" cannot contain children.',
      status: "rejected",
    });
    expect(
      resolveSortableItemPointerPreview({
        activeItemId: "email",
        block,
        canMove: () => false,
        clientY: 0,
        target: { parentId: "root", type: "parent" },
        tree: candidate,
      }),
    ).toMatchObject({ reason: "The host rejected this item move.", status: "rejected" });
  });
});

describe("sortable item keyboard preview", () => {
  it("keeps a selected ancestor as the atomic root when its descendant handle is active", () => {
    const originalTree = tree();
    const block = resolveSortableItemDragBlock(originalTree, ["group", "theme"], "theme");
    const resolution = resolveSortableItemKeyboardPreview({
      activeItemId: "theme",
      block,
      command: "move-down",
      originalTree,
      projectedTree: originalTree,
    });

    expect(resolution).toMatchObject({
      preview: {
        plan: {
          destinationIndex: 3,
          destinationParentId: "root",
          itemIds: ["group"],
          sourceParentIds: ["root"],
        },
      },
      status: "planned",
    });
  });

  it("accumulates arrows into one plan against the original tree", () => {
    const originalTree = tree();
    const block = resolveSortableItemDragBlock(originalTree, ["name"], "name");
    const first = resolveSortableItemKeyboardPreview({
      activeItemId: "name",
      block,
      command: "move-down",
      originalTree,
      projectedTree: originalTree,
    });
    if (first.status !== "planned") throw new Error("The first keyboard step must be planned.");
    const second = resolveSortableItemKeyboardPreview({
      activeItemId: "name",
      block,
      command: "move-down",
      originalTree,
      projectedTree: first.preview.projectedTree,
    });

    expect(second).toMatchObject({
      preview: {
        plan: {
          destinationIndex: 2,
          destinationParentId: "root",
          itemIds: ["name"],
          sourceParentIds: ["root"],
        },
      },
      status: "planned",
    });
    if (second.status !== "planned") throw new Error("The second keyboard step must be planned.");
    expect(applySortableItemMove(originalTree, second.preview.plan).childrenByParent.root).toEqual([
      "email",
      "group",
      "name",
      "notes",
    ]);
  });

  it("accumulates indent and outdent while preserving one atomic source plan", () => {
    const originalTree = tree();
    const block = resolveSortableItemDragBlock(originalTree, ["notes"], "notes");
    const indented = resolveSortableItemKeyboardPreview({
      activeItemId: "notes",
      block,
      canContainChildren: (itemId) => itemId === "group",
      command: "indent",
      originalTree,
      projectedTree: originalTree,
    });
    expect(indented).toMatchObject({
      preview: { plan: { destinationParentId: "group", sourceParentIds: ["root"] } },
      status: "planned",
    });
    if (indented.status !== "planned") throw new Error("Indent must be planned.");
    const outdented = resolveSortableItemKeyboardPreview({
      activeItemId: "notes",
      block,
      canContainChildren: (itemId) => itemId === "group",
      command: "outdent",
      originalTree,
      projectedTree: indented.preview.projectedTree,
    });
    expect(outdented).toMatchObject({ status: "unchanged" });
  });

  it("clears the cumulative preview when an arrow returns the block to its start", () => {
    const originalTree = tree();
    const block = resolveSortableItemDragBlock(originalTree, ["name"], "name");
    const moved = resolveSortableItemKeyboardPreview({
      activeItemId: "name",
      block,
      command: "move-down",
      originalTree,
      projectedTree: originalTree,
    });
    if (moved.status !== "planned") throw new Error("The first keyboard step must be planned.");
    const canMove = vi.fn(() => true);
    const returned = resolveSortableItemKeyboardPreview({
      activeItemId: "name",
      block,
      canMove,
      command: "move-up",
      originalTree,
      projectedTree: moved.preview.projectedTree,
    });

    expect(returned).toMatchObject({
      projectedTree: originalTree,
      reason: "The selected items are back at their original position.",
      status: "unchanged",
    });
    expect(canMove).not.toHaveBeenCalled();
  });

  it("revalidates exact plan fields and current host policy", () => {
    const candidate = tree();
    const plan = {
      destinationIndex: 0,
      destinationParentId: "group",
      itemIds: ["email"],
      sourceParentIds: ["root"],
    } as const;
    expect(sortableItemMoveStillAllowed({ plan, tree: candidate })).toBe(true);
    expect(sortableItemMoveStillAllowed({ canMove: () => false, plan, tree: candidate })).toBe(
      false,
    );
    expect(sortableItemMovePlansMatch(plan, { ...plan, itemIds: ["email"] })).toBe(true);
    expect(sortableItemMovePlansMatch(plan, { ...plan, destinationIndex: 1 })).toBe(false);
  });
});
