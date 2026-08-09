import { describe, expect, it, vi } from "vitest";

import {
  applySortableItemListMove,
  planSortableItemListMove,
  validateSortableItemLists,
  type SortableItemList,
  type SortableItemListMovePlan,
} from "../src/core.js";

function lists(): readonly SortableItemList[] {
  return [
    {
      label: "Required fields",
      listId: "required",
      tree: {
        childrenByParent: {
          group: ["theme"],
          "required-root": ["name", "group"],
        },
        itemIds: ["name", "group", "theme"],
        rootId: "required-root",
      },
    },
    {
      label: "Optional fields",
      listId: "optional",
      tree: {
        childrenByParent: { "optional-root": ["notes"] },
        itemIds: ["notes"],
        rootId: "optional-root",
      },
    },
  ];
}

function listById(value: readonly SortableItemList[], listId: string): SortableItemList {
  const list = value.find((candidate) => candidate.listId === listId);
  if (!list) throw new Error(`Missing test list ${listId}.`);
  return list;
}

describe("sortable named item lists", () => {
  it("validates named lists and globally stable item identities", () => {
    expect(() => validateSortableItemLists(lists())).not.toThrow();
    expect(() =>
      validateSortableItemLists([
        {
          label: "Required fields",
          listId: "required",
          tree: {
            childrenByParent: { group: ["theme"], "shared-root": ["name", "group"] },
            itemIds: ["name", "group", "theme"],
            rootId: "shared-root",
          },
        },
        {
          label: "Optional fields",
          listId: "optional",
          tree: {
            childrenByParent: { "shared-root": ["notes"] },
            itemIds: ["notes"],
            rootId: "shared-root",
          },
        },
      ]),
    ).not.toThrow();
    expect(() =>
      validateSortableItemLists([
        {
          label: "Collision safe",
          listId: "collision-safe",
          tree: {
            childrenByParent: { root: ["__setta_internal_item-lists-root__"] },
            itemIds: ["__setta_internal_item-lists-root__"],
            rootId: "root",
          },
        },
      ]),
    ).not.toThrow();
    expect(() =>
      validateSortableItemLists([
        ...lists(),
        {
          label: "Duplicate",
          listId: "third",
          tree: {
            childrenByParent: { root: ["name"] },
            itemIds: ["name"],
            rootId: "root",
          },
        },
      ]),
    ).toThrow('Sortable item ID "name" appears in both "required" and "third"');
    expect(() =>
      validateSortableItemLists([lists()[0], { ...lists()[1], listId: "required" }]),
    ).toThrow('Sortable item list ID "required" is duplicated');
  });

  it("rejects empty, sparse, accessor-backed, and extra list contracts specifically", () => {
    expect(() => validateSortableItemLists([])).toThrow("at least one named list");
    expect(() => validateSortableItemLists(Array(1))).toThrow("dense array");
    expect(() => validateSortableItemLists([{ ...lists()[0], extra: true }])).toThrow(
      "Unknown sortable item list field extra",
    );

    const accessor = { label: "Unsafe", listId: "unsafe" } as Record<string, unknown>;
    const getter = vi.fn(() => lists()[0]?.tree);
    Object.defineProperty(accessor, "tree", { enumerable: true, get: getter });
    expect(() => validateSortableItemLists([accessor])).toThrow(
      "Unknown sortable item list field tree",
    );
    expect(getter).not.toHaveBeenCalled();
  });

  it("plans one public cross-list move without exposing internal synthetic roots", () => {
    const decision = planSortableItemListMove({
      activeItemId: "name",
      destinationIndex: 1,
      destinationListId: "optional",
      destinationParentId: "optional-root",
      lists: lists(),
      selectedItemIds: ["name"],
    });

    expect(decision).toEqual({
      block: {
        itemIds: ["name"],
        selectedItemIds: ["name"],
        sourceListIds: ["required"],
        sourceParentIds: ["required-root"],
      },
      plan: {
        destinationIndex: 1,
        destinationListId: "optional",
        destinationParentId: "optional-root",
        itemIds: ["name"],
        sourceListIds: ["required"],
        sourceParentIds: ["required-root"],
      },
      status: "planned",
    });
  });

  it("moves a subtree atomically between lists and preserves unaffected identities", () => {
    const current = lists();
    const required = listById(current, "required");
    const optional = listById(current, "optional");
    const plan: SortableItemListMovePlan = {
      destinationIndex: 1,
      destinationListId: "optional",
      destinationParentId: "optional-root",
      itemIds: ["group"],
      sourceListIds: ["required"],
      sourceParentIds: ["required-root"],
    };

    const next = applySortableItemListMove(current, plan);
    const nextRequired = listById(next, "required");
    const nextOptional = listById(next, "optional");

    expect(nextRequired.tree.childrenByParent["required-root"]).toEqual(["name"]);
    expect(nextRequired.tree.itemIds).toEqual(["name"]);
    expect(nextOptional.tree.childrenByParent["optional-root"]).toEqual(["notes", "group"]);
    expect(nextOptional.tree.childrenByParent.group).toEqual(["theme"]);
    expect(nextOptional.tree.itemIds).toEqual(["notes", "group", "theme"]);
    expect(nextRequired).not.toBe(required);
    expect(nextOptional).not.toBe(optional);
    expect(
      applySortableItemListMove(current, { ...plan, itemIds: ["name"], destinationIndex: 0 }),
    ).not.toBe(current);
  });

  it("moves mixed-parent roots across named lists with aligned public ownership", () => {
    const current = lists();
    const decision = planSortableItemListMove({
      activeItemId: "theme",
      destinationIndex: 1,
      destinationListId: "optional",
      destinationParentId: "optional-root",
      lists: current,
      selectedItemIds: ["theme", "notes"],
    });

    expect(decision).toMatchObject({
      block: {
        itemIds: ["theme", "notes"],
        sourceListIds: ["required", "optional"],
        sourceParentIds: ["group", "optional-root"],
      },
      plan: {
        destinationIndex: 0,
        destinationListId: "optional",
        destinationParentId: "optional-root",
        itemIds: ["theme", "notes"],
        sourceListIds: ["required", "optional"],
        sourceParentIds: ["group", "optional-root"],
      },
      status: "planned",
    });
    if (decision.status !== "planned") throw new Error("Expected a mixed-list move plan.");
    const next = applySortableItemListMove(current, decision.plan);
    expect(listById(next, "required").tree.childrenByParent.group).toEqual([]);
    expect(listById(next, "optional").tree.childrenByParent["optional-root"]).toEqual([
      "theme",
      "notes",
    ]);
  });

  it("preserves the original collection and list identities for a same-position no-op", () => {
    const current = lists();
    const next = applySortableItemListMove(current, {
      destinationIndex: 0,
      destinationListId: "required",
      destinationParentId: "required-root",
      itemIds: ["name"],
      sourceListIds: ["required"],
      sourceParentIds: ["required-root"],
    });

    expect(next).toBe(current);
    expect(next[0]).toBe(current[0]);
    expect(next[1]).toBe(current[1]);
  });

  it("supports same-list nesting and selected sibling blocks through the expanded plan", () => {
    const decision = planSortableItemListMove({
      activeItemId: "name",
      canContainChildren: (itemId) => itemId === "group",
      destinationIndex: 1,
      destinationListId: "required",
      destinationParentId: "group",
      lists: lists(),
      selectedItemIds: ["name"],
    });
    expect(decision).toMatchObject({
      plan: {
        destinationListId: "required",
        destinationParentId: "group",
        sourceListIds: ["required"],
      },
      status: "planned",
    });

    if (decision.status === "rejected") throw new Error(decision.reason);
    const current = lists();
    const next = applySortableItemListMove(current, decision.plan);
    expect(listById(next, "required").tree.childrenByParent.group).toEqual(["theme", "name"]);
    expect(listById(next, "optional")).toBe(listById(current, "optional"));
  });

  it("reports unknown destinations and host rejection without partial application", () => {
    const hostPolicy = vi.fn(() => false);
    const rejected = planSortableItemListMove({
      activeItemId: "name",
      canMove: hostPolicy,
      destinationIndex: 1,
      destinationListId: "optional",
      destinationParentId: "optional-root",
      lists: lists(),
      selectedItemIds: ["name"],
    });
    expect(rejected).toMatchObject({ code: "host-policy", status: "rejected" });
    expect(hostPolicy).toHaveBeenCalledWith({
      destinationIndex: 1,
      destinationListId: "optional",
      destinationParentId: "optional-root",
      itemIds: ["name"],
      sourceListIds: ["required"],
      sourceParentIds: ["required-root"],
    });

    expect(
      planSortableItemListMove({
        activeItemId: "name",
        destinationIndex: 0,
        destinationListId: "missing",
        destinationParentId: "root",
        lists: lists(),
        selectedItemIds: ["name"],
      }),
    ).toMatchObject({ code: "unknown-destination-list", status: "rejected" });
    expect(
      planSortableItemListMove({
        activeItemId: "name",
        destinationIndex: 0,
        destinationListId: "optional",
        destinationParentId: "group",
        lists: lists(),
        selectedItemIds: ["name"],
      }),
    ).toMatchObject({ code: "unknown-destination-parent", status: "rejected" });
  });

  it("rejects stale list ownership, indexes, and partial public plans during application", () => {
    expect(() =>
      applySortableItemListMove(lists(), {
        destinationIndex: 0,
        destinationListId: "optional",
        destinationParentId: "optional-root",
        itemIds: ["name"],
        sourceListIds: ["optional"],
        sourceParentIds: ["optional-root"],
      }),
    ).toThrow("sourceParentIds must match canonical item placement");
    expect(() =>
      applySortableItemListMove(lists(), {
        destinationIndex: 2,
        destinationListId: "optional",
        destinationParentId: "optional-root",
        itemIds: ["name"],
        sourceListIds: ["required"],
        sourceParentIds: ["required-root"],
      }),
    ).toThrow("destinationIndex must be an integer from 0 through 1");
    expect(() =>
      applySortableItemListMove(lists(), {
        destinationIndex: 0,
        destinationListId: "optional",
        destinationParentId: "optional-root",
        itemIds: ["name"],
        sourceListIds: ["required"],
      } as unknown as SortableItemListMovePlan),
    ).toThrow("missing required field sourceParentIds");
  });
});
