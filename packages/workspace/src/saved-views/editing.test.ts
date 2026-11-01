import {
  afterEach as afterEachWorkspaceTestHost,
  beforeEach as beforeEachWorkspaceTestHost,
} from "vitest";
import {
  createWorkspaceTestHost,
  type WorkspaceTestHost,
} from "../../test/workspaceTestHost.js";

let testWorkspace: WorkspaceTestHost;
beforeEachWorkspaceTestHost(() => {
  testWorkspace = createWorkspaceTestHost();
});
afterEachWorkspaceTestHost(() => {
  testWorkspace.host.dispose();
});

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setActiveSectionIds } from "../document/activeSections.js";
import { loadWorkspaceDocument } from "../document/loadWorkspaceDocument.js";
import { registerSectionKinds } from "../document/sectionKindRegistry.js";
import type { WorkspaceSectionInput } from "../document/types.js";
import {
  getWorkspaceSavedViewSectionAction,
  setWorkspaceSavedViewEditing,
  setWorkspaceSavedViewSectionsDisplayed,
} from "./editing.js";
import { isWorkspaceSavedViewEditing } from "./editingState.js";
import {
  enableWorkspaceSavedViews,
  setWorkspaceSavedViewSectionVisibility,
} from "./operations.js";

function section(
  id: string,
  overrides: Partial<WorkspaceSectionInput> = {},
): WorkspaceSectionInput {
  return {
    children: [],
    id,
    isHorizontalOrientation: false,
    isMinimized: false,
    kind: "leaf",
    name: id,
    overflowMode: false,
    positionAndSizeLocked: false,
    size: { height: 100, width: 200 },
    styleColor: null,
    tagColor: null,
    ...overrides,
  };
}

function loadDocument(): void {
  loadWorkspaceDocument(testWorkspace.host, {
    activeIds: [],
    savedViews: null,
    sections: {
      child: section("child"),
      group: section("group", { children: ["child"], kind: "group" }),
      side: section("side"),
    },
    topLevelSections: {
      group: { h: 180, w: 320, x: 0, y: 0, zIndex: 0 },
      side: { h: 100, w: 200, x: 360, y: 0, zIndex: 1 },
    },
    viewport: { x: 0, y: 0, zoom: 1 },
  });
  enableWorkspaceSavedViews(testWorkspace.host, {
    id: "overview",
    name: "Overview",
  });
}

describe("saved view editing", () => {
  beforeEach(() => {
    registerSectionKinds(testWorkspace.host, {
      leaf: { renderContent: () => null },
    });
    loadDocument();
  });

  afterEach(() => {
    registerSectionKinds(testWorkspace.host, {});
  });

  it("projects hidden sections for editing and prunes them when editing ends", () => {
    setWorkspaceSavedViewSectionVisibility(
      testWorkspace.host,
      ["child", "side"],
      false,
    );
    expect([...testWorkspace.nodeInternals.getState().x.keys()]).toEqual([
      "group",
    ]);
    expect(testWorkspace.dndChildren.getState().x.group).toEqual([]);

    expect(setWorkspaceSavedViewEditing(testWorkspace.host, true)).toBe(true);
    expect(isWorkspaceSavedViewEditing(testWorkspace.host)).toBe(true);
    expect([...testWorkspace.nodeInternals.getState().x.keys()]).toEqual([
      "group",
      "side",
    ]);
    expect(testWorkspace.dndChildren.getState().x.group).toEqual(["child"]);

    setActiveSectionIds(testWorkspace.host, ["child", "side"]);
    expect(testWorkspace.activeSections.getState().activeIds).toEqual([
      "child",
      "side",
    ]);

    expect(setWorkspaceSavedViewEditing(testWorkspace.host, false)).toBe(true);
    expect(isWorkspaceSavedViewEditing(testWorkspace.host)).toBe(false);
    expect([...testWorkspace.nodeInternals.getState().x.keys()]).toEqual([
      "group",
    ]);
    expect(testWorkspace.dndChildren.getState().x.group).toEqual([]);
    expect(testWorkspace.activeSections.getState().activeIds).toEqual([]);
  });

  it("shows a nested section by restoring its hidden ancestor path", () => {
    setWorkspaceSavedViewSectionVisibility(
      testWorkspace.host,
      ["group"],
      false,
    );
    const hiddenDocument = testWorkspace.document.getState();
    expect(getWorkspaceSavedViewSectionAction(hiddenDocument, ["child"])).toBe(
      "show",
    );

    setWorkspaceSavedViewSectionsDisplayed(testWorkspace.host, ["child"], true);

    const activeView =
      testWorkspace.document.getState().savedViews?.views.overview;
    expect(activeView?.sectionVisibility.group).toBe(true);
    expect(activeView?.sectionVisibility.child).toBe(true);
    expect(
      getWorkspaceSavedViewSectionAction(testWorkspace.document.getState(), [
        "child",
      ]),
    ).toBe("hide");
  });

  it("resets transient editing when a document is loaded", () => {
    setWorkspaceSavedViewSectionVisibility(testWorkspace.host, ["side"], false);
    setWorkspaceSavedViewEditing(testWorkspace.host, true);

    loadWorkspaceDocument(testWorkspace.host, testWorkspace.host.getSnapshot());

    expect(isWorkspaceSavedViewEditing(testWorkspace.host)).toBe(false);
    expect([...testWorkspace.nodeInternals.getState().x.keys()]).toEqual([
      "group",
    ]);
  });
});
