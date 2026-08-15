import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initialCanvasState, useReactFlow } from "../canvas/store";
import { setWorkspaceDocumentChangeCallback } from "./documentChangeCallback";
import { selectOnlyItem, toggleItemSelected, unselectAllItems } from "./itemSelection";
import {
  activateItemSelect,
  deactivateItemSelect,
  useItemSelectionMode,
} from "./itemSelectionMode";
import { loadWorkspaceDocument } from "./loadWorkspaceDocument";
import { registerSectionKinds } from "./sectionKindRegistry";
import { useActiveSections, useNodeInternals, useWorkspaceDocument } from "./stores";
import type { WorkspaceSection, WorkspaceSectionItemTree } from "./types";

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

function makeSection(id: string, overrides: Partial<WorkspaceSection> = {}): WorkspaceSection {
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
  const itemTree = useWorkspaceDocument.getState().sections[sectionId]?.itemTree;
  if (!itemTree) {
    throw new Error(`expected section ${sectionId} to carry an item tree`);
  }
  return itemTree.selectedItemIds;
}

const documentChangeSpy = vi.fn();

describe("item selection", () => {
  beforeEach(() => {
    registerSectionKinds({ leaf: { renderContent: () => null } });
    loadWorkspaceDocument({
      sections: {
        "section-a": makeSection("section-a", { itemTree: makeItemTree(["a-1", "a-2"]) }),
        "section-b": makeSection("section-b", { itemTree: makeItemTree(["b-1"]) }),
        bare: makeSection("bare"),
      },
      topLevelSections: {
        "section-a": { x: 0, y: 0, w: 224, h: 96, zIndex: 0 },
        "section-b": { x: 300, y: 0, w: 224, h: 96, zIndex: 1 },
        bare: { x: 600, y: 0, w: 224, h: 96, zIndex: 2 },
      },
      viewport: { x: 0, y: 0, zoom: 1 },
      activeIds: [],
    });
    activateItemSelect();
    documentChangeSpy.mockClear();
    setWorkspaceDocumentChangeCallback(documentChangeSpy);
  });

  afterEach(() => {
    setWorkspaceDocumentChangeCallback(null);
    useWorkspaceDocument.getState().reset();
    useNodeInternals.getState().reset();
    useActiveSections.getState().reset();
    useItemSelectionMode.getState().reset();
    useReactFlow.setState({ ...initialCanvasState });
    registerSectionKinds({});
  });

  it("toggles selection on the canonical tree and activates the section during item mode", () => {
    toggleItemSelected("section-a", "a-1");
    expect(getSelectedItemIds("section-a")).toEqual(["a-1"]);
    expect(useActiveSections.getState().activeIds).toEqual(["section-a"]);
    // One notification for the selection commit, one for the active-section commit — the
    // reference sends one toggle route and one active-ids route.
    expect(documentChangeSpy).toHaveBeenCalledTimes(2);

    toggleItemSelected("section-a", "a-2");
    toggleItemSelected("section-a", "a-1");
    expect(getSelectedItemIds("section-a")).toEqual(["a-2"]);
  });

  it("keeps the active ids for toggles while item selection mode is inactive", () => {
    deactivateItemSelect();
    useActiveSections.setState({ activeIds: ["section-b"] });

    toggleItemSelected("section-a", "a-1");
    expect(getSelectedItemIds("section-a")).toEqual(["a-1"]);
    expect(useActiveSections.getState().activeIds).toEqual(["section-b"]);
  });

  it("fails loudly for unknown items, the root item, and sections without items", () => {
    expect(() => toggleItemSelected("section-a", "ghost")).toThrowError(/Unknown item ghost/);
    expect(() => toggleItemSelected("section-a", "item-root")).toThrowError(
      /Cannot select the root item item-root/,
    );
    expect(() => toggleItemSelected("bare", "a-1")).toThrowError(/Section bare has no item tree/);
  });

  it("clears selection across sections in one commit and reports whether anything changed", () => {
    toggleItemSelected("section-a", "a-1");
    toggleItemSelected("section-b", "b-1");
    documentChangeSpy.mockClear();

    expect(unselectAllItems()).toBe(true);
    expect(getSelectedItemIds("section-a")).toEqual([]);
    expect(getSelectedItemIds("section-b")).toEqual([]);
    expect(documentChangeSpy).toHaveBeenCalledTimes(1);

    expect(unselectAllItems()).toBe(false);
    expect(documentChangeSpy).toHaveBeenCalledTimes(1);
  });

  it("selects only the given item, replacing selections in every section", () => {
    toggleItemSelected("section-a", "a-2");
    toggleItemSelected("section-b", "b-1");

    selectOnlyItem("section-a", "a-1");
    expect(getSelectedItemIds("section-a")).toEqual(["a-1"]);
    expect(getSelectedItemIds("section-b")).toEqual([]);
  });

  it("leaves an already-sole selection untouched without notifying", () => {
    toggleItemSelected("section-a", "a-1");
    documentChangeSpy.mockClear();

    selectOnlyItem("section-a", "a-1");
    expect(getSelectedItemIds("section-a")).toEqual(["a-1"]);
    expect(documentChangeSpy).not.toHaveBeenCalled();
  });
});
