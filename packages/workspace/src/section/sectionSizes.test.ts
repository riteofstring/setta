import { describe, expect, it } from "vitest";
import type { WorkspaceDocumentState } from "../document/stores";
import type { WorkspaceSection } from "../document/types";
import {
  getResizeStartAutoSizeUpdate,
  isHeightResizeDirection,
  setSelfParentSiblingChildrenWidths,
} from "./sectionSizes";

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
    savedViews: null,
  };
}

describe("setSelfParentSiblingChildrenWidths", () => {
  it("shares a child's width with its vertical parent and siblings while preserving their heights", () => {
    const state = makeState(
      [
        makeSection("group", { kind: "group", children: ["leaf-a", "leaf-b"] }),
        makeSection("leaf-a"),
        makeSection("leaf-b", { size: { width: 100, height: 90 } }),
        makeSection("unrelated"),
      ],
      { "leaf-a": "group", "leaf-b": "group" },
    );

    const { sections, updatedSectionSizes } =
      setSelfParentSiblingChildrenWidths(state, "leaf-a", {
        width: 240,
        height: 160,
      });

    expect(updatedSectionSizes).toEqual({
      group: { width: 240, height: 50 },
      "leaf-a": { width: 240, height: 160 },
      "leaf-b": { width: 240, height: 90 },
    });
    expect(sections["unrelated"]?.size).toEqual({ width: 100, height: 50 });
  });

  it.each(["group", "app.list"])(
    "shares a nested child's width through %s ancestors",
    (kind) => {
      const state = makeState(
        [
          makeSection("outer", {
            kind,
            children: ["inner", "outer-leaf"],
          }),
          makeSection("inner", { kind, children: ["inner-leaf"] }),
          makeSection("outer-leaf"),
          makeSection("inner-leaf"),
        ],
        { inner: "outer", "outer-leaf": "outer", "inner-leaf": "inner" },
      );

      const { updatedSectionSizes, sections } =
        setSelfParentSiblingChildrenWidths(state, "inner-leaf", {
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
    },
  );

  it("stops at a horizontal parent and leaves the other columns unchanged", () => {
    const state = makeState(
      [
        makeSection("outer", {
          kind: "group",
          isHorizontalOrientation: true,
          children: ["inner", "outer-leaf"],
        }),
        makeSection("inner", {
          kind: "group",
          children: ["inner-leaf"],
        }),
        makeSection("inner-leaf"),
        makeSection("outer-leaf"),
      ],
      { inner: "outer", "inner-leaf": "inner", "outer-leaf": "outer" },
    );

    const { sections, updatedSectionSizes } =
      setSelfParentSiblingChildrenWidths(state, "inner-leaf", {
        width: 300,
      });

    expect(Object.keys(updatedSectionSizes).sort()).toEqual([
      "inner",
      "inner-leaf",
    ]);
    expect(sections["outer"]?.size.width).toBe(100);
    expect(sections["outer-leaf"]?.size.width).toBe(100);
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
      "leaf-a",
      {
        height: 400,
      },
    );

    expect(updatedSectionSizes).toEqual({
      "leaf-a": { width: 100, height: 400 },
    });
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
