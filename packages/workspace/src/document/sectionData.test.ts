import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setWorkspaceDocumentChangeCallback } from "./documentChangeCallback";
import { loadWorkspaceDocument } from "./loadWorkspaceDocument";
import { setSectionData } from "./sectionData";
import { registerSectionKinds } from "./sectionKindRegistry";
import { useActiveSections, useNodeInternals, useWorkspaceDocument } from "./stores";

function loadTestDocument() {
  registerSectionKinds({ leaf: { renderContent: () => null } });
  loadWorkspaceDocument({
    sections: {
      panel: {
        id: "panel",
        kind: "leaf",
        name: "Panel",
        size: { width: 200, height: 100 },
        isMinimized: false,
        positionAndSizeLocked: false,
        isHorizontalOrientation: false,
        styleColor: null,
        overflowMode: false,
        tagColor: null,
        children: [],
        data: { control: "text", value: "before" },
      },
    },
    topLevelSections: { panel: { x: 0, y: 0, w: 200, h: 100, zIndex: 0 } },
    viewport: { x: 0, y: 0, zoom: 1 },
    activeIds: [],
  });
}

describe("setSectionData", () => {
  beforeEach(loadTestDocument);

  afterEach(() => {
    setWorkspaceDocumentChangeCallback(null);
    registerSectionKinds({});
    useWorkspaceDocument.getState().reset();
    useNodeInternals.getState().reset();
    useActiveSections.getState().reset();
  });

  it("replaces opaque section data and notifies the host once", () => {
    const onDocumentChange = vi.fn();
    setWorkspaceDocumentChangeCallback(onDocumentChange);
    setSectionData("panel", { control: "text", value: "after" });

    const panel = useWorkspaceDocument.getState().sections["panel"];
    expect(panel?.data).toEqual({ control: "text", value: "after" });
    expect(panel?.name).toBe("Panel");
    expect(onDocumentChange).toHaveBeenCalledTimes(1);
  });

  it("fails loudly for an unknown section", () => {
    expect(() => setSectionData("missing", {})).toThrowError("Unknown section missing.");
  });
});
