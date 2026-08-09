import { beforeEach, describe, expect, it } from "vitest";
import { getActiveSectionIds } from "../document/activeSections";
import { useItemSelectionMode } from "../document/itemSelectionMode";
import { useActiveSections, useNodeInternals, useWorkspaceDocument } from "../document/stores";
import type { Node, WorkspaceSection } from "../document/types";
import { applyActiveSectionChange } from "./activeSectionController";
import { initialCanvasState, useReactFlow } from "./store";

function makeSection(id: string, children: Array<string> = []): WorkspaceSection {
  return {
    id,
    kind: "leaf",
    name: id,
    size: { width: 224, height: 96 },
    isMinimized: false,
    positionAndSizeLocked: false,
    isHorizontalOrientation: false,
    styleColor: null,
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
  useActiveSections.getState().reset();
  useWorkspaceDocument.getState().reset();
  useNodeInternals.getState().reset();
  useItemSelectionMode.getState().reset();
  useReactFlow.setState({ ...initialCanvasState });
  useWorkspaceDocument.setState({
    sections: {
      "group-a": makeSection("group-a", ["child-a"]),
      "child-a": makeSection("child-a"),
      "leaf-b": makeSection("leaf-b"),
    },
    parentSectionMap: { "child-a": "group-a" },
  });
  useNodeInternals.setState({
    x: new Map([
      ["group-a", makeNode("group-a", 0)],
      ["leaf-b", makeNode("leaf-b", 1)],
    ]),
  });
});

describe("applyActiveSectionChange", () => {
  it("replaces the selection on a plain section click and raises the highest ancestor", () => {
    useActiveSections.setState({ activeIds: ["leaf-b"] });

    const result = applyActiveSectionChange({
      interaction: "section-click",
      sectionId: "child-a",
    });

    expect(result.activeIdsChanged).toBe(true);
    expect(getActiveSectionIds()).toEqual(["child-a"]);
    const nodes = useNodeInternals.getState().x;
    expect(nodes.get("group-a")?.zIndex).toBeGreaterThan(nodes.get("leaf-b")?.zIndex ?? 0);
  });

  it("activates and raises the section when an editing control takes input focus", () => {
    useActiveSections.setState({ activeIds: ["leaf-b"] });

    const result = applyActiveSectionChange({
      interaction: "input-focus",
      sectionId: "child-a",
    });

    expect(result.activeIdsChanged).toBe(true);
    expect(getActiveSectionIds()).toEqual(["child-a"]);
    const nodes = useNodeInternals.getState().x;
    expect(nodes.get("group-a")?.zIndex).toBeGreaterThan(nodes.get("leaf-b")?.zIndex ?? 0);
  });

  it("toggles membership while the multi-selection key is held", () => {
    useReactFlow.setState({ multiSelectionActive: true });
    useActiveSections.setState({ activeIds: ["leaf-b"] });

    applyActiveSectionChange({ interaction: "section-click", sectionId: "group-a" });
    expect(getActiveSectionIds()).toEqual(["leaf-b", "group-a"]);

    applyActiveSectionChange({ interaction: "section-click", sectionId: "leaf-b" });
    expect(getActiveSectionIds()).toEqual(["group-a"]);
  });

  it("accepts explicit modifier state from selection surfaces outside the canvas", () => {
    useReactFlow.setState({ multiSelectionActive: false });
    useActiveSections.setState({ activeIds: ["leaf-b"] });

    applyActiveSectionChange({
      interaction: "section-click",
      sectionId: "group-a",
      multiSelectionActive: true,
    });
    expect(getActiveSectionIds()).toEqual(["leaf-b", "group-a"]);

    useReactFlow.setState({ multiSelectionActive: true });
    applyActiveSectionChange({
      interaction: "section-click",
      sectionId: "group-a",
      multiSelectionActive: false,
    });
    expect(getActiveSectionIds()).toEqual(["group-a"]);
  });

  it("clears the selection on a pane click without touching z-order", () => {
    useActiveSections.setState({ activeIds: ["leaf-b"] });
    const zBefore = useNodeInternals.getState().x.get("leaf-b")?.zIndex;

    const result = applyActiveSectionChange({ interaction: "pane-click" });

    expect(result.activeIdsChanged).toBe(true);
    expect(getActiveSectionIds()).toEqual([]);
    expect(useNodeInternals.getState().x.get("leaf-b")?.zIndex).toBe(zBefore);
  });

  it("applies marquee results verbatim", () => {
    applyActiveSectionChange({
      interaction: "selection-rect",
      selectedIds: ["group-a", "leaf-b"],
    });

    expect(getActiveSectionIds()).toEqual(["group-a", "leaf-b"]);
  });

  it("routes section clicks through the item-mode branch using the document's item selection", () => {
    useItemSelectionMode.setState({ isSelectingItems: true });
    useActiveSections.setState({ activeIds: ["group-a"] });
    useWorkspaceDocument.setState((state) => ({
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
    applyActiveSectionChange({ interaction: "section-click", sectionId: "child-a" });
    expect(getActiveSectionIds()).toEqual(["group-a"]);

    // Clicking a section whose items are selected activates it.
    const result = applyActiveSectionChange({ interaction: "section-click", sectionId: "leaf-b" });
    expect(result.reason).toBe("section-click:item-select-set");
    expect(getActiveSectionIds()).toEqual(["leaf-b"]);
  });
});
