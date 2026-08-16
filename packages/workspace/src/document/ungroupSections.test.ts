import { describe, expect, it } from "vitest";
import type { WorkspaceDocumentState } from "./stores";
import type { WorkspaceSection } from "./types";
import {
  canUngroupWorkspaceSections,
  prepareUngroupSections,
} from "./ungroupSections";

function makeSection(
  id: string,
  kind = "leaf",
  children: Array<string> = [],
  positionAndSizeLocked = false,
): WorkspaceSection {
  return {
    id,
    kind,
    name: id,
    size: { width: 120, height: 80 },
    isMinimized: false,
    positionAndSizeLocked,
    isHorizontalOrientation: false,
    styleColor: null,
    overflowMode: false,
    tagColor: null,
    children,
  };
}

function makeState(): WorkspaceDocumentState {
  return {
    sections: {
      standalone: makeSection("standalone"),
      "top-group": makeSection("top-group", "group", ["top-a", "top-b"]),
      "top-a": makeSection("top-a"),
      "top-b": makeSection("top-b"),
      parent: makeSection("parent", "group", ["nested-group", "sibling"]),
      "nested-group": makeSection("nested-group", "group", [
        "nested-a",
        "nested-b",
      ]),
      "nested-a": makeSection("nested-a"),
      "nested-b": makeSection("nested-b"),
      sibling: makeSection("sibling"),
      "locked-group": makeSection("locked-group", "group", [], true),
    },
    topLevelSections: {
      "top-group": { x: 400, y: 60, w: 300, h: 240, zIndex: 2 },
      standalone: { x: 40, y: 20, w: 120, h: 80, zIndex: 1 },
      parent: { x: 700, y: 80, w: null, h: null, zIndex: 3 },
      "locked-group": { x: 900, y: 80, w: null, h: null, zIndex: 4 },
    },
    viewport: { x: 0, y: 0, zoom: 1 },
    parentSectionMap: {
      "top-a": "top-group",
      "top-b": "top-group",
      "nested-group": "parent",
      sibling: "parent",
      "nested-a": "nested-group",
      "nested-b": "nested-group",
    },
  };
}

function requireSection(
  state: WorkspaceDocumentState,
  sectionId: string,
): WorkspaceSection {
  const section = state.sections[sectionId];
  if (!section) {
    throw new Error(`Expected section ${sectionId}.`);
  }
  return section;
}

const noPromotedSectionMeasurement = () => null;

