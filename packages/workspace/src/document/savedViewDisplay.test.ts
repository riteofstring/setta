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

import { describe, expect, it } from "vitest";
import { getDisplayedSectionIdToChildren } from "../dnd/dndChildren.js";
import { createNodesMapFromDocumentChildren } from "./nodeProjection.js";
import {
  getVisibleSectionChildrenForDisplay,
  getVisibleTopLevelSectionIdsForDisplay,
  isWorkspaceSectionVisible,
} from "./savedViewDisplay.js";
import type { WorkspaceDocumentState } from "./stores.js";
import type { WorkspaceSection } from "./types.js";

function section(id: string, children: Array<string> = []): WorkspaceSection {
  return {
    children,
    id,
    isHorizontalOrientation: false,
    isMinimized: false,
    kind: children.length > 0 ? "group" : "leaf",
    name: id,
    overflowMode: false,
    positionAndSizeLocked: false,
    size: { height: 100, width: 200 },
    styleColor: null,
    tagColor: null,
  };
}

function createState(
  savedViews: WorkspaceDocumentState["savedViews"],
): WorkspaceDocumentState {
  return {
    parentSectionMap: { child: "group", grandchild: "child" },
    savedViews,
    sections: {
      child: section("child", ["grandchild"]),
      grandchild: section("grandchild"),
      group: section("group", ["child"]),
      side: section("side"),
    },
    topLevelSections: {
      group: { h: 200, w: 300, x: 0, y: 0, zIndex: 0 },
      side: { h: 100, w: 200, x: 400, y: 0, zIndex: 1 },
    },
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

function createSavedViews(): NonNullable<WorkspaceDocumentState["savedViews"]> {
  return {
    activeViewId: "overview",
    views: {
      overview: {
        id: "overview",
        isTab: false,
        name: "Overview",
        sectionVisibility: {
          child: false,
          grandchild: true,
          group: true,
          side: true,
        },
        sortIndex: 0,
        topLevelSections: {
          group: { h: 200, w: 300, x: 0, y: 0, zIndex: 0 },
          side: { h: 100, w: 200, x: 400, y: 0, zIndex: 1 },
        },
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    },
  };
}

describe("saved-view display projection", () => {
  it("keeps every section visible while saved views are disabled", () => {
    const state = createState(null);

    expect(getVisibleTopLevelSectionIdsForDisplay(state)).toEqual([
      "group",
      "side",
    ]);
    expect(getVisibleSectionChildrenForDisplay(state, "group")).toEqual([
      "child",
    ]);
    expect(isWorkspaceSectionVisible(state, "grandchild")).toBe(true);
  });

  it("omits hidden nested sections and their descendants from canvas and DnD projections", () => {
    const state = createState(createSavedViews());

    expect(getVisibleTopLevelSectionIdsForDisplay(state)).toEqual([
      "group",
      "side",
    ]);
    expect(getVisibleSectionChildrenForDisplay(state, "group")).toEqual([]);
    expect(isWorkspaceSectionVisible(state, "child")).toBe(false);
    expect(isWorkspaceSectionVisible(state, "grandchild")).toBe(false);
    expect([
      ...createNodesMapFromDocumentChildren(
        testWorkspace.host,
        state,
        new Map(),
      ).keys(),
    ]).toEqual(["group", "side"]);
    expect(getDisplayedSectionIdToChildren(state)).toEqual({
      group: [],
      side: [],
    });
  });
});
