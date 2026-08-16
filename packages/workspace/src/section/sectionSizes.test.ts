import { describe, expect, it } from "vitest";
import type { WorkspaceDocumentState } from "../document/stores";
import type { WorkspaceSection } from "../document/types";
import {
  getResizeStartAutoSizeUpdate,
  isHeightResizeDirection,
  setSelfParentSiblingChildrenWidths,
} from "./sectionSizes";

// Characterizes the reference's width-propagation walk: the climb continues only while the
// current section is a nested vertical group, then every descendant of the highest such
// ancestor receives the width (excluding the resized section, which already has it).

function makeSection(
  id: string,
  overrides: Partial<WorkspaceSection> = {},
): WorkspaceSection {
  return {
    id,
    kind: "leaf",
    name: id,
    size: { width: 100, height: 50 },
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

function makeState(
  sections: Array<WorkspaceSection>,
  parentSectionMap: Record<string, string>,
): WorkspaceDocumentState {
  return {
    sections: Object.fromEntries(
      sections.map((section) => [section.id, section]),
    ),
    topLevelSections: {},
    viewport: null,
    parentSectionMap,
  };
}

describe("setSelfParentSiblingChildrenWidths", () => {
  it("updates only the resized leaf when it has no group ancestry to climb", () => {
    const state = makeState(
      [
        makeSection("group", { kind: "group", children: ["leaf-a", "leaf-b"] }),
        makeSection("leaf-a"),
        makeSection("leaf-b"),
      ],
      { "leaf-a": "group", "leaf-b": "group" },
    );

    const { updatedSectionSizes } = setSelfParentSiblingChildrenWidths(
      state,
      "leaf-a",
      {
        width: 240,
      },
    );

    // The reference's predicate walk stops immediately for a leaf: only itself updates.
    expect(updatedSectionSizes).toEqual({
      "leaf-a": { width: 240, height: 50 },
    });
  });

  it("climbs vertical group ancestry and writes the width across the whole subtree", () => {
    const state = makeState(
      [
        makeSection("outer", {
          kind: "group",
          children: ["inner", "outer-leaf"],
        }),
        makeSection("inner", { kind: "group", children: ["inner-leaf"] }),
        makeSection("outer-leaf"),
        makeSection("inner-leaf"),
      ],
      { inner: "outer", "outer-leaf": "outer", "inner-leaf": "inner" },
    );

    const { updatedSectionSizes, sections } =
      setSelfParentSiblingChildrenWidths(state, "inner", {
        width: 300,
      });

    expect(Object.keys(updatedSectionSizes).sort()).toEqual([
      "inner",
      "inner-leaf",
      "outer",
      "outer-leaf",
    ]);
    expect(sections["outer"]?.size.width).toBe(300);
    expect(sections["outer-leaf"]?.size.width).toBe(300);
    expect(sections["inner-leaf"]?.size.width).toBe(300);
  });

  it("stops the climb at a horizontal group", () => {
    const state = makeState(
      [
        makeSection("outer", { kind: "group", children: ["inner"] }),
        makeSection("inner", {
          kind: "group",
          isHorizontalOrientation: true,
          children: ["inner-leaf"],
        }),
        makeSection("inner-leaf"),
      ],
      { inner: "outer", "inner-leaf": "inner" },
    );

    const { updatedSectionSizes } = setSelfParentSiblingChildrenWidths(
      state,
      "inner",
      {
        width: 300,
      },
    );

    // A horizontal group does not climb to its parent; its own subtree still updates.
    expect(Object.keys(updatedSectionSizes).sort()).toEqual([
      "inner",
      "inner-leaf",
    ]);
  });

  it("does not propagate height changes", () => {
    const state = makeState(
      [
        makeSection("group", { kind: "group", children: ["leaf-a"] }),
        makeSection("leaf-a"),
      ],
      { "leaf-a": "group" },
    );

    const { updatedSectionSizes } = setSelfParentSiblingChildrenWidths(
      state,
      "group",
      {
        height: 400,
      },
    );

    expect(updatedSectionSizes).toEqual({ group: { width: 100, height: 400 } });
  });
});

describe("getResizeStartAutoSizeUpdate", () => {
  it("promotes auto dimensions affected by the drag direction to measured pixels", () => {
    expect(
      getResizeStartAutoSizeUpdate({
        size: { width: "auto", height: "auto" },
        direction: "bottomRight",
        rect: { width: 200.4, height: 99.6 },
      }),
    ).toEqual({ width: 200, height: 100 });

    expect(
      getResizeStartAutoSizeUpdate({
        size: { width: "auto", height: "auto" },
        direction: "right",
        rect: { width: 200, height: 100 },
      }),
    ).toEqual({ width: 200 });
  });

  it("returns null when no affected dimension is auto", () => {
    expect(
      getResizeStartAutoSizeUpdate({
        size: { width: 100, height: 50 },
        direction: "bottomRight",
        rect: { width: 200, height: 100 },
      }),
    ).toBeNull();
    expect(
      getResizeStartAutoSizeUpdate({
        size: { width: "auto", height: 50 },
        direction: "bottom",
        rect: { width: 200, height: 100 },
      }),
    ).toBeNull();
  });
});

describe("isHeightResizeDirection", () => {
  it("classifies the bottom-affecting directions", () => {
    expect(isHeightResizeDirection("bottom")).toBe(true);
    expect(isHeightResizeDirection("bottomRight")).toBe(true);
    expect(isHeightResizeDirection("right")).toBe(false);
  });
});
