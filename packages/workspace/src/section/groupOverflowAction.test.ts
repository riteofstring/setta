/* @vitest-environment jsdom */
import {
  afterEach as afterEachWorkspaceTestHost,
  beforeEach as beforeEachWorkspaceTestHost,
} from "vitest";
import {
  createWorkspaceTestHost,
  type WorkspaceTestHost,
} from "../../test/workspaceTestHost";

let testWorkspace: WorkspaceTestHost;
beforeEachWorkspaceTestHost(() => {
  testWorkspace = createWorkspaceTestHost();
});
afterEachWorkspaceTestHost(() => {
  testWorkspace.host.dispose();
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkspaceCapabilities } from "../document/capabilities";
import { loadWorkspaceDocument } from "../document/loadWorkspaceDocument";
import { registerSectionKinds } from "../document/sectionKindRegistry";
import {
  useActiveSections,
  useNodeInternals,
  useWorkspaceDocument,
} from "../document/stores";
import type {
  WorkspaceDocument,
  WorkspaceSectionInput,
} from "../document/types";
import {
  getBoundedGroupSize,
  setGroupOverflowMode,
} from "./groupOverflowAction";
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

function loadTestDocument(
  groupOverrides: Partial<WorkspaceSectionInput> = {},
): void {
  loadWorkspaceDocument(testWorkspace.host, {
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
    ({
      width,
      height,
      left: 0,
      top: 0,
      right: width,
      bottom: height,
    }) as DOMRect;
  testWorkspace.sectionRefs.setState({ withNested: { group: element } });
  return element;
}

describe("getBoundedGroupSize", () => {
  it("promotes only auto dimensions from the rounded outer group rectangle", () => {
    expect(
      getBoundedGroupSize(
        "group",
        { width: "auto", height: 180 },
        { width: 321.6, height: 900 },
      ),
    ).toEqual({ width: 322, height: 180 });
    expect(
      getBoundedGroupSize(
        "group",
        { width: "auto", height: "auto" },
        { width: 321.4, height: 179.6 },
      ),
    ).toEqual({ width: 321, height: 180 });
    expect(
      getBoundedGroupSize("group", { width: 320, height: 180 }, null),
    ).toBeNull();
  });

  it("rejects an unavailable or empty measurement for an auto dimension", () => {
    expect(() =>
      getBoundedGroupSize("group", { width: "auto", height: 180 }, null),
    ).toThrow(/before its auto-sized surface is mounted/);
    expect(() =>
      getBoundedGroupSize(
        "group",
        { width: 320, height: "auto" },
        { width: 320, height: 0 },
      ),
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
    registerSectionKinds(testWorkspace.host, {
      leaf: { renderContent: () => null },
    });
    loadTestDocument();
    testWorkspace.sectionRefs.getState().reset();
    testWorkspace.capabilities.getState().reset();
  });

  afterEach(() => {
    registerSectionKinds(testWorkspace.host, {});
    testWorkspace.sectionRefs.getState().reset();
    testWorkspace.capabilities.getState().reset();
    testWorkspace.document.getState().reset();
    testWorkspace.nodeInternals.getState().reset();
    testWorkspace.activeSections.getState().reset();
  });

  it("atomically enables bounded overflow, preserves visible size, and reports once", () => {
    registerMeasuredGroup(368.4, 241.7);
    const nodes = new Map(testWorkspace.nodeInternals.getState().x);
    const groupNode = nodes.get("group");
    if (!groupNode) {
      throw new Error("The test group node is unavailable.");
    }
    nodes.set("group", { ...groupNode, width: 368, height: 242 });
    testWorkspace.nodeInternals.setState({ x: nodes });
    const reported: Array<WorkspaceDocument> = [];
    testWorkspace.host.subscribe((document) => reported.push(document));
    const observed: Array<{ overflowMode: boolean; size: unknown }> = [];
    const unsubscribe = testWorkspace.document.subscribe((state) => {
      const group = state.sections["group"];
      if (group) {
        observed.push({ overflowMode: group.overflowMode, size: group.size });
      }
    });

    try {
      setGroupOverflowMode(testWorkspace.host, "group", true);
    } finally {
      unsubscribe();
    }

    expect(observed).toEqual([
      { overflowMode: true, size: { width: 368, height: 242 } },
    ]);
    expect(reported).toHaveLength(1);
    expect(reported[0]?.sections["group"]).toMatchObject({
      overflowMode: true,
      size: { width: 368, height: 242 },
    });
    expect(reported[0]?.activeIds).toEqual(["group"]);

    expect(testWorkspace.nodeInternals.getState().x.get("group")).toMatchObject(
      {
        width: 368,
        height: 242,
      },
    );
  });

  it("keeps authored bounds when disabling and re-enabling a numeric group", () => {
    loadTestDocument({
      overflowMode: true,
      size: { width: 360, height: 220 },
    });
    const measurement = vi.fn(() => ({ width: 999, height: 999 }) as DOMRect);
    const element = document.createElement("div");
    element.getBoundingClientRect = measurement;
    testWorkspace.sectionRefs.setState({ withNested: { group: element } });
    const onDocumentChange = vi.fn();
    testWorkspace.host.subscribe(onDocumentChange);

    setGroupOverflowMode(testWorkspace.host, "group", false);
    setGroupOverflowMode(testWorkspace.host, "group", true);

    expect(testWorkspace.document.getState().sections["group"]).toMatchObject({
      overflowMode: true,
      size: { width: 360, height: 220 },
    });
    expect(measurement).not.toHaveBeenCalled();
    expect(onDocumentChange).toHaveBeenCalledTimes(2);
  });

  it("does not publish when the requested mode is already current", () => {
    const onDocumentChange = vi.fn();
    testWorkspace.host.subscribe(onDocumentChange);

    setGroupOverflowMode(testWorkspace.host, "group", false);

    expect(onDocumentChange).not.toHaveBeenCalled();
  });

  it("rejects invalid, locked, unmounted, and capability-disabled requests before writing", () => {
    const onDocumentChange = vi.fn();
    testWorkspace.host.subscribe(onDocumentChange);
    const originalSections = testWorkspace.document.getState().sections;

    expect(() =>
      setGroupOverflowMode(testWorkspace.host, "group", "bounded" as never),
    ).toThrow(/must be a boolean/);
    expect(() =>
      setGroupOverflowMode(testWorkspace.host, "leaf", true),
    ).toThrow(/is not a group/);
    expect(() =>
      setGroupOverflowMode(testWorkspace.host, "missing", true),
    ).toThrow(/Unknown section missing/);
    expect(() =>
      setGroupOverflowMode(testWorkspace.host, "group", true),
    ).toThrow(/before its auto-sized surface/);

    loadTestDocument({ positionAndSizeLocked: true });
    onDocumentChange.mockClear();
    expect(() =>
      setGroupOverflowMode(testWorkspace.host, "group", true),
    ).toThrow(/is locked/);

    loadTestDocument();
    onDocumentChange.mockClear();
    testWorkspace.capabilities.setState({ canEditLayout: false });
    expect(() =>
      setGroupOverflowMode(testWorkspace.host, "group", true),
    ).toThrow(/permission to edit workspace layout/);

    expect(onDocumentChange).not.toHaveBeenCalled();
    expect(originalSections["group"]?.overflowMode).toBe(false);
    expect(
      testWorkspace.document.getState().sections["group"]?.overflowMode,
    ).toBe(false);
  });
});
