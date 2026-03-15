import { describe, expect, it } from "vitest";

import {
  getRootSelectedParamIds,
  getSharedParentId,
  isDescendantOfSelection,
  resolveFullIndexForVisibleInsertion,
} from "./paramTreeSelection";

describe("paramTreeSelection", () => {
  const parentById = {
    root: null,
    "group-a": "root",
    "group-b": "root",
    "param-a": "group-a",
    "param-b": "group-a",
    "param-c": "group-b",
  };

  it("filters nested selections down to the top-most selected params", () => {
    // Multi-select drag should move each selected branch once even if descendants are also selected.
    expect(
      getRootSelectedParamIds(parentById, ["group-a", "param-a", "param-c"]),
    ).toEqual(["group-a", "param-c"]);
  });

  it("requires moved params to share the same parent before grouped moves continue", () => {
    // Keyboard and drag/drop grouping only works when all roots belong to one parent container.
    expect(getSharedParentId(parentById, ["param-a", "param-b"])).toBe(
      "group-a",
    );
    expect(getSharedParentId(parentById, ["param-a", "param-c"])).toBeNull();
  });

  it("treats ancestors as part of the active selection when resolving drop targets", () => {
    // Drops into a selected branch should be blocked just like direct drops onto a selected param.
    expect(
      isDescendantOfSelection(parentById, "param-b", new Set(["group-a"])),
    ).toBe(true);
    expect(
      isDescendantOfSelection(parentById, "param-c", new Set(["group-a"])),
    ).toBe(false);
  });

  it("maps visible insertion indexes back onto the full child order", () => {
    // Hidden siblings must keep their place when the visible list reorders a selected group.
    expect(
      resolveFullIndexForVisibleInsertion({
        targetVisibleIndex: 1,
        movingIds: new Set(["param-a"]),
        visibleSiblings: ["param-a", "param-b"],
        fullChildren: ["param-a", "hidden-1", "param-b"],
      }),
    ).toBe(2);
    expect(
      resolveFullIndexForVisibleInsertion({
        targetVisibleIndex: 1,
        movingIds: new Set(["param-a"]),
        visibleSiblings: ["param-a", "param-b", "param-c"],
        fullChildren: ["param-a", "hidden-1", "param-b", "param-c"],
      }),
    ).toBe(2);
  });

  it("rejects out-of-range visible insertion indexes", () => {
    // Invalid target indexes should stop the move plan instead of silently reordering the wrong siblings.
    expect(
      resolveFullIndexForVisibleInsertion({
        targetVisibleIndex: 3,
        movingIds: new Set(["param-a"]),
        visibleSiblings: ["param-a", "param-b"],
        fullChildren: ["param-a", "param-b"],
      }),
    ).toBeNull();
  });
});
