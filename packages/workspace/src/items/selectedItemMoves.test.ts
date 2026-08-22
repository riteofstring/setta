/* @vitest-environment jsdom */
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

import { afterEach, describe, expect, it, vi } from "vitest";
import { useWorkspaceCapabilities } from "../document/capabilities";
import { loadWorkspaceDocument } from "../document/loadWorkspaceDocument";
import { registerSectionKinds } from "../document/sectionKindRegistry";
import {
  useActiveSections,
  useNodeInternals,
  useWorkspaceDocument,
} from "../document/stores";
import type { WorkspaceSectionItemTree } from "../document/types";
import { registerItemListView, resetItemListViews } from "./itemListRegistry";
import {
  indentSelectedItems,
  moveSelectedItemsDown,
  moveSelectedItemsUp,
  unindentSelectedItems,
} from "./selectedItemMoves";

// The reference's keyboard param moves in item terms: the offset cases port
// `moveParams.test.ts` (single visible group, discontiguous reverse-order groups), the
// indent/unindent cases port the backend `param_moves_test.go` orderings (previous-sibling
// collapse, independent non-contiguous groups, promote-after-parent, multi-parent restore).
// Package-seam cases freeze the registry visibility/filter gating, the capability gate, and
// the active-section-first resolution.

const changeCallback = vi.fn();

function makeItemTree(
  childrenById: Record<string, Array<string>>,
  selectedItemIds: Array<string>,
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
    selectedItemIds,
  };
}

function makeSection(id: string, itemTree: WorkspaceSectionItemTree) {
  return {
    id,
    kind: "leaf",
    name: id,
    size: { width: 280, height: 240 },
    isMinimized: false,
    positionAndSizeLocked: false,
    isHorizontalOrientation: false,
    styleColor: null,
    overflowMode: false,
    tagColor: null,
    children: [],
    itemTree,
  };
}

function collectItemIds(itemTree: WorkspaceSectionItemTree): Array<string> {
  return Object.keys(itemTree.items).filter((id) => id !== itemTree.rootId);
}

function loadPanel(
  childrenById: Record<string, Array<string>>,
  selectedItemIds: Array<string>,
  options: {
    visibleItemIds?: Array<string>;
    filterActive?: boolean;
    register?: boolean;
  } = {},
) {
  registerSectionKinds(testWorkspace.host, {
    leaf: { renderContent: () => null },
  });
  const itemTree = makeItemTree(childrenById, selectedItemIds);
  loadWorkspaceDocument(testWorkspace.host, {
    sections: { panel: makeSection("panel", itemTree) },
    topLevelSections: { panel: { x: 0, y: 0, w: 280, h: 240, zIndex: 0 } },
    viewport: { x: 0, y: 0, zoom: 1 },
    activeIds: [],
  });
  if (options.register !== false) {
    registerItemListView(testWorkspace.host, "panel", {
      listKey: "main",
      topLevelItemIds: itemTree.items["item-root"]?.children ?? [],
      visibleItemIds: new Set(
        options.visibleItemIds ?? collectItemIds(itemTree),
      ),
      filterActive: options.filterActive ?? false,
    });
  }
  changeCallback.mockClear();
  testWorkspace.host.subscribe(changeCallback);
}

function getPanelItemTree(sectionId = "panel"): WorkspaceSectionItemTree {
  const itemTree =
    testWorkspace.document.getState().sections[sectionId]?.itemTree;
  if (!itemTree) {
    throw new Error(`expected section ${sectionId} to carry an item tree`);
  }
  return itemTree;
}

function childrenOf(itemId: string, sectionId = "panel"): Array<string> {
  const item = getPanelItemTree(sectionId).items[itemId];
  if (!item) {
    throw new Error(`expected item ${itemId}`);
  }
  return item.children;
}

afterEach(() => {
  registerSectionKinds(testWorkspace.host, {});
  resetItemListViews(testWorkspace.host);
  testWorkspace.document.getState().reset();
  testWorkspace.nodeInternals.getState().reset();
  testWorkspace.activeSections.getState().reset();
  testWorkspace.capabilities.getState().reset();
  changeCallback.mockClear();
});

