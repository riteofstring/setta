import { beforeEach, describe, expect, it } from "vitest";
import { getHighestAncestor } from "./documentSelectors";
import { loadWorkspaceDocument, type WorkspaceDocument } from "./loadWorkspaceDocument";
import {
  useActiveSections,
  useNodeInternals,
  useWorkspaceAppearance,
  useWorkspaceDocument,
} from "./stores";
import type { WorkspaceSection } from "./types";

function makeSection(id: string, overrides: Partial<WorkspaceSection> = {}): WorkspaceSection {
  return {
    id,
    kind: "leaf",
    name: id,
    size: { width: 224, height: 96 },
    isMinimized: false,
    positionAndSizeLocked: false,
    isHorizontalOrientation: false,
    styleColor: null,
    tagColor: null,
    children: [],
    ...overrides,
  };
}

function makeDocument(overrides: Partial<WorkspaceDocument> = {}): WorkspaceDocument {
  return {
    sections: {
      root: makeSection("root", { kind: "group", children: ["nested"] }),
      nested: makeSection("nested"),
      leaf: makeSection("leaf"),
    },
    topLevelSections: {
      root: { x: 0, y: 0, w: 400, h: 300, zIndex: 0 },
      leaf: { x: 500, y: 0, w: 224, h: 96, zIndex: 1 },
    },
    viewport: { x: 0, y: 0, zoom: 1 },
    activeIds: [],
    ...overrides,
  };
}

function resetWorkspaceStores() {
  useWorkspaceDocument.getState().reset();
  useNodeInternals.getState().reset();
  useActiveSections.getState().reset();
  useWorkspaceAppearance.getState().reset();
}

describe("loadWorkspaceDocument", () => {
  beforeEach(() => {
    resetWorkspaceStores();
  });

  it("publishes the document, derived nodes, and selection", () => {
    loadWorkspaceDocument(makeDocument({ activeIds: ["leaf"] }));

    const documentState = useWorkspaceDocument.getState();
    expect(documentState.parentSectionMap).toEqual({ nested: "root" });
    expect(useActiveSections.getState().activeIds).toEqual(["leaf"]);

    const nodes = useNodeInternals.getState().x;
    expect([...nodes.keys()]).toEqual(["root", "leaf"]);
    expect(nodes.get("leaf")).toMatchObject({
      position: { x: 500, y: 0 },
      width: 224,
      height: 96,
      zIndex: 1,
      tempZIndex: 1,
      kind: "leaf",
    });
  });

  it("lets reads during publication observe the full next state atomically", () => {
    const observed: Array<{
      sectionCount: number;
      activeIds: Array<string>;
    }> = [];
    // Node internals publish first; a subscriber reading the other stores at that moment
    // must already see the next document and selection, never the stale raw state.
    const unsubscribe = useNodeInternals.subscribe(() => {
      observed.push({
        sectionCount: Object.keys(useWorkspaceDocument.getState().sections).length,
        activeIds: useActiveSections.getState().activeIds,
      });
    });
    try {
      loadWorkspaceDocument(makeDocument({ activeIds: ["root"] }));
    } finally {
      unsubscribe();
    }
    expect(observed).toEqual([{ sectionCount: 3, activeIds: ["root"] }]);
  });

  it("keeps measured node sizes over stored layout sizes on reload", () => {
    const document = makeDocument();
    loadWorkspaceDocument(document);

    const nodes = new Map(useNodeInternals.getState().x);
    const leafNode = nodes.get("leaf");
    expect(leafNode).toBeDefined();
    if (!leafNode) {
      throw new Error("leaf node missing");
    }
    nodes.set("leaf", { ...leafNode, width: 320, height: 140 });
    useNodeInternals.setState({ x: nodes });

    loadWorkspaceDocument(document);
    expect(useNodeInternals.getState().x.get("leaf")).toMatchObject({
      width: 320,
      height: 140,
    });
  });

  it("resolves the highest ancestor through the parent map", () => {
    const document = makeDocument({
      sections: {
        root: makeSection("root", { kind: "group", children: ["mid"] }),
        mid: makeSection("mid", { kind: "group", children: ["deep"] }),
        deep: makeSection("deep"),
      },
      topLevelSections: { root: { x: 0, y: 0, w: 400, h: 300, zIndex: 0 } },
    });
    loadWorkspaceDocument(document);
    expect(getHighestAncestor("deep")).toBe("root");
    expect(getHighestAncestor("root")).toBe("root");
  });

  it("rejects a child id that has no section record", () => {
    const document = makeDocument({
      sections: {
        root: makeSection("root", { kind: "group", children: ["ghost"] }),
      },
      topLevelSections: { root: { x: 0, y: 0, w: 400, h: 300, zIndex: 0 } },
    });
    expect(() => loadWorkspaceDocument(document)).toThrowError(/unknown child ghost/);
  });

  it("rejects a section claimed by two parents", () => {
    const document = makeDocument({
      sections: {
        a: makeSection("a", { kind: "group", children: ["shared"] }),
        b: makeSection("b", { kind: "group", children: ["shared"] }),
        shared: makeSection("shared"),
      },
      topLevelSections: {},
    });
    expect(() => loadWorkspaceDocument(document)).toThrowError(/claimed by parents/);
  });

  it("rejects cyclic parent chains", () => {
    const document = makeDocument({
      sections: {
        a: makeSection("a", { kind: "group", children: ["b"] }),
        b: makeSection("b", { kind: "group", children: ["a"] }),
      },
      topLevelSections: {},
    });
    expect(() => loadWorkspaceDocument(document)).toThrowError(/cyclic parent chain/);
  });

  it("rejects a mismatched section record key", () => {
    const document = makeDocument({
      sections: { mismatched: makeSection("other") },
      topLevelSections: {},
    });
    expect(() => loadWorkspaceDocument(document)).toThrowError(/does not match section id/);
  });

  it("rejects top-level layouts and active ids for unknown sections", () => {
    expect(() =>
      loadWorkspaceDocument(
        makeDocument({
          topLevelSections: { ghost: { x: 0, y: 0, w: 1, h: 1, zIndex: 0 } },
        }),
      ),
    ).toThrowError(/Top-level layout references unknown section ghost/);
    expect(() => loadWorkspaceDocument(makeDocument({ activeIds: ["ghost"] }))).toThrowError(
      /Active ids references unknown section ghost/,
    );
  });
});
