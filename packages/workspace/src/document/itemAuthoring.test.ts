import { describe, expect, it } from "vitest";
import {
  prepareWorkspaceItemDeletion,
  prepareWorkspaceItemInsertion,
} from "./itemAuthoring.js";
import type { WorkspaceItem, WorkspaceSectionItemTree } from "./types.js";

function makeTree(
  selectedItemIds: Array<string> = ["beta"],
): WorkspaceSectionItemTree {
  return {
    rootId: "root",
    items: {
      root: { id: "root", children: ["alpha", "group", "delta"] },
      alpha: { id: "alpha", children: [], data: { value: "a" } },
      group: {
        id: "group",
        children: ["beta", "gamma"],
        data: { value: "group" },
      },
      beta: { id: "beta", children: [], data: { value: "b" } },
      gamma: { id: "gamma", children: [], data: { value: "c" } },
      delta: { id: "delta", children: [], data: { value: "d" } },
    },
    selectedItemIds,
  };
}

describe("workspace item authoring preparation", () => {
  it("appends a detached complete factory item and selects it", () => {
    const tree = makeTree();
    const item: WorkspaceItem = {
      id: "epsilon",
      children: [],
      data: { defaults: ["host"] },
    };

    const prepared = prepareWorkspaceItemInsertion("section", tree, item);

    expect(prepared.itemTree.items.root?.children).toEqual([
      "alpha",
      "group",
      "delta",
      "epsilon",
    ]);
    expect(prepared.itemTree.selectedItemIds).toEqual(["epsilon"]);
    expect(prepared.focusTargetId).toBe("epsilon");
    expect(prepared.itemTree.items.epsilon).not.toBe(item);
    const hostData = item.data;
    if (hostData && typeof hostData === "object" && !Array.isArray(hostData)) {
      hostData["defaults"] = ["mutated"];
    }
    expect(prepared.itemTree.items.epsilon?.data).toEqual({
      defaults: ["host"],
    });
    expect(tree.items.root?.children).toEqual(["alpha", "group", "delta"]);
  });

  it("rejects duplicate, pre-nested, and unserializable factory results before changing input", () => {
    const tree = makeTree();
    const before = structuredClone(tree);
    expect(() =>
      prepareWorkspaceItemInsertion("section", tree, {
        id: "alpha",
        children: [],
      }),
    ).toThrow("duplicate item id alpha");
    expect(() =>
      prepareWorkspaceItemInsertion("section", tree, {
        id: "nested",
        children: ["alpha"],
      }),
    ).toThrow("package owns insertion placement");
    expect(() =>
      prepareWorkspaceItemInsertion("section", tree, {
        id: "invalid",
        children: [],
        data: { value: Number.NaN },
      }),
    ).toThrow("finite numbers");
    expect(tree).toEqual(before);
  });

  it("deletes a selected subtree and chooses the next row at its former position", () => {
    const tree = makeTree(["group", "beta"]);

    const prepared = prepareWorkspaceItemDeletion("section", tree, [
      "group",
      "beta",
    ]);

    expect(prepared.deletedItemIds).toEqual(["group", "beta", "gamma"]);
    expect(prepared.itemTree.items.root?.children).toEqual(["alpha", "delta"]);
    expect(prepared.itemTree.items.group).toBeUndefined();
    expect(prepared.itemTree.selectedItemIds).toEqual(["delta"]);
    expect(prepared.focusTargetId).toBe("delta");
    expect(tree.items.group).toBeDefined();
  });

  it("chooses the preceding row at the end and preserves unaffected selection", () => {
    const endDeletion = prepareWorkspaceItemDeletion(
      "section",
      makeTree(["delta"]),
      ["delta"],
    );
    expect(endDeletion.itemTree.selectedItemIds).toEqual(["gamma"]);
    expect(endDeletion.focusTargetId).toBe("gamma");

    const preserved = prepareWorkspaceItemDeletion(
      "section",
      makeTree(["beta"]),
      ["delta"],
    );
    expect(preserved.itemTree.selectedItemIds).toEqual(["beta"]);
    expect(preserved.focusTargetId).toBe("beta");
  });

  it("validates the complete deletion request before creating a next tree", () => {
    const tree = makeTree();
    const before = structuredClone(tree);
    expect(() =>
      prepareWorkspaceItemDeletion("section", tree, ["alpha", "missing"]),
    ).toThrow("unknown item missing");
    expect(() =>
      prepareWorkspaceItemDeletion("section", tree, ["root"]),
    ).toThrow("cannot delete its root item root");
    expect(() =>
      prepareWorkspaceItemDeletion("section", tree, ["alpha", "alpha"]),
    ).toThrow("lists alpha twice");
    expect(tree).toEqual(before);
  });
});