describe("moveSelectedItems offset moves", () => {
  it("moves a selected item down past its visible neighbor in one commit", () => {
    loadPanel({ "item-root": ["item-a", "item-b", "item-c"] }, ["item-a"]);
    expect(moveSelectedItemsDown(testWorkspace.host)).toBe(true);
    expect(childrenOf("item-root")).toEqual(["item-b", "item-a", "item-c"]);
    expect(changeCallback).toHaveBeenCalledTimes(1);
  });

  it("moves discontiguous selections downward in reverse group order", () => {
    loadPanel({ "item-root": ["item-a", "item-b", "item-c", "item-d"] }, [
      "item-a",
      "item-c",
    ]);
    expect(moveSelectedItemsDown(testWorkspace.host)).toBe(true);
    expect(childrenOf("item-root")).toEqual([
      "item-b",
      "item-a",
      "item-d",
      "item-c",
    ]);
    expect(changeCallback).toHaveBeenCalledTimes(1);
  });

  it("keeps a contiguous multi-selection together when moving up", () => {
    loadPanel({ "item-root": ["item-a", "item-b", "item-c"] }, [
      "item-b",
      "item-c",
    ]);
    expect(moveSelectedItemsUp(testWorkspace.host)).toBe(true);
    expect(childrenOf("item-root")).toEqual(["item-b", "item-c", "item-a"]);
  });

  it("refuses to move past the boundary and leaves the tree untouched", () => {
    loadPanel({ "item-root": ["item-a", "item-b"] }, ["item-a"]);
    expect(moveSelectedItemsUp(testWorkspace.host)).toBe(false);
    expect(childrenOf("item-root")).toEqual(["item-a", "item-b"]);
    expect(changeCallback).not.toHaveBeenCalled();
  });

  it("moves past a hidden sibling without disturbing its full-order position", () => {
    loadPanel(
      { "item-root": ["item-a", "item-hidden", "item-b"] },
      ["item-a"],
      {
        visibleItemIds: ["item-a", "item-b"],
      },
    );
    expect(moveSelectedItemsDown(testWorkspace.host)).toBe(true);
    expect(childrenOf("item-root")).toEqual([
      "item-hidden",
      "item-b",
      "item-a",
    ]);
  });

  it("rejects selections that span multiple parents", () => {
    loadPanel(
      { "item-root": ["item-a", "item-group"], "item-group": ["item-c"] },
      ["item-a", "item-c"],
    );
    expect(moveSelectedItemsDown(testWorkspace.host)).toBe(false);
    expect(changeCallback).not.toHaveBeenCalled();
  });
});

describe("selected item move gating", () => {
  it("disables keyboard moves while a registered list filter is active", () => {
    loadPanel({ "item-root": ["item-a", "item-b"] }, ["item-a"], {
      filterActive: true,
    });
    expect(moveSelectedItemsDown(testWorkspace.host)).toBe(false);
    expect(indentSelectedItems(testWorkspace.host)).toBe(false);
    expect(unindentSelectedItems(testWorkspace.host)).toBe(false);
  });

  it("disables keyboard moves when a selected item is not visible", () => {
    loadPanel({ "item-root": ["item-a", "item-b"] }, ["item-a"], {
      visibleItemIds: ["item-b"],
    });
    expect(moveSelectedItemsDown(testWorkspace.host)).toBe(false);
  });

  it("disables keyboard moves without a registered list view", () => {
    loadPanel({ "item-root": ["item-a", "item-b"] }, ["item-a"], {
      register: false,
    });
    expect(moveSelectedItemsDown(testWorkspace.host)).toBe(false);
  });

  it("disables keyboard moves without the edit-structure capability", () => {
    loadPanel({ "item-root": ["item-a", "item-b"] }, ["item-a"]);
    testWorkspace.capabilities.setState({ canEditStructure: false });
    expect(moveSelectedItemsDown(testWorkspace.host)).toBe(false);
    expect(indentSelectedItems(testWorkspace.host)).toBe(false);
    expect(unindentSelectedItems(testWorkspace.host)).toBe(false);
  });

  it("prefers the active section over document order when both hold selections", () => {
    registerSectionKinds(testWorkspace.host, {
      leaf: { renderContent: () => null },
    });
    const firstTree = makeItemTree({ "item-root": ["item-a", "item-b"] }, [
      "item-a",
    ]);
    const secondTree = makeItemTree({ "item-root": ["item-x", "item-y"] }, [
      "item-x",
    ]);
    loadWorkspaceDocument(testWorkspace.host, {
      sections: {
        first: makeSection("first", firstTree),
        second: makeSection("second", secondTree),
      },
      topLevelSections: {
        first: { x: 0, y: 0, w: 280, h: 240, zIndex: 0 },
        second: { x: 300, y: 0, w: 280, h: 240, zIndex: 0 },
      },
      viewport: { x: 0, y: 0, zoom: 1 },
      activeIds: ["second"],
    });
    registerItemListView(testWorkspace.host, "second", {
      listKey: "main",
      topLevelItemIds: ["item-x", "item-y"],
      visibleItemIds: new Set(["item-x", "item-y"]),
      filterActive: false,
    });
    changeCallback.mockClear();
    testWorkspace.host.subscribe(changeCallback);

    expect(moveSelectedItemsDown(testWorkspace.host)).toBe(true);
    expect(childrenOf("item-root", "second")).toEqual(["item-y", "item-x"]);
    expect(childrenOf("item-root", "first")).toEqual(["item-a", "item-b"]);
  });
});

