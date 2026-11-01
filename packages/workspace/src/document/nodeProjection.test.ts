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

import { beforeEach, describe, expect, it } from "vitest";
import { deriveSectionStyleTheme } from "../section/sectionStyleColors.js";
import { createNodesMapFromDocumentChildren } from "./nodeProjection.js";
import {
  useWorkspaceAppearance,
  type WorkspaceDocumentState,
} from "./stores.js";
import type { Node, WorkspaceSection } from "./types.js";

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

function requireTheme(styleColor: string, darkMode: boolean) {
  const theme = deriveSectionStyleTheme(styleColor, darkMode);
  if (!theme) {
    throw new Error(`Expected a derived theme for ${styleColor}.`);
  }
  return theme;
}

function makeDocumentState(
  overrides: Partial<WorkspaceDocumentState> = {},
): WorkspaceDocumentState {
  return {
    sections: { leaf: makeSection("leaf") },
    topLevelSections: { leaf: { x: 10, y: 20, w: 224, h: 96, zIndex: 3 } },
    viewport: { x: 0, y: 0, zoom: 1 },
    savedViews: null,
    parentSectionMap: {},
    ...overrides,
  };
}

describe("createNodesMapFromDocumentChildren", () => {
  beforeEach(() => {
    testWorkspace.appearance.getState().reset();
  });

  it("projects a top-level section into a node", () => {
    const nodes = createNodesMapFromDocumentChildren(
      testWorkspace.host,
      makeDocumentState(),
      new Map(),
    );
    expect(nodes.get("leaf")).toEqual({
      id: "leaf",
      position: { x: 10, y: 20 },
      width: 224,
      height: 96,
      zIndex: 3,
      tempZIndex: 3,
      kind: "leaf",
      style: undefined,
    });
  });

  it("skips layout entries whose section currently has a parent", () => {
    const state = makeDocumentState({
      sections: {
        parent: makeSection("parent", { kind: "group", children: ["leaf"] }),
        leaf: makeSection("leaf"),
      },
      topLevelSections: {
        parent: { x: 0, y: 0, w: 400, h: 300, zIndex: 0 },
        leaf: { x: 10, y: 20, w: 224, h: 96, zIndex: 3 },
      },
      parentSectionMap: { leaf: "parent" },
    });
    const nodes = createNodesMapFromDocumentChildren(
      testWorkspace.host,
      state,
      new Map(),
    );
    expect([...nodes.keys()]).toEqual(["parent"]);
  });

  it("prefers existing measured node sizes over layout sizes", () => {
    const existing: Node = {
      id: "leaf",
      position: { x: 0, y: 0 },
      width: 500,
      height: 400,
      zIndex: 0,
      tempZIndex: 0,
      kind: "leaf",
    };
    const nodes = createNodesMapFromDocumentChildren(
      testWorkspace.host,
      makeDocumentState(),
      new Map([["leaf", existing]]),
    );
    expect(nodes.get("leaf")).toMatchObject({
      width: 500,
      height: 400,
      zIndex: 3,
    });
  });

  it("uses document layout dimensions when projecting a saved presentation", () => {
    const existing: Node = {
      id: "leaf",
      position: { x: 0, y: 0 },
      width: 500,
      height: 400,
      zIndex: 0,
      tempZIndex: 0,
      kind: "leaf",
    };
    const nodes = createNodesMapFromDocumentChildren(
      testWorkspace.host,
      makeDocumentState(),
      new Map([["leaf", existing]]),
      { useDocumentLayoutDimensions: true },
    );
    expect(nodes.get("leaf")).toMatchObject({
      width: 224,
      height: 96,
      zIndex: 3,
    });
  });

  it("derives the node background from the section style color and appearance", () => {
    const state = makeDocumentState({
      sections: { leaf: makeSection("leaf", { styleColor: "#3b82f6" }) },
    });

    const lightNodes = createNodesMapFromDocumentChildren(
      testWorkspace.host,
      state,
      new Map(),
    );
    expect(lightNodes.get("leaf")?.style).toEqual({
      background: requireTheme("#3b82f6", false).bg,
    });

    testWorkspace.appearance.setState({ darkMode: true });
    const darkNodes = createNodesMapFromDocumentChildren(
      testWorkspace.host,
      state,
      new Map(),
    );
    expect(darkNodes.get("leaf")?.style).toEqual({
      background: requireTheme("#3b82f6", true).bg,
    });
  });

  it("fails loudly for unparseable style colors", () => {
    const state = makeDocumentState({
      sections: { leaf: makeSection("leaf", { styleColor: "not-a-color" }) },
    });
    expect(() =>
      createNodesMapFromDocumentChildren(testWorkspace.host, state, new Map()),
    ).toThrowError(/unparseable style color not-a-color/);
  });

  it("emits no style for empty style colors", () => {
    const state = makeDocumentState({
      sections: { leaf: makeSection("leaf", { styleColor: "  " }) },
    });
    const nodes = createNodesMapFromDocumentChildren(
      testWorkspace.host,
      state,
      new Map(),
    );
    expect(nodes.get("leaf")?.style).toBeUndefined();
  });

  it("fails loudly when a projected section record is missing", () => {
    const state = makeDocumentState({ sections: {} });
    expect(() =>
      createNodesMapFromDocumentChildren(testWorkspace.host, state, new Map()),
    ).toThrowError(/Unknown section leaf/);
  });
});
