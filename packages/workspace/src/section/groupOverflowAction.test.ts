/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkspaceCapabilities } from "../document/capabilities";
import { setWorkspaceDocumentChangeCallback } from "../document/documentChangeCallback";
import { loadWorkspaceDocument } from "../document/loadWorkspaceDocument";
import { registerSectionKinds } from "../document/sectionKindRegistry";
import { useActiveSections, useNodeInternals, useWorkspaceDocument } from "../document/stores";
import type { WorkspaceDocument, WorkspaceSectionInput } from "../document/types";
import { getBoundedGroupSize, setGroupOverflowMode } from "./groupOverflowAction";
import { useSectionRefs } from "./sectionRefs";

function makeSection(
  id: string,
  kind = "leaf",
  overrides: Partial<WorkspaceSectionInput> = {},
): WorkspaceSectionInput {
  return {
    id,
    kind,
    name: id,
    size: { width: 240, height: 120 },
    overflowMode: false,
    isMinimized: false,
    positionAndSizeLocked: false,
    isHorizontalOrientation: false,
    styleColor: null,
    tagColor: null,
    children: [],
    ...overrides,
  };
}

function loadTestDocument(groupOverrides: Partial<WorkspaceSectionInput> = {}): void {
  loadWorkspaceDocument({
    sections: {
      group: makeSection("group", "group", {
        size: { width: "auto", height: "auto" },
        children: ["nested"],
        ...groupOverrides,
      }),
      nested: makeSection("nested"),
      leaf: makeSection("leaf"),
    },
    topLevelSections: {
      group: { x: 20, y: 30, w: null, h: null, zIndex: 0 },
      leaf: { x: 400, y: 30, w: 240, h: 120, zIndex: 1 },
    },
    viewport: { x: 0, y: 0, zoom: 1 },
    activeIds: ["group"],
  });
}

function registerMeasuredGroup(width: number, height: number): HTMLElement {
  const element = document.createElement("div");
  element.getBoundingClientRect = () =>
    ({ width, height, left: 0, top: 0, right: width, bottom: height }) as DOMRect;
  useSectionRefs.setState({ withNested: { group: element } });
  return element;
}

describe("getBoundedGroupSize", () => {
  it("promotes only auto dimensions from the rounded outer group rectangle", () => {
    expect(
      getBoundedGroupSize("group", { width: "auto", height: 180 }, { width: 321.6, height: 900 }),
    ).toEqual({ width: 322, height: 180 });
    expect(
      getBoundedGroupSize(
        "group",
        { width: "auto", height: "auto" },
        { width: 321.4, height: 179.6 },
      ),
    ).toEqual({ width: 321, height: 180 });
    expect(getBoundedGroupSize("group", { width: 320, height: 180 }, null)).toBeNull();
  });

  it("rejects an unavailable or empty measurement for an auto dimension", () => {
    expect(() => getBoundedGroupSize("group", { width: "auto", height: 180 }, null)).toThrow(
      /before its auto-sized surface is mounted/,
    );
    expect(() =>
      getBoundedGroupSize("group", { width: 320, height: "auto" }, { width: 320, height: 0 }),
    ).toThrow(/unmeasured group group/);
    expect(() =>
      getBoundedGroupSize(
        "group",
        { width: "auto", height: 180 },
        { width: Number.NaN, height: 180 },
      ),
    ).toThrow(/unmeasured group group/);
  });
});

