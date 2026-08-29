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

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GROUP_SECTION_KIND } from "./documentSelectors";
import { loadWorkspaceDocument } from "./loadWorkspaceDocument";
import { moveSections } from "./moveSections";
import { registerSectionKinds } from "./sectionKindRegistry";
import {
  useActiveSections,
  useNodeInternals,
  useWorkspaceDocument,
} from "./stores";
import type { WorkspaceSection } from "./types";

function makeSection(
  id: string,
  overrides: Partial<WorkspaceSection> = {},
): WorkspaceSection {
  return {
    id,
    kind: "leaf",
    name: id,
    size: { width: 224, height: 96 },
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

function loadTestDocument() {
  registerSectionKinds(testWorkspace.host, {
    leaf: { renderContent: () => null },
    list: { renderContent: () => null, nestedSections: "vertical" },
  });
  loadWorkspaceDocument(testWorkspace.host, {
    sections: {
      leaf: makeSection("leaf"),
      group: makeSection("group", {
        kind: GROUP_SECTION_KIND,
        size: { width: "auto", height: "auto" },
        children: ["nested-a", "nested-b"],
      }),
      "nested-a": makeSection("nested-a"),
      "nested-b": makeSection("nested-b"),
    },
    topLevelSections: {
      leaf: { x: 0, y: 0, w: 224, h: 96, zIndex: 0 },
      group: { x: 300, y: 0, w: null, h: null, zIndex: 1 },
    },
    viewport: { x: 0, y: 0, zoom: 1 },
    activeIds: [],
  });
}

function loadVerticalContainerDocument() {
  loadWorkspaceDocument(testWorkspace.host, {
    sections: {
      list: makeSection("list", {
        kind: "list",
        size: { width: "auto", height: "auto" },
        children: ["first", "second"],
      }),
      first: makeSection("first"),
      second: makeSection("second"),
      leaf: makeSection("leaf"),
    },
    topLevelSections: {
      list: { x: 0, y: 0, w: null, h: null, zIndex: 0 },
      leaf: { x: 300, y: 0, w: 224, h: 96, zIndex: 1 },
    },
    viewport: { x: 0, y: 0, zoom: 1 },
    activeIds: [],
  });
}

function resetStores() {
  testWorkspace.document.getState().reset();
  testWorkspace.nodeInternals.getState().reset();
  testWorkspace.activeSections.getState().reset();
}

describe("moveSections", () => {
  beforeEach(() => {
    loadTestDocument();
  });

  afterEach(() => {
    resetStores();
  });

  it("reorders children within the same parent", () => {
    moveSections(testWorkspace.host, {
      sectionIds: ["nested-b"],
      newParentId: "group",
      newIndex: 0,
      positionsById: null,
    });

    const state = testWorkspace.document.getState();
    expect(state.sections["group"]?.children).toEqual(["nested-b", "nested-a"]);
    expect(state.parentSectionMap["nested-b"]).toBe("group");
  });

  it("moves a top-level section into a group and drops its layout and node", () => {
    moveSections(testWorkspace.host, {
      sectionIds: ["leaf"],
      newParentId: "group",
      newIndex: 1,
      positionsById: null,
    });

    const state = testWorkspace.document.getState();
    expect(state.sections["group"]?.children).toEqual([
      "nested-a",
      "leaf",
      "nested-b",
    ]);
    expect(state.parentSectionMap["leaf"]).toBe("group");
    expect(state.topLevelSections["leaf"]).toBeUndefined();
    expect(testWorkspace.nodeInternals.getState().x.has("leaf")).toBe(false);
  });

  it("moves into, reorders within, and moves back out of a declared vertical container", () => {
    loadVerticalContainerDocument();

    moveSections(testWorkspace.host, {
      sectionIds: ["leaf"],
      newParentId: "list",
      newIndex: 1,
      positionsById: null,
    });
    moveSections(testWorkspace.host, {
      sectionIds: ["second"],
      newParentId: "list",
      newIndex: 0,
      positionsById: null,
    });
    expect(
      testWorkspace.document.getState().sections["list"]?.children,
    ).toEqual(["second", "first", "leaf"]);

    moveSections(testWorkspace.host, {
      sectionIds: ["leaf"],
      newParentId: null,
      newIndex: 0,
      positionsById: { leaf: { x: 420, y: 80 } },
    });
    const state = testWorkspace.document.getState();
    expect(state.sections["list"]?.children).toEqual(["second", "first"]);
    expect(state.parentSectionMap["leaf"]).toBeUndefined();
    expect(state.topLevelSections["leaf"]?.x).toBe(420);
  });

  it("rejects a direct move into a container that refuses its source kind", () => {
    registerSectionKinds(testWorkspace.host, {
      leaf: { renderContent: () => null },
      list: {
        renderContent: () => null,
        nestedSections: "vertical",
        canAcceptNestedSection: (section) => section.kind === "leaf",
      },
    });
    loadWorkspaceDocument(testWorkspace.host, {
      sections: {
        parent: makeSection("parent", { kind: "list" }),
        source: makeSection("source", { kind: "list" }),
      },
      topLevelSections: {
        parent: { x: 0, y: 0, w: 224, h: 96, zIndex: 0 },
        source: { x: 300, y: 0, w: 224, h: 96, zIndex: 1 },
      },
      viewport: null,
      activeIds: [],
    });

    expect(() =>
      moveSections(testWorkspace.host, {
        sectionIds: ["source"],
        newParentId: "parent",
        newIndex: 0,
        positionsById: null,
      }),
    ).toThrowError(/Section source cannot be nested in parent/);
    expect(
      testWorkspace.document.getState().topLevelSections.source,
    ).toBeDefined();
    expect(testWorkspace.document.getState().sections.parent?.children).toEqual(
      [],
    );
  });

  it("moves a nested section to the pane at the dropped position above every node", () => {
    moveSections(testWorkspace.host, {
      sectionIds: ["nested-a"],
      newParentId: null,
      newIndex: 0,
      positionsById: { "nested-a": { x: 40, y: 80 } },
    });

    const state = testWorkspace.document.getState();
    expect(state.sections["group"]?.children).toEqual(["nested-b"]);
    expect(state.parentSectionMap["nested-a"]).toBeUndefined();
    expect(state.topLevelSections["nested-a"]).toEqual({
      x: 40,
      y: 80,
      w: null,
      h: null,
      zIndex: 2,
    });

    const node = testWorkspace.nodeInternals.getState().x.get("nested-a");
    expect(node?.position).toEqual({ x: 40, y: 80 });
    expect(node?.zIndex).toBe(2);
    expect(node?.tempZIndex).toBe(2);
  });

  it("keeps an already top-level section's z-index when repositioned on the pane", () => {
    moveSections(testWorkspace.host, {
      sectionIds: ["leaf"],
      newParentId: null,
      newIndex: 0,
      positionsById: { leaf: { x: 500, y: 700 } },
    });

    const state = testWorkspace.document.getState();
    expect(state.topLevelSections["leaf"]).toEqual({
      x: 500,
      y: 700,
      w: 224,
      h: 96,
      zIndex: 0,
    });
  });

  it("requires an index when nesting and positions when dropping on the pane", () => {
    expect(() =>
      moveSections(testWorkspace.host, {
        sectionIds: ["leaf"],
        newParentId: "group",
        newIndex: null,
        positionsById: null,
      }),
    ).toThrow("Expected newIndex when moving sections into parent.");
    expect(() =>
      moveSections(testWorkspace.host, {
        sectionIds: ["nested-a"],
        newParentId: null,
        newIndex: 0,
        positionsById: null,
      }),
    ).toThrow("Expected positionsById when moving sections to pane.");
  });

  it("rejects a leaf parent and a descendant target at the canonical move boundary", () => {
    expect(() =>
      moveSections(testWorkspace.host, {
        sectionIds: ["leaf"],
        newParentId: "nested-a",
        newIndex: 0,
        positionsById: null,
      }),
    ).toThrow("Section nested-a cannot own nested sections.");

    loadWorkspaceDocument(testWorkspace.host, {
      sections: {
        parent: makeSection("parent", {
          kind: GROUP_SECTION_KIND,
          children: ["child"],
        }),
        child: makeSection("child", { kind: GROUP_SECTION_KIND }),
      },
      topLevelSections: {
        parent: { x: 0, y: 0, w: null, h: null, zIndex: 0 },
      },
      viewport: { x: 0, y: 0, zoom: 1 },
      activeIds: [],
    });
    expect(() =>
      moveSections(testWorkspace.host, {
        sectionIds: ["parent"],
        newParentId: "child",
        newIndex: 0,
        positionsById: null,
      }),
    ).toThrow(/cannot place a section inside itself or its descendant/);
  });

  it("preserves a node z-raise that has not reached a layout commit", () => {
    const nodes = new Map(testWorkspace.nodeInternals.getState().x);
    const leafNode = nodes.get("leaf");
    if (!leafNode) {
      throw new Error("Missing leaf node.");
    }
    nodes.set("leaf", { ...leafNode, zIndex: 5, tempZIndex: 5 });
    testWorkspace.nodeInternals.setState({ x: nodes });

    moveSections(testWorkspace.host, {
      sectionIds: ["nested-a"],
      newParentId: null,
      newIndex: 0,
      positionsById: { "nested-a": { x: 10, y: 10 } },
    });

    const state = testWorkspace.document.getState();
    expect(state.topLevelSections["leaf"]?.zIndex).toBe(5);
    expect(state.topLevelSections["nested-a"]?.zIndex).toBe(6);
  });
});
