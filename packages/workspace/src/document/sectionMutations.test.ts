import { beforeEach, describe, expect, it } from "vitest";
import { loadWorkspaceDocument } from "./loadWorkspaceDocument";
import {
  deleteSection,
  setSectionName,
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
  loadWorkspaceDocument({
    sections: {
      leaf: makeSection("leaf"),
      group: makeSection("group", { kind: "group", children: ["nested"] }),
      nested: makeSection("nested"),
    },
    topLevelSections: {
      leaf: { x: 0, y: 0, w: 100, h: 50, zIndex: 0 },
      group: { x: 200, y: 0, w: null, h: null, zIndex: 1 },
    },
    viewport: { x: 0, y: 0, zoom: 1 },
    activeIds: ["nested"],
  });
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
    expect(state.sections["group"]?.children).toEqual([]);
    expect(state.sections["nested"]).toBeUndefined();
  });
});
