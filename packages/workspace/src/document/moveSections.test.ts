import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GROUP_SECTION_KIND } from "./documentSelectors";
import { loadWorkspaceDocument } from "./loadWorkspaceDocument";
import { moveSections } from "./moveSections";
import { registerSectionKinds } from "./sectionKindRegistry";
import {
  useActiveSections,
  useNodeInternals,
  useWorkspaceDocument,
} from "./stores";
import type { WorkspaceSection } from "./types";

// Freezes the package's single dnd commit funnel: the reference's
// `moveSectionsWithBackend` canonical-state result minus its backend send.

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

function loadTestDocument() {
  registerSectionKinds({ leaf: { renderContent: () => null } });
  loadWorkspaceDocument({
    sections: {
      leaf: makeSection("leaf"),
      group: makeSection("group", {
        kind: GROUP_SECTION_KIND,
        size: { width: "auto", height: "auto" },
        children: ["nested-a", "nested-b"],
      }),
      "nested-a": makeSection("nested-a"),
      "nested-b": makeSection("nested-b"),
    },
    topLevelSections: {
      leaf: { x: 0, y: 0, w: 224, h: 96, zIndex: 0 },
      group: { x: 300, y: 0, w: null, h: null, zIndex: 1 },
    },
    viewport: { x: 0, y: 0, zoom: 1 },
    activeIds: [],
  });
}

function resetStores() {
  useWorkspaceDocument.getState().reset();
  useNodeInternals.getState().reset();
  useActiveSections.getState().reset();
}

describe("moveSections", () => {
  beforeEach(() => {
    loadTestDocument();
  });

  afterEach(() => {
    resetStores();
  });

  it("reorders children within the same parent", () => {
    moveSections({
      sectionIds: ["nested-b"],
      newParentId: "group",
      newIndex: 0,
      positionsById: null,
    });

    const state = useWorkspaceDocument.getState();
    expect(state.sections["group"]?.children).toEqual(["nested-b", "nested-a"]);
    expect(state.parentSectionMap["nested-b"]).toBe("group");
  });

  it("moves a top-level section into a group and drops its layout and node", () => {
    moveSections({
      sectionIds: ["leaf"],
      newParentId: "group",
      newIndex: 1,
      positionsById: null,
    });

    const state = useWorkspaceDocument.getState();
    expect(state.sections["group"]?.children).toEqual([
      "nested-a",
      "leaf",
      "nested-b",
    ]);
    expect(state.parentSectionMap["leaf"]).toBe("group");
    expect(state.topLevelSections["leaf"]).toBeUndefined();
    expect(useNodeInternals.getState().x.has("leaf")).toBe(false);
  });

  it("moves a nested section to the pane at the dropped position above every node", () => {
    moveSections({
      sectionIds: ["nested-a"],
      newParentId: null,
      newIndex: 0,
      positionsById: { "nested-a": { x: 40, y: 80 } },
    });

    const state = useWorkspaceDocument.getState();
    expect(state.sections["group"]?.children).toEqual(["nested-b"]);
    expect(state.parentSectionMap["nested-a"]).toBeUndefined();
    expect(state.topLevelSections["nested-a"]).toEqual({
      x: 40,
      y: 80,
      w: null,
      h: null,
      zIndex: 2,
    });

    const node = useNodeInternals.getState().x.get("nested-a");
    expect(node?.position).toEqual({ x: 40, y: 80 });
    expect(node?.zIndex).toBe(2);
    expect(node?.tempZIndex).toBe(2);
  });

  it("keeps an already top-level section's z-index when repositioned on the pane", () => {
    moveSections({
      sectionIds: ["leaf"],
      newParentId: null,
      newIndex: 0,
      positionsById: { leaf: { x: 500, y: 700 } },
    });

    const state = useWorkspaceDocument.getState();
    expect(state.topLevelSections["leaf"]).toEqual({
      x: 500,
      y: 700,
      w: 224,
      h: 96,
      zIndex: 0,
    });
  });

  it("requires an index when nesting and positions when dropping on the pane", () => {
    expect(() =>
      moveSections({
        sectionIds: ["leaf"],
        newParentId: "group",
        newIndex: null,
        positionsById: null,
      }),
    ).toThrow("Expected newIndex when moving sections into parent.");
    expect(() =>
      moveSections({
        sectionIds: ["nested-a"],
        newParentId: null,
        newIndex: 0,
        positionsById: null,
      }),
    ).toThrow("Expected positionsById when moving sections to pane.");
  });

  it("preserves a node z-raise that has not reached a layout commit", () => {
    // Selection raises the node z-index without immediately committing layout; the move
    // funnel mirrors node z-order into the document before rebuilding.
    const nodes = new Map(useNodeInternals.getState().x);
    const leafNode = nodes.get("leaf");
    if (!leafNode) {
      throw new Error("Missing leaf node.");
    }
    nodes.set("leaf", { ...leafNode, zIndex: 5, tempZIndex: 5 });
    useNodeInternals.setState({ x: nodes });

    moveSections({
      sectionIds: ["nested-a"],
      newParentId: null,
      newIndex: 0,
      positionsById: { "nested-a": { x: 10, y: 10 } },
    });

    const state = useWorkspaceDocument.getState();
    expect(state.topLevelSections["leaf"]?.zIndex).toBe(5);
    expect(state.topLevelSections["nested-a"]?.zIndex).toBe(6);
  });
});
