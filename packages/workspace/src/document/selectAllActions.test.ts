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
import { initialCanvasState, useReactFlow } from "../canvas/store";
import {
  registerItemListView,
  resetItemListViews,
} from "../items/itemListRegistry";
import { getActiveSectionIds } from "./activeSections";
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
    testWorkspace.document.getState().sections[sectionId]?.itemTree;
  if (!itemTree) {
    throw new Error(`expected section ${sectionId} to carry an item tree`);
  }
  return itemTree.selectedItemIds;
}

const documentChangeSpy = vi.fn();

function loadSelectionDocument(activeIds: Array<string>) {
  registerSectionKinds(testWorkspace.host, {
    leaf: {
      renderContent: () => null,
      itemArea: { toolbar: "authoring-and-filter" },
    },
  });
  loadWorkspaceDocument(testWorkspace.host, {
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
    savedViews: null,
  });
  documentChangeSpy.mockClear();
  testWorkspace.host.subscribe(documentChangeSpy);
}

describe("select-all actions", () => {
  beforeEach(() => {
    testWorkspace.reactFlow.setState({ ...initialCanvasState });
  });

  afterEach(() => {
    resetItemListViews(testWorkspace.host);
    testWorkspace.document.getState().reset();
    testWorkspace.nodeInternals.getState().reset();
    testWorkspace.activeSections.getState().reset();
    testWorkspace.reactFlow.setState({ ...initialCanvasState });
    registerSectionKinds(testWorkspace.host, {});
  });

  it("selects every parameter the single active section shows, in tree order", () => {
    loadSelectionDocument(["panel"]);
    registerItemListView(testWorkspace.host, "panel", {
      listKey: "main",
      topLevelItemIds: ["item-a", "nested"],
      visibleItemIds: new Set(["item-a", "nested", "nested-child"]),
      filterActive: false,
    });

    expect(selectAllInWorkspace(testWorkspace.host)).toBe(true);
    expect(getSelectedItemIds("panel")).toEqual([
      "item-a",
      "nested",
      "nested-child",
    ]);
    expect(getActiveSectionIds(testWorkspace.host)).toEqual(["panel"]);
    expect(documentChangeSpy).toHaveBeenCalledTimes(1);
  });

  it("leaves out rows a filter hides, including their children", () => {
    loadSelectionDocument(["panel"]);
    registerItemListView(testWorkspace.host, "panel", {
      listKey: "main",
      topLevelItemIds: ["item-a", "nested"],
      visibleItemIds: new Set(["item-a"]),
      filterActive: true,
    });

    expect(selectAllInWorkspace(testWorkspace.host)).toBe(true);
    expect(getSelectedItemIds("panel")).toEqual(["item-a"]);
  });

  it("keeps a complete selection unchanged without notifying again", () => {
    loadSelectionDocument(["panel"]);
    registerItemListView(testWorkspace.host, "panel", {
      listKey: "main",
      topLevelItemIds: ["item-a", "nested"],
      visibleItemIds: new Set(["item-a", "nested", "nested-child"]),
      filterActive: false,
    });
    selectAllInWorkspace(testWorkspace.host);
    documentChangeSpy.mockClear();

    expect(selectAllInWorkspace(testWorkspace.host)).toBe(true);
    expect(getSelectedItemIds("panel")).toEqual([
      "item-a",
      "nested",
      "nested-child",
    ]);
    expect(documentChangeSpy).not.toHaveBeenCalled();
  });

  it("declines for a single active section with nothing to select", () => {
    loadSelectionDocument(["bare"]);

    expect(selectAllInWorkspace(testWorkspace.host)).toBe(false);
    expect(getActiveSectionIds(testWorkspace.host)).toEqual(["bare"]);
    expect(documentChangeSpy).not.toHaveBeenCalled();
  });

  it("declines while the single active section has no mounted list view", () => {
    loadSelectionDocument(["panel"]);

    expect(selectAllInWorkspace(testWorkspace.host)).toBe(false);
    expect(getSelectedItemIds("panel")).toEqual([]);
  });

  it("selects every section, nested ones included, without a single active section", () => {
    loadSelectionDocument([]);

    expect(selectAllInWorkspace(testWorkspace.host)).toBe(true);
    expect(getActiveSectionIds(testWorkspace.host)).toEqual([
      "panel",
      "bare",
      "group",
      "grouped",
    ]);
    expect(documentChangeSpy).toHaveBeenCalledTimes(1);
  });

  it("selects every section from a multiple-section selection", () => {
    loadSelectionDocument(["panel", "bare"]);

    expect(selectAllInWorkspace(testWorkspace.host)).toBe(true);
    expect(getActiveSectionIds(testWorkspace.host)).toEqual([
      "panel",
      "bare",
      "group",
      "grouped",
    ]);
  });

  it("selects the top-level sections that are not groups", () => {
    loadSelectionDocument(["group"]);

    selectAllTopLevelNonGroupSections(testWorkspace.host);

    expect(getActiveSectionIds(testWorkspace.host)).toEqual(["panel", "bare"]);
    expect(documentChangeSpy).toHaveBeenCalledTimes(1);
  });

  it("selects only sections visible in the active saved view", () => {
    loadSelectionDocument([]);
    const state = testWorkspace.document.getState();
    testWorkspace.document.setState({
      savedViews: {
        activeViewId: "overview",
        views: {
          overview: {
            id: "overview",
            isTab: false,
            name: "Overview",
            sectionVisibility: {
              bare: false,
              group: true,
              grouped: false,
              panel: true,
            },
            sortIndex: 0,
            topLevelSections: { ...state.topLevelSections },
            viewport: state.viewport === null ? null : { ...state.viewport },
          },
        },
      },
    });

    expect(selectAllInWorkspace(testWorkspace.host)).toBe(true);
    expect(getActiveSectionIds(testWorkspace.host)).toEqual(["panel", "group"]);

    selectAllTopLevelNonGroupSections(testWorkspace.host);
    expect(getActiveSectionIds(testWorkspace.host)).toEqual(["panel"]);
  });
});