describe("prepareUngroupSections", () => {
  it("promotes top-level children with reference placement and restores nested sibling order", () => {
    const state = makeState();
    const prepared = prepareUngroupSections(
      state,
      { activeIds: ["top-group", "nested-group", "standalone"] },
      ["top-group", "nested-group"],
      noPromotedSectionMeasurement,
    );

    expect(prepared.document.sections["top-group"]).toBeUndefined();
    expect(prepared.document.sections["nested-group"]).toBeUndefined();
    expect(prepared.document.sections["parent"]?.children).toEqual([
      "nested-a",
      "nested-b",
      "sibling",
    ]);
    expect(prepared.document.parentSectionMap["nested-a"]).toBe("parent");
    expect(prepared.document.parentSectionMap["top-a"]).toBeUndefined();
    expect(prepared.document.topLevelSections["top-a"]).toEqual({
      x: 400,
      y: 60,
      w: null,
      h: null,
      zIndex: 5,
    });
    expect(prepared.document.topLevelSections["top-b"]?.zIndex).toBe(6);
    expect(Object.keys(prepared.document.topLevelSections)).toEqual([
      "standalone",
      "parent",
      "locked-group",
      "top-a",
      "top-b",
    ]);
    expect(prepared.activeSections.activeIds).toEqual(["standalone"]);
    expect(prepared.focusTargetByGroupId.get("top-group")).toBe("top-a");
    expect(prepared.focusTargetByGroupId.get("nested-group")).toBe("nested-a");

    expect(state.sections["top-group"]?.children).toEqual(["top-a", "top-b"]);
    expect(state.sections["parent"]?.children).toEqual([
      "nested-group",
      "sibling",
    ]);
  });

  it("records validated mounted sizes for promoted top-level children", () => {
    const state = makeState();
    const resolvedIds: Array<string> = [];
    const prepared = prepareUngroupSections(
      state,
      { activeIds: [] },
      ["top-group"],
      (sectionId) => {
        resolvedIds.push(sectionId);
        return sectionId === "top-a"
          ? { width: 120.4, height: 80.4 }
          : { width: 140.6, height: 90.6 };
      },
    );

    expect(resolvedIds).toEqual(["top-a", "top-b"]);
    expect(prepared.document.topLevelSections["top-a"]).toEqual({
      x: 400,
      y: 60,
      w: 120,
      h: 80,
      zIndex: 5,
    });
    expect(prepared.document.topLevelSections["top-b"]).toEqual({
      x: 400,
      y: 60,
      w: 141,
      h: 91,
      zIndex: 6,
    });
    expect(() =>
      prepareUngroupSections(state, { activeIds: [] }, ["top-group"], () => ({
        width: 0,
        height: 80,
      })),
    ).toThrow(
      "Promoted section top-a measurement must have positive finite dimensions.",
    );
  });

  it("flattens selected ancestor and descendant groups in document order", () => {
    const state = makeState();
    state.sections["top-group"] = makeSection("top-group", "group", [
      "top-a",
      "inner-group",
      "top-b",
    ]);
    state.sections["inner-group"] = makeSection("inner-group", "group", [
      "inner-a",
      "inner-b",
    ]);
    state.sections["inner-a"] = makeSection("inner-a");
    state.sections["inner-b"] = makeSection("inner-b");
    state.parentSectionMap["inner-group"] = "top-group";
    state.parentSectionMap["inner-a"] = "inner-group";
    state.parentSectionMap["inner-b"] = "inner-group";

    const prepared = prepareUngroupSections(
      state,
      { activeIds: ["inner-group", "top-group"] },
      ["inner-group", "top-group"],
      noPromotedSectionMeasurement,
    );

    expect(Object.keys(prepared.document.topLevelSections).slice(-4)).toEqual([
      "top-a",
      "inner-a",
      "inner-b",
      "top-b",
    ]);
    expect(prepared.document.sections["inner-group"]).toBeUndefined();
    expect(prepared.document.parentSectionMap["inner-a"]).toBeUndefined();
  });

  it("rejects mixed, locked, missing, and structurally impossible requests before a result", () => {
    const state = makeState();
    const snapshot = structuredClone(state);

    expect(() =>
      prepareUngroupSections(
        state,
        { activeIds: [] },
        ["top-group", "standalone"],
        noPromotedSectionMeasurement,
      ),
    ).toThrow("Cannot ungroup non-group section standalone.");
    expect(() =>
      prepareUngroupSections(
        state,
        { activeIds: [] },
        ["top-group", "locked-group"],
        noPromotedSectionMeasurement,
      ),
    ).toThrow("Cannot ungroup locked group locked-group.");
    expect(() =>
      prepareUngroupSections(
        state,
        { activeIds: [] },
        ["missing"],
        noPromotedSectionMeasurement,
      ),
    ).toThrow("Unknown section missing.");

    const impossible = makeState();
    delete impossible.topLevelSections["top-group"];
    expect(() =>
      prepareUngroupSections(
        impossible,
        { activeIds: [] },
        ["top-group"],
        noPromotedSectionMeasurement,
      ),
    ).toThrow("Top-level group top-group is missing its layout.");
    expect(state).toEqual(snapshot);
  });

  it("reports applicability only when every selected section is an unlocked valid group", () => {
    const state = makeState();
    expect(
      canUngroupWorkspaceSections(state, [
        requireSection(state, "top-group"),
        requireSection(state, "nested-group"),
      ]),
    ).toBe(true);
    expect(
      canUngroupWorkspaceSections(state, [
        requireSection(state, "top-group"),
        requireSection(state, "standalone"),
      ]),
    ).toBe(false);
    expect(
      canUngroupWorkspaceSections(state, [
        requireSection(state, "locked-group"),
      ]),
    ).toBe(false);
  });
});
