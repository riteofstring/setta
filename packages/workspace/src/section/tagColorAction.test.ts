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
import type { WorkspaceSectionInput } from "../document/types";
import { setSectionTagColor } from "./tagColorAction";

function makeSection(
  id: string,
  overrides: Partial<WorkspaceSectionInput> = {},
): WorkspaceSectionInput {
  return {
    id,
    kind: "leaf",
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

function loadTagColorDocument(
  overrides: Partial<WorkspaceSectionInput> = {},
): void {
  loadWorkspaceDocument(testWorkspace.host, {
    sections: { leaf: makeSection("leaf", overrides) },
    topLevelSections: { leaf: { x: 0, y: 0, w: 240, h: 120, zIndex: 0 } },
    viewport: { x: 0, y: 0, zoom: 1 },
    activeIds: ["leaf"],
    savedViews: null,
  });
}

describe("setSectionTagColor", () => {
  beforeEach(() => {
    registerSectionKinds(testWorkspace.host, {
      leaf: { renderContent: () => null },
    });
    testWorkspace.capabilities.getState().reset();
    loadTagColorDocument();
  });

  afterEach(() => {
    registerSectionKinds(testWorkspace.host, {});
    testWorkspace.capabilities.getState().reset();
    testWorkspace.document.getState().reset();
    testWorkspace.nodeInternals.getState().reset();
    testWorkspace.activeSections.getState().reset();
  });

  it("sets and clears the canonical color through one notification per change", () => {
    const onChange = vi.fn();
    testWorkspace.host.subscribe(onChange);

    setSectionTagColor(testWorkspace.host, "leaf", " A1B2C3 ");

    expect(testWorkspace.document.getState().sections["leaf"]?.tagColor).toBe(
      "#a1b2c3",
    );
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange.mock.calls[0]?.[0].sections["leaf"]?.tagColor).toBe(
      "#a1b2c3",
    );

    setSectionTagColor(testWorkspace.host, "leaf", null);

    expect(
      testWorkspace.document.getState().sections["leaf"]?.tagColor,
    ).toBeNull();
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("does not publish when the requested color is already current", () => {
    loadTagColorDocument({ tagColor: "#3b82f6" });
    const onChange = vi.fn();
    testWorkspace.host.subscribe(onChange);

    setSectionTagColor(testWorkspace.host, "leaf", "3B82F6");

    expect(onChange).not.toHaveBeenCalled();
  });

  it("rejects malformed, missing, locked, and capability-disabled requests before writing", () => {
    const onChange = vi.fn();
    testWorkspace.host.subscribe(onChange);
    const originalSections = testWorkspace.document.getState().sections;

    expect(() =>
      setSectionTagColor(testWorkspace.host, "leaf", "blue"),
    ).toThrow(/six-digit hex color/);
    expect(() =>
      setSectionTagColor(testWorkspace.host, "missing", "#123456"),
    ).toThrow(/Unknown section missing/);

    loadTagColorDocument({ positionAndSizeLocked: true });
    onChange.mockClear();
    expect(() =>
      setSectionTagColor(testWorkspace.host, "leaf", "#123456"),
    ).toThrow(/locked/);

    loadTagColorDocument();
    onChange.mockClear();
    testWorkspace.capabilities.setState({ canEditLayout: false });
    expect(() =>
      setSectionTagColor(testWorkspace.host, "leaf", "#123456"),
    ).toThrow(/permission to edit workspace layout/);

    expect(onChange).not.toHaveBeenCalled();
    expect(originalSections["leaf"]?.tagColor).toBeNull();
    expect(
      testWorkspace.document.getState().sections["leaf"]?.tagColor,
    ).toBeNull();
  });
});
