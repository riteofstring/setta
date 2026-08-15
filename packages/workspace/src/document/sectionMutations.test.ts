import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setWorkspaceDocumentChangeCallback } from "./documentChangeCallback";
import { loadWorkspaceDocument } from "./loadWorkspaceDocument";
import { registerSectionKinds } from "./sectionKindRegistry";
import {
  deleteSection,
  deleteSections,
  groupSections,
  setSectionName,
  setSectionsPositionLocked,
  setSectionStyleColor,
  toggleGroupOrientation,
  toggleMinimized,
  togglePositionLock,
} from "./sectionMutations";
import { useActiveSections, useNodeInternals, useWorkspaceDocument } from "./stores";
import type { WorkspaceSection } from "./types";

function makeSection(id: string, overrides: Partial<WorkspaceSection> = {}): WorkspaceSection {
  return {
    id,
    kind: "leaf",
    name: id,
    size: { width: 100, height: 50 },
    isMinimized: false,
    positionAndSizeLocked: false,
    isHorizontalOrientation: false,
    styleColor: null,
    tagColor: null,
    children: [],
    ...overrides,
  };
}

beforeEach(() => {
  registerSectionKinds({ leaf: { renderContent: () => null } });
  loadWorkspaceDocument({
    sections: {
      leaf: makeSection("leaf"),
      "leaf-b": makeSection("leaf-b"),
      group: makeSection("group", { kind: "group", children: ["nested", "nested-b"] }),
      nested: makeSection("nested"),
      "nested-b": makeSection("nested-b"),
    },
    topLevelSections: {
      leaf: { x: 0, y: 0, w: 100, h: 50, zIndex: 0 },
      group: { x: 200, y: 0, w: null, h: null, zIndex: 1 },
      "leaf-b": { x: 100, y: 100, w: 100, h: 50, zIndex: 2 },
    },
    viewport: { x: 0, y: 0, zoom: 1 },
    activeIds: ["nested"],
  });
});

afterEach(() => {
  setWorkspaceDocumentChangeCallback(null);
});

describe("per-flag section mutations", () => {
  it("renames a section", () => {
    setSectionName("leaf", "Renamed leaf");
    expect(useWorkspaceDocument.getState().sections["leaf"]?.name).toBe("Renamed leaf");
  });

  it("toggles the position lock", () => {
    togglePositionLock("leaf");
    expect(useWorkspaceDocument.getState().sections["leaf"]?.positionAndSizeLocked).toBe(true);
    togglePositionLock("leaf");
    expect(useWorkspaceDocument.getState().sections["leaf"]?.positionAndSizeLocked).toBe(false);
  });

  it("toggles minimization", () => {
    toggleMinimized("leaf");
    expect(useWorkspaceDocument.getState().sections["leaf"]?.isMinimized).toBe(true);
  });

  it("toggles group orientation", () => {
    toggleGroupOrientation("group");
    expect(useWorkspaceDocument.getState().sections["group"]?.isHorizontalOrientation).toBe(true);
  });

  it("refuses to write orientation onto a non-group, as the reference funnel does", () => {
    toggleGroupOrientation("leaf");
    expect(useWorkspaceDocument.getState().sections["leaf"]?.isHorizontalOrientation).toBe(false);
  });

  it("throws for an unknown section", () => {
    expect(() => setSectionName("missing", "x")).toThrow(/Unknown section/);
  });

  it("normalizes a style accent and reprojects its live node", () => {
    let observedDocumentAccent: string | null | undefined;
    const unsubscribe = useNodeInternals.subscribe(() => {
      observedDocumentAccent = useWorkspaceDocument.getState().sections["leaf"]?.styleColor;
    });
    setSectionStyleColor("leaf", "ABCDEF");
    unsubscribe();

    expect(useWorkspaceDocument.getState().sections["leaf"]?.styleColor).toBe("#abcdef");
    expect(useNodeInternals.getState().x.get("leaf")?.style?.background).toMatch(/^#/u);
    expect(observedDocumentAccent).toBe("#abcdef");
  });

  it("sets a mixed lock selection through one canonical notification", () => {
    const onChange = vi.fn();
    setWorkspaceDocumentChangeCallback(onChange);

    setSectionsPositionLocked(["leaf", "leaf-b"], true);

    expect(useWorkspaceDocument.getState().sections["leaf"]?.positionAndSizeLocked).toBe(true);
    expect(useWorkspaceDocument.getState().sections["leaf-b"]?.positionAndSizeLocked).toBe(true);
    expect(onChange).toHaveBeenCalledOnce();
  });
});

describe("deleteSection", () => {
  it("removes a top-level leaf from the document, layout, and node internals", () => {
    deleteSection("leaf");

    const state = useWorkspaceDocument.getState();
    expect(state.sections["leaf"]).toBeUndefined();
    expect(state.topLevelSections["leaf"]).toBeUndefined();
    expect(useNodeInternals.getState().x.has("leaf")).toBe(false);
  });

  it("removes a whole group subtree and deselects the deleted sections", () => {
    deleteSection("group");

    const state = useWorkspaceDocument.getState();
    expect(state.sections["group"]).toBeUndefined();
    expect(state.sections["nested"]).toBeUndefined();
    expect(state.parentSectionMap["nested"]).toBeUndefined();
    expect(useActiveSections.getState().activeIds).toEqual([]);
    expect(useNodeInternals.getState().x.has("group")).toBe(false);
  });

  it("removes a nested section from its parent's children", () => {
    deleteSection("nested");

    const state = useWorkspaceDocument.getState();
    expect(state.sections["group"]?.children).toEqual(["nested-b"]);
    expect(state.sections["nested"]).toBeUndefined();
  });

  it("removes multiple selected subtrees through one notification", () => {
    const onChange = vi.fn();
    setWorkspaceDocumentChangeCallback(onChange);

    deleteSections(["leaf", "group"]);

    expect(Object.keys(useWorkspaceDocument.getState().sections)).toEqual(["leaf-b"]);
    expect(onChange).toHaveBeenCalledOnce();
  });
});

describe("groupSections", () => {
  it("creates a top-level group at the reference minimum position in sibling order", () => {
    groupSections(["leaf-b", "leaf"], "created-group");

    const state = useWorkspaceDocument.getState();
    expect(state.sections["created-group"]).toMatchObject({
      kind: "group",
      name: "Group",
      children: ["leaf", "leaf-b"],
      size: { width: "auto", height: "auto" },
    });
    expect(state.topLevelSections["created-group"]).toEqual({
      x: 0,
      y: 0,
      w: null,
      h: null,
      zIndex: 3,
    });
    expect(state.topLevelSections["leaf"]).toBeUndefined();
    expect(Object.keys(state.topLevelSections)).toEqual(["created-group", "group"]);
    expect(state.parentSectionMap["leaf"]).toBe("created-group");
    expect(useActiveSections.getState().activeIds).toEqual(["created-group"]);
  });

  it("creates a child group at the first selected sibling", () => {
    groupSections(["nested-b", "nested"], "created-nested-group");

    const state = useWorkspaceDocument.getState();
    expect(state.sections["group"]?.children).toEqual(["created-nested-group"]);
    expect(state.sections["created-nested-group"]?.children).toEqual(["nested", "nested-b"]);
    expect(state.parentSectionMap["created-nested-group"]).toBe("group");
  });

  it("rejects selections whose sections do not share one parent", () => {
    expect(() => groupSections(["leaf", "nested"], "invalid-group")).toThrow(
      /share the same parent/,
    );
  });
});
