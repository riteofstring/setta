import { beforeEach as beforeEachWorkspaceTestHost } from "vitest";
import { createWorkspaceTestHost, type WorkspaceTestHost } from "../../test/workspaceTestHost";

let testWorkspace: WorkspaceTestHost;
beforeEachWorkspaceTestHost(() => {
  testWorkspace = createWorkspaceTestHost();
});

import { beforeEach, describe, expect, it } from "vitest";
import { getActiveSectionIds } from "../document/activeSections";
import { useItemSelectionMode } from "../document/itemSelectionMode";
import {
  useActiveSections,
  useNodeInternals,
  useWorkspaceDocument,
} from "../document/stores";
import type { Node, WorkspaceSection } from "../document/types";
import { applyActiveSectionChange } from "./activeSectionController";
import { initialCanvasState, useReactFlow } from "./store";

function makeSection(
  id: string,
  children: Array<string> = [],
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
    children,
  };
}

function makeNode(id: string, zIndex: number): Node {
  return {
    id,
    position: { x: 0, y: 0 },
    width: 100,
    height: 80,
    zIndex,
    tempZIndex: zIndex,
    kind: "leaf",
  };
}

beforeEach(() => {
  testWorkspace.activeSections.getState().reset();
  testWorkspace.document.getState().reset();
  testWorkspace.nodeInternals.getState().reset();
  testWorkspace.itemSelectionMode.getState().reset();
  testWorkspace.reactFlow.setState({ ...initialCanvasState });
  testWorkspace.document.setState({
    sections: {
      "group-a": makeSection("group-a", ["child-a"]),
      "child-a": makeSection("child-a"),
      "leaf-b": makeSection("leaf-b"),
    },
    parentSectionMap: { "child-a": "group-a" },
  });
  testWorkspace.nodeInternals.setState({
    x: new Map([
      ["group-a", makeNode("group-a", 0)],
      ["leaf-b", makeNode("leaf-b", 1)],
    ]),
  });
});

describe("applyActiveSectionChange", () => {
  it("replaces the selection on a plain section click and raises the highest ancestor", () => {
    testWorkspace.activeSections.setState({ activeIds: ["leaf-b"] });

    const result = applyActiveSectionChange(testWorkspace.host, {
      interaction: "section-click",
      sectionId: "child-a",
    });

    expect(result.activeIdsChanged).toBe(true);
    expect(getActiveSectionIds(testWorkspace.host)).toEqual(["child-a"]);
    const nodes = testWorkspace.nodeInternals.getState().x;
    expect(nodes.get("group-a")?.zIndex).toBeGreaterThan(
      nodes.get("leaf-b")?.zIndex ?? 0,
    );
  });

  it("activates and raises the section when an editing control takes input focus", () => {
    testWorkspace.activeSections.setState({ activeIds: ["leaf-b"] });

    const result = applyActiveSectionChange(testWorkspace.host, {
      interaction: "input-focus",
      sectionId: "child-a",
    });

    expect(result.activeIdsChanged).toBe(true);
    expect(getActiveSectionIds(testWorkspace.host)).toEqual(["child-a"]);
    const nodes = testWorkspace.nodeInternals.getState().x;
    expect(nodes.get("group-a")?.zIndex).toBeGreaterThan(
      nodes.get("leaf-b")?.zIndex ?? 0,
    );
  });

  it("toggles membership while the multi-selection key is held", () => {
    testWorkspace.reactFlow.setState({ multiSelectionActive: true });
    testWorkspace.activeSections.setState({ activeIds: ["leaf-b"] });

    applyActiveSectionChange(testWorkspace.host, {
      interaction: "section-click",
      sectionId: "group-a",
    });
    expect(getActiveSectionIds(testWorkspace.host)).toEqual(["leaf-b", "group-a"]);

    applyActiveSectionChange(testWorkspace.host, {
      interaction: "section-click",
      sectionId: "leaf-b",
    });
    expect(getActiveSectionIds(testWorkspace.host)).toEqual(["group-a"]);
  });

  it("accepts explicit modifier state from selection surfaces outside the canvas", () => {
    testWorkspace.reactFlow.setState({ multiSelectionActive: false });
    testWorkspace.activeSections.setState({ activeIds: ["leaf-b"] });

    applyActiveSectionChange(testWorkspace.host, {
      interaction: "section-click",
      sectionId: "group-a",
      multiSelectionActive: true,
    });
    expect(getActiveSectionIds(testWorkspace.host)).toEqual(["leaf-b", "group-a"]);

    testWorkspace.reactFlow.setState({ multiSelectionActive: true });
    applyActiveSectionChange(testWorkspace.host, {
      interaction: "section-click",
      sectionId: "group-a",
      multiSelectionActive: false,
    });
    expect(getActiveSectionIds(testWorkspace.host)).toEqual(["group-a"]);
  });

  it("clears the selection on a pane click without touching z-order", () => {
    testWorkspace.activeSections.setState({ activeIds: ["leaf-b"] });
    const zBefore = testWorkspace.nodeInternals.getState().x.get("leaf-b")?.zIndex;

    const result = applyActiveSectionChange(testWorkspace.host, { interaction: "pane-click" });

    expect(result.activeIdsChanged).toBe(true);
    expect(getActiveSectionIds(testWorkspace.host)).toEqual([]);
    expect(testWorkspace.nodeInternals.getState().x.get("leaf-b")?.zIndex).toBe(zBefore);
  });

  it("applies marquee results verbatim", () => {
    applyActiveSectionChange(testWorkspace.host, {
      interaction: "selection-rect",
      selectedIds: ["group-a", "leaf-b"],
    });

    expect(getActiveSectionIds(testWorkspace.host)).toEqual(["group-a", "leaf-b"]);
  });

  it("routes section clicks through the item-mode branch using the document's item selection", () => {
    testWorkspace.itemSelectionMode.setState({ isSelectingItems: true });
    testWorkspace.activeSections.setState({ activeIds: ["group-a"] });
    testWorkspace.document.setState((state) => ({
      sections: {
        ...state.sections,
        "leaf-b": {
          ...makeSection("leaf-b"),
          itemTree: {
            rootId: "item-root",
            items: {
              "item-root": { id: "item-root", children: ["row"] },
              row: { id: "row", children: [] },
            },
            selectedItemIds: ["row"],
          },
        },
      },
    }));

    // Clicking a section without selected items keeps the current active ids.
    applyActiveSectionChange(testWorkspace.host, {
      interaction: "section-click",
      sectionId: "child-a",
    });
    expect(getActiveSectionIds(testWorkspace.host)).toEqual(["group-a"]);

    // Clicking a section whose items are selected activates it.
    const result = applyActiveSectionChange(testWorkspace.host, {
      interaction: "section-click",
      sectionId: "leaf-b",
    });
    expect(result.reason).toBe("section-click:item-select-set");
    expect(getActiveSectionIds(testWorkspace.host)).toEqual(["leaf-b"]);
  });
});
