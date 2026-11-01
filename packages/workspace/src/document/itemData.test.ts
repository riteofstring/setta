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
import { getSectionItemTreeOrThrow } from "./documentSelectors.js";
import { setItemData } from "./itemData.js";
import { loadWorkspaceDocument } from "./loadWorkspaceDocument.js";
import { registerSectionKinds } from "./sectionKindRegistry.js";
import {
  useActiveSections,
  useNodeInternals,
  useWorkspaceDocument,
} from "./stores.js";

function loadTestDocument() {
  registerSectionKinds(testWorkspace.host, {
    leaf: {
      renderContent: () => null,
      itemArea: { toolbar: "authoring-and-filter" },
    },
  });
  loadWorkspaceDocument(testWorkspace.host, {
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
        overflowMode: false,
        tagColor: null,
        children: [],
        itemTree: {
          rootId: "item-root",
          items: {
            "item-root": { id: "item-root", children: ["item-a"] },
            "item-a": {
              id: "item-a",
              children: [],
              data: { label: "alpha", value: "0.001" },
            },
          },
          selectedItemIds: [],
        },
      },
    },
    topLevelSections: { panel: { x: 0, y: 0, w: 200, h: 100, zIndex: 0 } },
    viewport: { x: 0, y: 0, zoom: 1 },
    activeIds: [],
    savedViews: null,
  });
}

describe("setItemData", () => {
  beforeEach(() => {
    loadTestDocument();
  });

  afterEach(() => {
    registerSectionKinds(testWorkspace.host, {});
    testWorkspace.document.getState().reset();
    testWorkspace.nodeInternals.getState().reset();
    testWorkspace.activeSections.getState().reset();
  });

  it("replaces the item's opaque data and notifies the host once", () => {
    const onDocumentChange = vi.fn();
    testWorkspace.host.subscribe(onDocumentChange);
    setItemData(testWorkspace.host, "panel", "item-a", {
      label: "alpha",
      value: "0.5",
    });
    const itemTree = getSectionItemTreeOrThrow(
      testWorkspace.document.getState(),
      "panel",
    );
    expect(itemTree.items["item-a"]?.data).toEqual({
      label: "alpha",
      value: "0.5",
    });
    expect(itemTree.items["item-a"]?.children).toEqual([]);
    expect(onDocumentChange).toHaveBeenCalledTimes(1);
  });

  it("fails loudly for an unknown section or item", () => {
    expect(() =>
      setItemData(testWorkspace.host, "missing", "item-a", {}),
    ).toThrow();
    expect(() =>
      setItemData(testWorkspace.host, "panel", "missing", {}),
    ).toThrow();
    expect(() =>
      setItemData(testWorkspace.host, "panel", "item-root", {}),
    ).toThrowError(
      "Section panel item item-root is the structural root and has no data.",
    );
  });

  it("refuses to create an opaque-data path on a typed built-in item", () => {
    const document = testWorkspace.document.getState();
    const section = document.sections.panel;
    const itemTree = section?.itemTree;
    if (!section || !itemTree) {
      throw new Error("The item-data fixture lost its panel tree.");
    }
    testWorkspace.document.setState({
      sections: {
        ...document.sections,
        panel: {
          ...section,
          itemTree: {
            ...itemTree,
            items: {
              ...itemTree.items,
              "item-a": {
                id: "item-a",
                children: [],
                presentation: {
                  label: "alpha",
                  labelEditable: true,
                  control: {
                    kind: "switch",
                    value: "true",
                    configuration: { disabled: false },
                  },
                },
              },
            },
          },
        },
      },
    });
    expect(() =>
      setItemData(testWorkspace.host, "panel", "item-a", {}),
    ).toThrowError(
      "Section panel item item-a has a built-in presentation; use its typed mutation funnels.",
    );
  });
});
