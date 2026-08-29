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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadWorkspaceDocument } from "./loadWorkspaceDocument";
import { moveItems, orderItemIdsByParent } from "./moveItems";
import { registerSectionKinds } from "./sectionKindRegistry";
import {
  useActiveSections,
  useNodeInternals,
  useWorkspaceDocument,
} from "./stores";
import type { WorkspaceSection, WorkspaceSectionItemTree } from "./types";

// Freezes the canonical item move funnel: the reference's `applyParamMove` optimistic result
// minus its backend send, with the host notified once per applied move.

function makeItemTree(
  childrenById: Record<string, Array<string>>,
): WorkspaceSectionItemTree {
  const ids = new Set<string>(["item-root", ...Object.keys(childrenById)]);
  for (const children of Object.values(childrenById)) {
    for (const childId of children) {
      ids.add(childId);
    }
  }
  return {
    rootId: "item-root",
    items: Object.fromEntries(
      [...ids].map((id) => [id, { id, children: childrenById[id] ?? [] }]),
    ),
    selectedItemIds: [],
  };
}

function makeSection(
  id: string,
  overrides: Partial<WorkspaceSection> = {},
): WorkspaceSection {
  return {
    id,
    kind: "leaf",
    name: id,
    size: { width: 224, height: 96 },
    isMinimized: false,
    positionAndSizeLocked: false,
    isHorizontalOrientation: false,
    styleColor: null,
    overflowMode: false,
    tagColor: null,
    children: [],
    ...overrides,
  };
}

function loadTestDocument(childrenById: Record<string, Array<string>>) {
  registerSectionKinds(testWorkspace.host, {
    leaf: {
      renderContent: () => null,
      itemArea: { toolbar: "authoring-and-filter" },
    },
  });
  loadWorkspaceDocument(testWorkspace.host, {
    sections: {
      leaf: makeSection("leaf", { itemTree: makeItemTree(childrenById) }),
    },
    topLevelSections: { leaf: { x: 0, y: 0, w: 224, h: 96, zIndex: 0 } },
    viewport: { x: 0, y: 0, zoom: 1 },
    activeIds: [],
  });
}

function getLoadedItemTree(): WorkspaceSectionItemTree {
  const itemTree = testWorkspace.document.getState().sections["leaf"]?.itemTree;
  if (!itemTree) {
    throw new Error("expected the test section to carry an item tree");
  }
  return itemTree;
}

const documentChangeSpy = vi.fn();

