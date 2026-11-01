import {
  afterEach as afterEachWorkspaceTestHost,
  beforeEach as beforeEachWorkspaceTestHost,
} from "vitest";
import {
  createWorkspaceTestHost,
  type WorkspaceTestHost,
} from "../../test/workspaceTestHost.js";

let testWorkspace: WorkspaceTestHost;
beforeEachWorkspaceTestHost(() => {
  testWorkspace = createWorkspaceTestHost();
});
afterEachWorkspaceTestHost(() => {
  testWorkspace.host.dispose();
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initialCanvasState, useReactFlow } from "../canvas/store.js";
import {
  selectOnlyItem,
  toggleItemSelected,
  unselectAllItems,
} from "./itemSelection.js";
import {
  activateItemSelect,
  deactivateItemSelect,
  useItemSelectionMode,
} from "./itemSelectionMode.js";
import { loadWorkspaceDocument } from "./loadWorkspaceDocument.js";
import { registerSectionKinds } from "./sectionKindRegistry.js";
import {
  useActiveSections,
  useNodeInternals,
  useWorkspaceDocument,
} from "./stores.js";
import type { WorkspaceSection, WorkspaceSectionItemTree } from "./types.js";

function makeItemTree(
  topLevelItemIds: Array<string>,
  selectedItemIds: Array<string> = [],
): WorkspaceSectionItemTree {
  return {
    rootId: "item-root",
    items: Object.fromEntries(
      ["item-root", ...topLevelItemIds].map((id) => [
        id,
        { id, children: id === "item-root" ? topLevelItemIds : [] },
      ]),
    ),
    selectedItemIds,
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

function getSelectedItemIds(sectionId: string): Array<string> {
  const itemTree =
    testWorkspace.document.getState().sections[sectionId]?.itemTree;
  if (!itemTree) {
    throw new Error(`expected section ${sectionId} to carry an item tree`);
  }
  return itemTree.selectedItemIds;
}

const documentChangeSpy = vi.fn();

describe("item selection", () => {
  beforeEach(() => {
    registerSectionKinds(testWorkspace.host, {
      leaf: {
        renderContent: () => null,
        itemArea: { toolbar: "authoring-and-filter" },
      },
    });
    loadWorkspaceDocument(testWorkspace.host, {
      sections: {
        "section-a": makeSection("section-a", {
          itemTree: makeItemTree(["a-1", "a-2"]),
        }),
        "section-b": makeSection("section-b", {
          itemTree: makeItemTree(["b-1"]),
        }),
        bare: makeSection("bare"),
      },
      topLevelSections: {
        "section-a": { x: 0, y: 0, w: 224, h: 96, zIndex: 0 },
        "section-b": { x: 300, y: 0, w: 224, h: 96, zIndex: 1 },
        bare: { x: 600, y: 0, w: 224, h: 96, zIndex: 2 },
      },
      viewport: { x: 0, y: 0, zoom: 1 },
      activeIds: [],
      savedViews: null,
    });
    activateItemSelect(testWorkspace.host);
    documentChangeSpy.mockClear();
    testWorkspace.host.subscribe(documentChangeSpy);
  });

  afterEach(() => {
    testWorkspace.document.getState().reset();
    testWorkspace.nodeInternals.getState().reset();
    testWorkspace.activeSections.getState().reset();
    testWorkspace.itemSelectionMode.getState().reset();
    testWorkspace.reactFlow.setState({ ...initialCanvasState });
    registerSectionKinds(testWorkspace.host, {});
  });

  it("toggles selection on the canonical tree and activates the section during item mode", () => {
    toggleItemSelected(testWorkspace.host, "section-a", "a-1");
    expect(getSelectedItemIds("section-a")).toEqual(["a-1"]);
    expect(testWorkspace.activeSections.getState().activeIds).toEqual([
      "section-a",
    ]);

    expect(documentChangeSpy).toHaveBeenCalledTimes(2);

    toggleItemSelected(testWorkspace.host, "section-a", "a-2");
    toggleItemSelected(testWorkspace.host, "section-a", "a-1");
    expect(getSelectedItemIds("section-a")).toEqual(["a-2"]);
  });

  it("keeps the active ids for toggles while item selection mode is inactive", () => {
    deactivateItemSelect(testWorkspace.host);
    testWorkspace.activeSections.setState({ activeIds: ["section-b"] });

    toggleItemSelected(testWorkspace.host, "section-a", "a-1");
    expect(getSelectedItemIds("section-a")).toEqual(["a-1"]);
    expect(testWorkspace.activeSections.getState().activeIds).toEqual([
      "section-b",
    ]);
  });

  it("fails loudly for unknown items, the root item, and sections without items", () => {
    expect(() =>
      toggleItemSelected(testWorkspace.host, "section-a", "ghost"),
    ).toThrowError(/Unknown item ghost/);
    expect(() =>
      toggleItemSelected(testWorkspace.host, "section-a", "item-root"),
    ).toThrowError(/Cannot select the root item item-root/);
    expect(() =>
      toggleItemSelected(testWorkspace.host, "bare", "a-1"),
    ).toThrowError(/Section bare has no item tree/);
  });

  it("clears selection across sections in one commit and reports whether anything changed", () => {
    toggleItemSelected(testWorkspace.host, "section-a", "a-1");
    toggleItemSelected(testWorkspace.host, "section-b", "b-1");
    documentChangeSpy.mockClear();

    expect(unselectAllItems(testWorkspace.host)).toBe(true);
    expect(getSelectedItemIds("section-a")).toEqual([]);
    expect(getSelectedItemIds("section-b")).toEqual([]);
    expect(documentChangeSpy).toHaveBeenCalledTimes(1);

    expect(unselectAllItems(testWorkspace.host)).toBe(false);
    expect(documentChangeSpy).toHaveBeenCalledTimes(1);
  });

  it("selects only the given item, replacing selections in every section", () => {
    toggleItemSelected(testWorkspace.host, "section-a", "a-2");
    toggleItemSelected(testWorkspace.host, "section-b", "b-1");

    selectOnlyItem(testWorkspace.host, "section-a", "a-1");
    expect(getSelectedItemIds("section-a")).toEqual(["a-1"]);
    expect(getSelectedItemIds("section-b")).toEqual([]);
  });

  it("leaves an already-sole selection untouched without notifying", () => {
    toggleItemSelected(testWorkspace.host, "section-a", "a-1");
    documentChangeSpy.mockClear();

    selectOnlyItem(testWorkspace.host, "section-a", "a-1");
    expect(getSelectedItemIds("section-a")).toEqual(["a-1"]);
    expect(documentChangeSpy).not.toHaveBeenCalled();
  });
});
