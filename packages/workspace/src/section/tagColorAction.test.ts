import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkspaceCapabilities } from "../document/capabilities";
import { setWorkspaceDocumentChangeCallback } from "../document/documentChangeCallback";
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
  loadWorkspaceDocument({
    sections: { leaf: makeSection("leaf", overrides) },
    topLevelSections: { leaf: { x: 0, y: 0, w: 240, h: 120, zIndex: 0 } },
    viewport: { x: 0, y: 0, zoom: 1 },
    activeIds: ["leaf"],
  });
}

describe("setSectionTagColor", () => {
  beforeEach(() => {
    registerSectionKinds({ leaf: { renderContent: () => null } });
    useWorkspaceCapabilities.getState().reset();
    loadTagColorDocument();
  });

  afterEach(() => {
    setWorkspaceDocumentChangeCallback(null);
    registerSectionKinds({});
    useWorkspaceCapabilities.getState().reset();
    useWorkspaceDocument.getState().reset();
    useNodeInternals.getState().reset();
    useActiveSections.getState().reset();
  });

  it("sets and clears the canonical color through one notification per change", () => {
    const onChange = vi.fn();
    setWorkspaceDocumentChangeCallback(onChange);

    setSectionTagColor("leaf", " A1B2C3 ");

    expect(useWorkspaceDocument.getState().sections["leaf"]?.tagColor).toBe(
      "#a1b2c3",
    );
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange.mock.calls[0]?.[0].sections["leaf"]?.tagColor).toBe(
      "#a1b2c3",
    );

    setSectionTagColor("leaf", null);

    expect(
      useWorkspaceDocument.getState().sections["leaf"]?.tagColor,
    ).toBeNull();
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("does not publish when the requested color is already current", () => {
    loadTagColorDocument({ tagColor: "#3b82f6" });
    const onChange = vi.fn();
    setWorkspaceDocumentChangeCallback(onChange);

    setSectionTagColor("leaf", "3B82F6");

    expect(onChange).not.toHaveBeenCalled();
  });

  it("rejects malformed, missing, locked, and capability-disabled requests before writing", () => {
    const onChange = vi.fn();
    setWorkspaceDocumentChangeCallback(onChange);
    const originalSections = useWorkspaceDocument.getState().sections;

    expect(() => setSectionTagColor("leaf", "blue")).toThrow(
      /six-digit hex color/,
    );
    expect(() => setSectionTagColor("missing", "#123456")).toThrow(
      /Unknown section missing/,
    );

    loadTagColorDocument({ positionAndSizeLocked: true });
    expect(() => setSectionTagColor("leaf", "#123456")).toThrow(/locked/);

    loadTagColorDocument();
    useWorkspaceCapabilities.setState({ canEditLayout: false });
    expect(() => setSectionTagColor("leaf", "#123456")).toThrow(
      /permission to edit workspace layout/,
    );

    expect(onChange).not.toHaveBeenCalled();
    expect(originalSections["leaf"]?.tagColor).toBeNull();
    expect(
      useWorkspaceDocument.getState().sections["leaf"]?.tagColor,
    ).toBeNull();
  });
});
