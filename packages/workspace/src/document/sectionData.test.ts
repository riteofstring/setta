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
import { loadWorkspaceDocument } from "./loadWorkspaceDocument";
import { setSectionData } from "./sectionData";
import { registerSectionKinds } from "./sectionKindRegistry";
import {
  useActiveSections,
  useNodeInternals,
  useWorkspaceDocument,
} from "./stores";

function loadTestDocument() {
  registerSectionKinds(testWorkspace.host, { leaf: { renderContent: () => null } });
  loadWorkspaceDocument(testWorkspace.host, {
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
    registerSectionKinds(testWorkspace.host, {});
    testWorkspace.document.getState().reset();
    testWorkspace.nodeInternals.getState().reset();
    testWorkspace.activeSections.getState().reset();
  });

  it("replaces opaque section data and notifies the host once", () => {
    const onDocumentChange = vi.fn();
    testWorkspace.host.subscribe(onDocumentChange);
    setSectionData(testWorkspace.host, "panel", { control: "text", value: "after" });

    const panel = testWorkspace.document.getState().sections["panel"];
    expect(panel?.data).toEqual({ control: "text", value: "after" });
    expect(panel?.name).toBe("Panel");
    expect(onDocumentChange).toHaveBeenCalledTimes(1);
  });

  it("fails loudly for an unknown section", () => {
    expect(() => setSectionData(testWorkspace.host, "missing", {})).toThrowError(
      "Unknown section missing.",
    );
  });
});