describe("indentSelectedItems", () => {
  it("collapses a contiguous selection under the previous unselected sibling", () => {
    loadPanel({ "item-root": ["item-x", "item-o", "item-a", "item-b"] }, [
      "item-o",
      "item-a",
      "item-b",
    ]);
    expect(indentSelectedItems(testWorkspace.host)).toBe(true);
    expect(childrenOf("item-root")).toEqual(["item-x"]);
    expect(childrenOf("item-x")).toEqual(["item-o", "item-a", "item-b"]);
    expect(changeCallback).toHaveBeenCalledTimes(1);
  });

  it("indents non-contiguous groups independently", () => {
    loadPanel({ "item-root": ["item-x", "item-o", "item-a", "item-b"] }, [
      "item-o",
      "item-b",
    ]);
    expect(indentSelectedItems(testWorkspace.host)).toBe(true);
    expect(childrenOf("item-root")).toEqual(["item-x", "item-a"]);
    expect(childrenOf("item-x")).toEqual(["item-o"]);
    expect(childrenOf("item-a")).toEqual(["item-b"]);
  });

  it("no-ops without a previous unselected sibling but still consumes the shortcut", () => {
    loadPanel({ "item-root": ["item-a", "item-b"] }, ["item-a"]);
    expect(indentSelectedItems(testWorkspace.host)).toBe(true);
    expect(childrenOf("item-root")).toEqual(["item-a", "item-b"]);
    expect(changeCallback).not.toHaveBeenCalled();
  });
});

describe("unindentSelectedItems", () => {
  it("promotes the selection to just after its parent", () => {
    loadPanel(
      { "item-root": ["item-parent", "item-other"], "item-parent": ["item-x"] },
      ["item-x"],
    );
    expect(unindentSelectedItems(testWorkspace.host)).toBe(true);
    expect(childrenOf("item-root")).toEqual([
      "item-parent",
      "item-x",
      "item-other",
    ]);
    expect(childrenOf("item-parent")).toEqual([]);
    expect(changeCallback).toHaveBeenCalledTimes(1);
  });

  it("processes multiple parents while preserving root order", () => {
    loadPanel(
      {
        "item-root": ["item-p", "item-a"],
        "item-p": ["item-o"],
        "item-a": ["item-b"],
      },
      ["item-o", "item-b"],
    );
    expect(unindentSelectedItems(testWorkspace.host)).toBe(true);
    expect(childrenOf("item-root")).toEqual([
      "item-p",
      "item-o",
      "item-a",
      "item-b",
    ]);
    expect(changeCallback).toHaveBeenCalledTimes(1);
  });

  it("no-ops for a top-level selection but still consumes the shortcut", () => {
    loadPanel({ "item-root": ["item-a", "item-b"] }, ["item-a"]);
    expect(unindentSelectedItems(testWorkspace.host)).toBe(true);
    expect(childrenOf("item-root")).toEqual(["item-a", "item-b"]);
    expect(changeCallback).not.toHaveBeenCalled();
  });
});