describe("setGroupOverflowMode", () => {
  beforeEach(() => {
    registerSectionKinds({ leaf: { renderContent: () => null } });
    loadTestDocument();
    useSectionRefs.getState().reset();
    useWorkspaceCapabilities.getState().reset();
  });

  afterEach(() => {
    setWorkspaceDocumentChangeCallback(null);
    registerSectionKinds({});
    useSectionRefs.getState().reset();
    useWorkspaceCapabilities.getState().reset();
    useWorkspaceDocument.getState().reset();
    useNodeInternals.getState().reset();
    useActiveSections.getState().reset();
  });

  it("atomically enables bounded overflow, preserves visible size, and reports once", () => {
    registerMeasuredGroup(368.4, 241.7);
    const nodes = new Map(useNodeInternals.getState().x);
    const groupNode = nodes.get("group");
    if (!groupNode) {
      throw new Error("The test group node is unavailable.");
    }
    nodes.set("group", { ...groupNode, width: 368, height: 242 });
    useNodeInternals.setState({ x: nodes });
    const reported: Array<WorkspaceDocument> = [];
    setWorkspaceDocumentChangeCallback((document) => reported.push(document));
    const observed: Array<{ overflowMode: boolean; size: unknown }> = [];
    const unsubscribe = useWorkspaceDocument.subscribe((state) => {
      const group = state.sections["group"];
      if (group) {
        observed.push({ overflowMode: group.overflowMode, size: group.size });
      }
    });

    try {
      setGroupOverflowMode("group", true);
    } finally {
      unsubscribe();
    }

    expect(observed).toEqual([{ overflowMode: true, size: { width: 368, height: 242 } }]);
    expect(reported).toHaveLength(1);
    expect(reported[0]?.sections["group"]).toMatchObject({
      overflowMode: true,
      size: { width: 368, height: 242 },
    });
    expect(reported[0]?.activeIds).toEqual(["group"]);
    // The minimap continues to use the already-matching measured node bounds until the canvas's
    // resize observer confirms the fixed DOM geometry; the document action never clears them.
    expect(useNodeInternals.getState().x.get("group")).toMatchObject({
      width: 368,
      height: 242,
    });
  });

  it("keeps authored bounds when disabling and re-enabling a numeric group", () => {
    loadTestDocument({
      overflowMode: true,
      size: { width: 360, height: 220 },
    });
    const measurement = vi.fn(() => ({ width: 999, height: 999 }) as DOMRect);
    const element = document.createElement("div");
    element.getBoundingClientRect = measurement;
    useSectionRefs.setState({ withNested: { group: element } });
    const onDocumentChange = vi.fn();
    setWorkspaceDocumentChangeCallback(onDocumentChange);

    setGroupOverflowMode("group", false);
    setGroupOverflowMode("group", true);

    expect(useWorkspaceDocument.getState().sections["group"]).toMatchObject({
      overflowMode: true,
      size: { width: 360, height: 220 },
    });
    expect(measurement).not.toHaveBeenCalled();
    expect(onDocumentChange).toHaveBeenCalledTimes(2);
  });

  it("does not publish when the requested mode is already current", () => {
    const onDocumentChange = vi.fn();
    setWorkspaceDocumentChangeCallback(onDocumentChange);

    setGroupOverflowMode("group", false);

    expect(onDocumentChange).not.toHaveBeenCalled();
  });

  it("rejects invalid, locked, unmounted, and capability-disabled requests before writing", () => {
    const onDocumentChange = vi.fn();
    setWorkspaceDocumentChangeCallback(onDocumentChange);
    const originalSections = useWorkspaceDocument.getState().sections;

    expect(() => setGroupOverflowMode("group", "bounded" as never)).toThrow(/must be a boolean/);
    expect(() => setGroupOverflowMode("leaf", true)).toThrow(/is not a group/);
    expect(() => setGroupOverflowMode("missing", true)).toThrow(/Unknown section missing/);
    expect(() => setGroupOverflowMode("group", true)).toThrow(/before its auto-sized surface/);

    loadTestDocument({ positionAndSizeLocked: true });
    expect(() => setGroupOverflowMode("group", true)).toThrow(/is locked/);

    loadTestDocument();
    useWorkspaceCapabilities.setState({ canEditLayout: false });
    expect(() => setGroupOverflowMode("group", true)).toThrow(
      /permission to edit workspace layout/,
    );

    expect(onDocumentChange).not.toHaveBeenCalled();
    expect(originalSections["group"]?.overflowMode).toBe(false);
    expect(useWorkspaceDocument.getState().sections["group"]?.overflowMode).toBe(false);
  });
});
