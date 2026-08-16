import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initialCanvasState, useReactFlow } from "../canvas/store";
import {
  registerItemListView,
  resetItemListViews,
} from "../items/itemListRegistry";
import { getActiveSectionIds } from "./activeSections";
import { setWorkspaceDocumentChangeCallback } from "./documentChangeCallback";
import { loadWorkspaceDocument } from "./loadWorkspaceDocument";
import { registerSectionKinds } from "./sectionKindRegistry";
import {
  selectAllInWorkspace,
  selectAllTopLevelNonGroupSections,
} from "./selectAllActions";
import {
  useActiveSections,
  useNodeInternals,
  useWorkspaceDocument,
} from "./stores";
import type { WorkspaceSection } from "./types";

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
    useWorkspaceDocument.getState().sections[sectionId]?.itemTree;
  if (!itemTree) {
    throw new Error(`expected section ${sectionId} to carry an item tree`);
  }
  return itemTree.selectedItemIds;
}

const documentChangeSpy = vi.fn();

// "panel" nests "nested-child" under "nested", so tree order and subtree pruning are both
// observable; "group" holds "grouped", and "bare" has no parameters at all.
function loadSelectionDocument(activeIds: Array<string>) {
  registerSectionKinds({ leaf: { renderContent: () => null } });
  loadWorkspaceDocument({
    sections: {
      panel: makeSection("panel", {
        itemTree: {
          rootId: "item-root",
          items: {
            "item-root": { id: "item-root", children: ["item-a", "nested"] },
            "item-a": { id: "item-a", children: [] },
            nested: { id: "nested", children: ["nested-child"] },
            "nested-child": { id: "nested-child", children: [] },
          },
          selectedItemIds: [],
        },
      }),
      bare: makeSection("bare"),
      group: makeSection("group", { kind: "group", children: ["grouped"] }),
      grouped: makeSection("grouped"),
    },
    topLevelSections: {
      panel: { x: 0, y: 0, w: 224, h: 96, zIndex: 0 },
      bare: { x: 300, y: 0, w: 224, h: 96, zIndex: 1 },
      group: { x: 600, y: 0, w: null, h: null, zIndex: 2 },
    },
    viewport: { x: 0, y: 0, zoom: 1 },
    activeIds,
  });
  documentChangeSpy.mockClear();
  setWorkspaceDocumentChangeCallback(documentChangeSpy);
}

describe("select-all actions", () => {
  beforeEach(() => {
    useReactFlow.setState({ ...initialCanvasState });
  });

  afterEach(() => {
    setWorkspaceDocumentChangeCallback(null);
    resetItemListViews();
    useWorkspaceDocument.getState().reset();
    useNodeInternals.getState().reset();
    useActiveSections.getState().reset();
    useReactFlow.setState({ ...initialCanvasState });
    registerSectionKinds({});
  });

  it("selects every parameter the single active section shows, in tree order", () => {
    loadSelectionDocument(["panel"]);
    registerItemListView("panel", {
      listKey: "main",
      topLevelItemIds: ["item-a", "nested"],
      visibleItemIds: new Set(["item-a", "nested", "nested-child"]),
      filterActive: false,
    });

    expect(selectAllInWorkspace()).toBe(true);
    expect(getSelectedItemIds("panel")).toEqual([
      "item-a",
      "nested",
      "nested-child",
    ]);
    expect(getActiveSectionIds()).toEqual(["panel"]);
    expect(documentChangeSpy).toHaveBeenCalledTimes(1);
  });

  it("leaves out rows a filter hides, including their children", () => {
    loadSelectionDocument(["panel"]);
    registerItemListView("panel", {
      listKey: "main",
      topLevelItemIds: ["item-a", "nested"],
      visibleItemIds: new Set(["item-a"]),
      filterActive: true,
    });

    expect(selectAllInWorkspace()).toBe(true);
    expect(getSelectedItemIds("panel")).toEqual(["item-a"]);
  });

  it("keeps a complete selection unchanged without notifying again", () => {
    loadSelectionDocument(["panel"]);
    registerItemListView("panel", {
      listKey: "main",
      topLevelItemIds: ["item-a", "nested"],
      visibleItemIds: new Set(["item-a", "nested", "nested-child"]),
      filterActive: false,
    });
    selectAllInWorkspace();
    documentChangeSpy.mockClear();

    expect(selectAllInWorkspace()).toBe(true);
    expect(getSelectedItemIds("panel")).toEqual([
      "item-a",
      "nested",
      "nested-child",
    ]);
    expect(documentChangeSpy).not.toHaveBeenCalled();
  });

  it("declines for a single active section with nothing to select", () => {
    loadSelectionDocument(["bare"]);

    expect(selectAllInWorkspace()).toBe(false);
    expect(getActiveSectionIds()).toEqual(["bare"]);
    expect(documentChangeSpy).not.toHaveBeenCalled();
  });

  it("declines while the single active section has no mounted list view", () => {
    loadSelectionDocument(["panel"]);

    expect(selectAllInWorkspace()).toBe(false);
    expect(getSelectedItemIds("panel")).toEqual([]);
  });

  it("selects every section, nested ones included, without a single active section", () => {
    loadSelectionDocument([]);

    expect(selectAllInWorkspace()).toBe(true);
    expect(getActiveSectionIds()).toEqual([
      "panel",
      "bare",
      "group",
      "grouped",
    ]);
    expect(documentChangeSpy).toHaveBeenCalledTimes(1);
  });

  it("selects every section from a multiple-section selection", () => {
    loadSelectionDocument(["panel", "bare"]);

    expect(selectAllInWorkspace()).toBe(true);
    expect(getActiveSectionIds()).toEqual([
      "panel",
      "bare",
      "group",
      "grouped",
    ]);
  });

  it("selects the top-level sections that are not groups", () => {
    loadSelectionDocument(["group"]);

    selectAllTopLevelNonGroupSections();

    expect(getActiveSectionIds()).toEqual(["panel", "bare"]);
    expect(documentChangeSpy).toHaveBeenCalledTimes(1);
  });
});