describe("moveItems", () => {
  beforeEach(() => {
    loadTestDocument({
      "item-root": ["a", "b", "group"],
      group: ["nested"],
    });
    documentChangeSpy.mockClear();
    testWorkspace.host.subscribe(documentChangeSpy);
  });

  afterEach(() => {
    testWorkspace.document.getState().reset();
    testWorkspace.nodeInternals.getState().reset();
    testWorkspace.activeSections.getState().reset();
    registerSectionKinds(testWorkspace.host, {});
  });

  it("reorders items within the same parent and notifies the host once", () => {
    moveItems(testWorkspace.host, {
      sectionId: "leaf",
      itemIds: ["b"],
      newParentId: "item-root",
      newIndex: 0,
    });

    expect(getLoadedItemTree().items["item-root"]?.children).toEqual([
      "b",
      "a",
      "group",
    ]);
    expect(documentChangeSpy).toHaveBeenCalledTimes(1);
    expect(
      documentChangeSpy.mock.calls[0]?.[0]?.sections["leaf"]?.itemTree?.items[
        "item-root"
      ]?.children,
    ).toEqual(["b", "a", "group"]);
  });

  it("keeps a multi-selection in its old-parent order regardless of the id order", () => {
    moveItems(testWorkspace.host, {
      sectionId: "leaf",
      itemIds: ["b", "a"],
      newParentId: "item-root",
      newIndex: 1,
    });

    expect(getLoadedItemTree().items["item-root"]?.children).toEqual([
      "group",
      "a",
      "b",
    ]);
  });

  it("moves items across parents into a nested group", () => {
    moveItems(testWorkspace.host, {
      sectionId: "leaf",
      itemIds: ["a"],
      newParentId: "group",
      newIndex: 1,
    });

    const itemTree = getLoadedItemTree();
    expect(itemTree.items["item-root"]?.children).toEqual(["b", "group"]);
    expect(itemTree.items["group"]?.children).toEqual(["nested", "a"]);
  });

  it("moves items into a childless item, the structural form of the reference's promotion", () => {
    moveItems(testWorkspace.host, {
      sectionId: "leaf",
      itemIds: ["nested"],
      newParentId: "b",
      newIndex: 0,
    });

    const itemTree = getLoadedItemTree();
    expect(itemTree.items["group"]?.children).toEqual([]);
    expect(itemTree.items["b"]?.children).toEqual(["nested"]);
  });

  it("leaves the tree untouched and silent for out-of-range indices", () => {
    moveItems(testWorkspace.host, {
      sectionId: "leaf",
      itemIds: ["a"],
      newParentId: "item-root",
      newIndex: 3,
    });
    moveItems(testWorkspace.host, {
      sectionId: "leaf",
      itemIds: ["a"],
      newParentId: "group",
      newIndex: -1,
    });
    moveItems(testWorkspace.host, {
      sectionId: "leaf",
      itemIds: [],
      newParentId: "item-root",
      newIndex: 0,
    });

    expect(getLoadedItemTree().items["item-root"]?.children).toEqual([
      "a",
      "b",
      "group",
    ]);
    expect(documentChangeSpy).not.toHaveBeenCalled();
  });

  it("leaves the tree untouched and silent when the first item is detached", () => {
    // The root has no parent and an unknown id has no parent-map entry: both abort before
    // anything mutates, the third documented silent-abort leg beside empty ids and
    // out-of-range indices.
    moveItems(testWorkspace.host, {
      sectionId: "leaf",
      itemIds: ["item-root"],
      newParentId: "group",
      newIndex: 0,
    });
    moveItems(testWorkspace.host, {
      sectionId: "leaf",
      itemIds: ["missing"],
      newParentId: "item-root",
      newIndex: 0,
    });

    expect(getLoadedItemTree().items["item-root"]?.children).toEqual([
      "a",
      "b",
      "group",
    ]);
    expect(documentChangeSpy).not.toHaveBeenCalled();
  });

  it("throws instead of nesting items into their own subtree", () => {
    expect(() =>
      moveItems(testWorkspace.host, {
        sectionId: "leaf",
        itemIds: ["group"],
        newParentId: "nested",
        newIndex: 0,
      }),
    ).toThrowError(/into their own subtree at nested/);
    expect(getLoadedItemTree().items["group"]?.children).toEqual(["nested"]);
  });

  it("throws for sections without an item tree", () => {
    registerSectionKinds(testWorkspace.host, {
      leaf: {
        renderContent: () => null,
        itemArea: { toolbar: "authoring-and-filter" },
      },
    });
    loadWorkspaceDocument(testWorkspace.host, {
      sections: { bare: makeSection("bare") },
      topLevelSections: { bare: { x: 0, y: 0, w: 224, h: 96, zIndex: 0 } },
      viewport: { x: 0, y: 0, zoom: 1 },
      activeIds: [],
    });
    expect(() =>
      moveItems(testWorkspace.host, {
        sectionId: "bare",
        itemIds: ["a"],
        newParentId: "b",
        newIndex: 0,
      }),
    ).toThrowError(/Section bare has no item tree/);
  });
});

describe("orderItemIdsByParent", () => {
  it("orders ids by the parent's canonical child order", () => {
    const itemTree = makeItemTree({ "item-root": ["a", "b", "c"] });
    expect(orderItemIdsByParent(itemTree, "item-root", ["c", "a"])).toEqual([
      "a",
      "c",
    ]);
  });
});
