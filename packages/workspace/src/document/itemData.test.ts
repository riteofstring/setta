import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setWorkspaceDocumentChangeCallback } from "./documentChangeCallback";
import { getSectionItemTreeOrThrow } from "./documentSelectors";
import { setItemData } from "./itemData";
import { loadWorkspaceDocument } from "./loadWorkspaceDocument";
import { registerSectionKinds } from "./sectionKindRegistry";
import { useActiveSections, useNodeInternals, useWorkspaceDocument } from "./stores";

// The host-persistence funnel behind the built-in controls: one canonical commit of the
// opaque item data, one host notification, and loud failures for unknown targets.

function loadTestDocument() {
  registerSectionKinds({ leaf: { renderContent: () => null } });
  loadWorkspaceDocument({
    sections: {
      panel: {
        id: "panel",
        kind: "leaf",
        name: "panel",
        size: { width: 200, height: 100 },
        isMinimized: false,
        positionAndSizeLocked: false,
        isHorizontalOrientation: false,
        styleColor: null,
        tagColor: null,
        children: [],
        itemTree: {
          rootId: "item-root",
          items: {
            "item-root": { id: "item-root", children: ["item-a"], data: {} },
            "item-a": { id: "item-a", children: [], data: { label: "alpha", value: "0.001" } },
          },
          selectedItemIds: [],
        },
      },
    },
    topLevelSections: { panel: { x: 0, y: 0, w: 200, h: 100, zIndex: 0 } },
    viewport: { x: 0, y: 0, zoom: 1 },
    activeIds: [],
  });
}

describe("setItemData", () => {
  beforeEach(() => {
    loadTestDocument();
  });

  afterEach(() => {
    setWorkspaceDocumentChangeCallback(null);
    registerSectionKinds({});
    useWorkspaceDocument.getState().reset();
    useNodeInternals.getState().reset();
    useActiveSections.getState().reset();
  });

  it("replaces the item's opaque data and notifies the host once", () => {
    const onDocumentChange = vi.fn();
    setWorkspaceDocumentChangeCallback(onDocumentChange);
    setItemData("panel", "item-a", { label: "alpha", value: "0.5" });
    const itemTree = getSectionItemTreeOrThrow(useWorkspaceDocument.getState(), "panel");
    expect(itemTree.items["item-a"]?.data).toEqual({ label: "alpha", value: "0.5" });
    expect(itemTree.items["item-a"]?.children).toEqual([]);
    expect(onDocumentChange).toHaveBeenCalledTimes(1);
  });

  it("fails loudly for an unknown section or item", () => {
    expect(() => setItemData("missing", "item-a", {})).toThrow();
    expect(() => setItemData("panel", "missing", {})).toThrow();
  });
});
