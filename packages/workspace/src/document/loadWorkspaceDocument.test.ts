import type { ZoomTransform } from "d3-zoom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initialCanvasState, useReactFlow } from "../canvas/store";
import type { ReactFlowState } from "../canvas/types";
import {
  publishWorkspaceMenuInvocation,
  useWorkspaceMenuState,
} from "../context-menu/workspaceMenuState";
import { setDndDisabled, useDndState } from "../dnd/dndState";
import { updateItemChildren, useItemDndChildren } from "../dnd/itemDndChildren";
import { setItemDndState, useItemDndState } from "../dnd/itemDndState";
import { getWorkspaceDocument } from "./documentChangeCallback";
import { getHighestAncestor } from "./documentSelectors";
import { activateItemSelect, useItemSelectionMode } from "./itemSelectionMode";
import { loadWorkspaceDocument } from "./loadWorkspaceDocument";
import { registerSectionKinds } from "./sectionKindRegistry";
import {
  useActiveSections,
  useNodeInternals,
  useWorkspaceAppearance,
  useWorkspaceDocument,
} from "./stores";
import type {
  WorkspaceDocumentInput,
  WorkspaceItem,
  WorkspaceSection,
  WorkspaceSectionInput,
  WorkspaceSectionItemTree,
} from "./types";

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
    overflowMode: false,
    tagColor: null,
    children: [],
    ...overrides,
  };
}

function makeDocument(overrides: Partial<WorkspaceDocumentInput> = {}): WorkspaceDocumentInput {
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
  useDndState.getState().reset();
  useItemDndState.getState().reset();
  useItemDndChildren.getState().reset();
  useItemSelectionMode.getState().reset();
  useReactFlow.setState({ ...initialCanvasState });
  useWorkspaceMenuState.getState().reset();
}

// A d3-zoom stand-in for the mounted-canvas re-load paths: it records applied transforms and
// constrains identically to d3's unconstrained infinite-extent behavior.
function mountFakeZoomRuntime() {
  const applied: Array<ZoomTransform> = [];
  const fakeZoom = {
    constrain: () => (transform: ZoomTransform) => transform,
    transform: (_selection: unknown, transform: ZoomTransform) => {
      applied.push(transform);
    },
  } as unknown as NonNullable<ReactFlowState["d3Zoom"]>;
  const fakeSelection = {} as NonNullable<ReactFlowState["d3Selection"]>;
  useReactFlow.setState({ d3Zoom: fakeZoom, d3Selection: fakeSelection, width: 800, height: 600 });
  return applied;
}

describe("loadWorkspaceDocument", () => {
  beforeEach(() => {
    registerSectionKinds({ leaf: { renderContent: () => null } });
    resetWorkspaceStores();
  });

  afterEach(() => {
    registerSectionKinds({});
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

  it("releases an outgoing menu snapshot after the incoming document validates", () => {
    const owner = {} as HTMLElement;
    publishWorkspaceMenuInvocation({
      kind: "pane",
      clientPoint: { x: 40, y: 60 },
      direction: "ltr",
      owner,
      context: { scope: "pane", workspacePosition: { x: 40, y: 60 } },
      workspacePosition: { x: 40, y: 60 },
    });

    expect(() =>
      loadWorkspaceDocument(
        makeDocument({
          topLevelSections: { ghost: { x: 0, y: 0, w: 10, h: 10, zIndex: 0 } },
        }),
      ),
    ).toThrow(/Top-level layout references unknown section ghost/);
    expect(useWorkspaceMenuState.getState().invocation).not.toBeNull();

    loadWorkspaceDocument(makeDocument());

    expect(useWorkspaceMenuState.getState().invocation).toBeNull();
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

  it("stores a null viewport for documents without a saved camera", () => {
    loadWorkspaceDocument(makeDocument({ viewport: null }));
    expect(useWorkspaceDocument.getState().viewport).toBeNull();

    loadWorkspaceDocument(makeDocument({ viewport: { x: 8, y: 16, zoom: 2 } }));
    expect(useWorkspaceDocument.getState().viewport).toEqual({ x: 8, y: 16, zoom: 2 });
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

  it("rejects an unparseable style color even when the section is nested", () => {
    const document = makeDocument({
      sections: {
        root: makeSection("root", { kind: "group", children: ["nested"] }),
        nested: makeSection("nested", { styleColor: "not-a-color" }),
      },
      topLevelSections: { root: { x: 0, y: 0, w: 400, h: 300, zIndex: 0 } },
    });

    expect(() => loadWorkspaceDocument(document)).toThrowError(
      /Section nested has an unparseable style color not-a-color/,
    );
  });

  it("rejects a partially parsed six-character style color", () => {
    const document = makeDocument({
      sections: { leaf: makeSection("leaf", { styleColor: "1g0000" }) },
      topLevelSections: { leaf: { x: 0, y: 0, w: 224, h: 96, zIndex: 0 } },
    });

    expect(() => loadWorkspaceDocument(document)).toThrowError(
      /Section leaf has an unparseable style color 1g0000/,
    );
  });

  it("canonicalizes a valid tag color and rejects an invalid one before loading", () => {
    loadWorkspaceDocument(
      makeDocument({
        sections: { leaf: makeSection("leaf", { tagColor: " A1B2C3 " }) },
        topLevelSections: { leaf: { x: 0, y: 0, w: 224, h: 96, zIndex: 0 } },
      }),
    );
    expect(useWorkspaceDocument.getState().sections["leaf"]?.tagColor).toBe("#a1b2c3");

    expect(() =>
      loadWorkspaceDocument(
        makeDocument({
          sections: { leaf: makeSection("leaf", { tagColor: "blue" }) },
          topLevelSections: { leaf: { x: 0, y: 0, w: 224, h: 96, zIndex: 0 } },
        }),
      ),
    ).toThrow(/Section leaf tag color must be a six-digit hex color/);
    expect(useWorkspaceDocument.getState().sections["leaf"]?.tagColor).toBe("#a1b2c3");
  });

  it("validates explicit overflow modes while preserving intrinsic group dimensions", () => {
    const missingMode = {
      ...makeSection("leaf"),
      overflowMode: undefined,
    } as unknown as WorkspaceSection;
    expect(() =>
      loadWorkspaceDocument(
        makeDocument({
          sections: { leaf: missingMode as WorkspaceSection },
          topLevelSections: { leaf: { x: 0, y: 0, w: 224, h: 96, zIndex: 0 } },
        }),
      ),
    ).toThrow(/Section leaf overflow mode must be a boolean/);

    expect(() =>
      loadWorkspaceDocument(
        makeDocument({
          sections: { leaf: makeSection("leaf", { overflowMode: true }) },
          topLevelSections: { leaf: { x: 0, y: 0, w: 224, h: 96, zIndex: 0 } },
        }),
      ),
    ).toThrow(/Section leaf is not a group and cannot enable overflow mode/);

    loadWorkspaceDocument(
      makeDocument({
        sections: { group: makeSection("group", { kind: "group", overflowMode: true }) },
        topLevelSections: { group: { x: 0, y: 0, w: 320, h: 180, zIndex: 0 } },
      }),
    );
    expect(getWorkspaceDocument().sections["group"]?.overflowMode).toBe(true);

    loadWorkspaceDocument(
      makeDocument({
        sections: {
          group: makeSection("group", {
            kind: "group",
            overflowMode: true,
            size: { width: "auto", height: "auto" },
          }),
        },
        topLevelSections: { group: { x: 0, y: 0, w: null, h: null, zIndex: 0 } },
      }),
    );
    expect(getWorkspaceDocument().sections["group"]?.size).toEqual({
      width: "auto",
      height: "auto",
    });

    expect(() =>
      loadWorkspaceDocument(
        makeDocument({
          sections: {
            group: makeSection("group", {
              kind: "group",
              overflowMode: true,
              size: { width: -1, height: 180 },
            }),
          },
          topLevelSections: { group: { x: 0, y: 0, w: -1, h: 180, zIndex: 0 } },
        }),
      ),
    ).toThrow(/Group group overflow dimensions must be auto or positive finite numbers/);
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

  it("rejects a section whose kind is not registered", () => {
    const document = makeDocument({
      sections: { mystery: makeSection("mystery", { kind: "mystery" }) },
      topLevelSections: {},
      activeIds: [],
    });
    expect(() => loadWorkspaceDocument(document)).toThrowError(
      /Section kind mystery is not registered/,
    );
  });

  it("resolves omitted sizes from the registered kind default, then auto/auto", () => {
    registerSectionKinds({
      leaf: { renderContent: () => null, defaultSize: { width: 320, height: 180 } },
      bare: { renderContent: () => null },
    });
    const { size: _leafSize, ...leafWithoutSize } = makeSection("leaf");
    const { size: _bareSize, ...bareWithoutSize } = makeSection("bare", { kind: "bare" });
    const { size: _groupSize, ...groupWithoutSize } = makeSection("group", { kind: "group" });
    const sections: Record<string, WorkspaceSectionInput> = {
      leaf: leafWithoutSize,
      bare: bareWithoutSize,
      group: groupWithoutSize,
      sized: makeSection("sized", { size: { width: 64, height: 48 } }),
    };
    loadWorkspaceDocument(makeDocument({ sections, topLevelSections: {}, activeIds: [] }));

    const loaded = useWorkspaceDocument.getState().sections;
    expect(loaded["leaf"]?.size).toEqual({ width: 320, height: 180 });
    expect(loaded["bare"]?.size).toEqual({ width: "auto", height: "auto" });
    expect(loaded["group"]?.size).toEqual({ width: "auto", height: "auto" });
    expect(loaded["sized"]?.size).toEqual({ width: 64, height: 48 });
  });

  it("resolves an omitted meta-control size from the package control policy", () => {
    registerSectionKinds({
      meta: {
        renderContent: () => null,
        presentation: {
          type: "meta-control",
          resolveControlKind: () => "button",
          onEdit: () => {},
        },
      },
    });
    const { size: _size, ...metaWithoutSize } = makeSection("meta", {
      kind: "meta",
      data: { control: "button" },
    });
    loadWorkspaceDocument(
      makeDocument({
        sections: { meta: metaWithoutSize },
        topLevelSections: { meta: { x: 0, y: 0, w: 200, h: 44, zIndex: 0 } },
        activeIds: [],
      }),
    );

    expect(useWorkspaceDocument.getState().sections["meta"]?.size).toEqual({
      width: 200,
      height: 44,
    });
  });

  it("preserves special and auto-only meta-control defaults when size is omitted", () => {
    registerSectionKinds({
      slider: {
        renderContent: () => null,
        presentation: {
          type: "meta-control",
          resolveControlKind: () => "slider",
          onEdit: () => {},
        },
      },
      textarea: {
        renderContent: () => null,
        presentation: {
          type: "meta-control",
          resolveControlKind: () => "textarea",
          onEdit: () => {},
        },
      },
      dropzone: {
        renderContent: () => null,
        presentation: {
          type: "meta-control",
          resolveControlKind: () => "dropzone",
          onEdit: () => {},
        },
      },
    });
    const { size: _sliderSize, ...slider } = makeSection("slider", { kind: "slider" });
    const { size: _textareaSize, ...textarea } = makeSection("textarea", {
      kind: "textarea",
    });
    const { size: _dropzoneSize, ...dropzone } = makeSection("dropzone", {
      kind: "dropzone",
    });
    loadWorkspaceDocument(
      makeDocument({
        sections: { slider, textarea, dropzone },
        topLevelSections: {},
        activeIds: [],
      }),
    );

    const sections = useWorkspaceDocument.getState().sections;
    expect(sections["slider"]?.size).toEqual({ width: 200, height: "auto" });
    expect(sections["textarea"]?.size).toEqual({ width: 200, height: 98 });
    expect(sections["dropzone"]?.size).toEqual({ width: 240, height: 120 });
  });

  it("round-trips opaque section data into the emitted document", () => {
    const data = { body: "Leaf body", tags: ["a", "b"], pinned: true };
    loadWorkspaceDocument(
      makeDocument({
        sections: { leaf: makeSection("leaf", { data }) },
        topLevelSections: { leaf: { x: 0, y: 0, w: 224, h: 96, zIndex: 0 } },
        activeIds: [],
      }),
    );
    expect(getWorkspaceDocument().sections["leaf"]?.data).toEqual(data);
  });

  it("round-trips a valid item tree into the emitted document", () => {
    const itemTree: WorkspaceSectionItemTree = {
      rootId: "item-root",
      items: {
        "item-root": { id: "item-root", children: ["a", "group"] },
        a: { id: "a", children: [], data: { label: "Row A" } },
        group: { id: "group", children: ["nested"] },
        nested: { id: "nested", children: [] },
      },
      selectedItemIds: ["a", "nested"],
      itemColumnWidth: 146.5,
    };
    loadWorkspaceDocument(
      makeDocument({
        sections: { leaf: makeSection("leaf", { itemTree }) },
        topLevelSections: { leaf: { x: 0, y: 0, w: 224, h: 96, zIndex: 0 } },
        activeIds: [],
      }),
    );
    expect(getWorkspaceDocument().sections["leaf"]?.itemTree).toEqual(itemTree);
  });

  it("rejects malformed item trees", () => {
    const load = (itemTree: WorkspaceSectionItemTree) =>
      loadWorkspaceDocument(
        makeDocument({
          sections: { leaf: makeSection("leaf", { itemTree }) },
          topLevelSections: { leaf: { x: 0, y: 0, w: 224, h: 96, zIndex: 0 } },
          activeIds: [],
        }),
      );

    expect(() => load({ rootId: "missing", items: {}, selectedItemIds: [] })).toThrowError(
      /missing its root item missing/,
    );
    expect(() =>
      load({
        rootId: "item-root",
        items: { "item-root": { id: "item-root", children: [] } },
        selectedItemIds: [],
        itemColumnWidth: Number.NaN,
      }),
    ).toThrowError(/item column width must be finite/);
    expect(() =>
      load({
        rootId: "item-root",
        items: { "item-root": { id: "other", children: [] } },
        selectedItemIds: [],
      }),
    ).toThrowError(/does not match item id other/);
    expect(() =>
      load({
        rootId: "item-root",
        items: { "item-root": { id: "item-root", children: ["ghost"] } },
        selectedItemIds: [],
      }),
    ).toThrowError(/lists unknown child ghost/);
    expect(() =>
      load({
        rootId: "item-root",
        items: {
          "item-root": { id: "item-root", children: ["a", "b"] },
          a: { id: "a", children: ["shared"] },
          b: { id: "b", children: ["shared"] },
          shared: { id: "shared", children: [] },
        },
        selectedItemIds: [],
      }),
    ).toThrowError(/item shared is claimed by parents a and b/);
    expect(() =>
      load({
        rootId: "item-root",
        items: {
          "item-root": { id: "item-root", children: ["a"] },
          a: { id: "a", children: ["item-root"] },
        },
        selectedItemIds: [],
      }),
    ).toThrowError(/claims the root item as a child/);
    expect(() =>
      load({
        rootId: "item-root",
        items: {
          "item-root": { id: "item-root", children: [] },
          orphan: { id: "orphan", children: ["cycled"] },
          cycled: { id: "cycled", children: ["orphan"] },
        },
        selectedItemIds: [],
      }),
    ).toThrowError(/item orphan is not reachable from root item-root/);
    expect(() =>
      load({
        rootId: "item-root",
        items: { "item-root": { id: "item-root", children: [] } },
        selectedItemIds: ["ghost"],
      }),
    ).toThrowError(/selects unknown item ghost/);
    expect(() =>
      load({
        rootId: "item-root",
        items: { "item-root": { id: "item-root", children: [] } },
        selectedItemIds: ["item-root"],
      }),
    ).toThrowError(/selects its root item item-root/);
    expect(() =>
      load({
        rootId: "item-root",
        items: {
          "item-root": { id: "item-root", children: ["a"] },
          a: { id: "a", children: [] },
        },
        selectedItemIds: ["a", "a"],
      }),
    ).toThrowError(/selects item a twice/);
    expect(() =>
      load({
        rootId: "item-root",
        items: {
          "item-root": { id: "item-root", children: ["a"] },
          a: { id: "a", children: [], data: undefined } as unknown as WorkspaceItem,
        },
        selectedItemIds: [],
      }),
    ).toThrowError(/data must be omitted instead of undefined/);
    expect(() =>
      load({
        rootId: "item-root",
        items: {
          "item-root": { id: "item-root", children: ["a"] },
          a: {
            id: "a",
            children: [],
            data: { value: () => "not serializable" },
          } as unknown as WorkspaceItem,
        },
        selectedItemIds: [],
      }),
    ).toThrowError(/must contain only JSON values/);
    // Host item ids ride the dnd-id wire encoding verbatim, so the reserved tokens are
    // rejected at load instead of silently mis-decoding mid-drag.
    expect(() =>
      load({
        rootId: "item-root",
        items: {
          "item-root": { id: "item-root", children: ["a::settaParamList::b"] },
          "a::settaParamList::b": { id: "a::settaParamList::b", children: [] },
        },
        selectedItemIds: [],
      }),
    ).toThrowError(/contains the reserved dnd token "::settaParamList::"/);
    expect(() =>
      load({
        rootId: "item-root",
        items: {
          "item-root": { id: "item-root", children: ["a::TempParamDND"] },
          "a::TempParamDND": { id: "a::TempParamDND", children: [] },
        },
        selectedItemIds: [],
      }),
    ).toThrowError(/contains the reserved dnd token "::TempParamDND"/);
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

  it("re-applies a loaded camera through d3-zoom on a mounted canvas", () => {
    loadWorkspaceDocument(makeDocument());
    const applied = mountFakeZoomRuntime();
    useReactFlow.setState({ fitViewOnInit: true, fitViewOnInitDone: false });

    loadWorkspaceDocument(makeDocument({ viewport: { x: 60, y: -40, zoom: 1.25 } }));

    expect(applied).toHaveLength(1);
    expect(applied[0]).toMatchObject({ x: 60, y: -40, k: 1.25 });
    expect(useReactFlow.getState().fitViewOnInit).toBe(false);
    expect(useReactFlow.getState().fitViewOnInitDone).toBe(true);
  });

  it("arms and immediately completes fit-on-init when re-loading without a saved camera", () => {
    loadWorkspaceDocument(makeDocument());
    const applied = mountFakeZoomRuntime();

    // The loaded layout carries measured sizes, so the armed fit completes without waiting for
    // a ResizeObserver pass; the fake d3 runtime records the fitted transform.
    loadWorkspaceDocument(makeDocument({ viewport: null }));

    expect(useReactFlow.getState().fitViewOnInitDone).toBe(true);
    expect(applied).toHaveLength(1);
    expect(useWorkspaceDocument.getState().viewport).toBeNull();
  });

  it("leaves the canvas fit flags alone when loading before the canvas mounts", () => {
    loadWorkspaceDocument(makeDocument({ viewport: null }));

    expect(useReactFlow.getState().fitViewOnInit).toBe(false);
    expect(useReactFlow.getState().fitViewOnInitDone).toBe(false);
  });

  it("force-ends the drag session and prunes dnd bookkeeping to the loaded document", () => {
    loadWorkspaceDocument(makeDocument());
    setDndDisabled("leaf", { draggable: false, droppable: true });
    setDndDisabled("ghost", { draggable: false, droppable: false });
    useDndState.setState({ isSorting: true, activeId: "leaf" });

    loadWorkspaceDocument(makeDocument());

    const dndState = useDndState.getState();
    expect(dndState.isSorting).toBe(false);
    expect(dndState.activeId).toBeNull();
    expect(Object.keys(dndState.disabled)).toEqual(["leaf"]);
  });

  it("force-ends the item drag session and releases item-select mode", () => {
    loadWorkspaceDocument(makeDocument());
    activateItemSelect();
    setItemDndState({ activeId: "item-a", sectionId: "leaf", listKey: "main" });
    updateItemChildren({ "item-root": ["item-a"] });

    loadWorkspaceDocument(makeDocument());

    expect(useItemDndState.getState().activeId).toBeNull();
    expect(useItemDndChildren.getState().x).toEqual({});
    expect(useItemSelectionMode.getState().isSelectingItems).toBe(false);
  });

  it("rejects an item tree on a group section", () => {
    expect(() =>
      loadWorkspaceDocument(
        makeDocument({
          sections: {
            root: makeSection("root", {
              kind: "group",
              children: [],
              itemTree: {
                rootId: "item-root",
                items: { "item-root": { id: "item-root", children: [] } },
                selectedItemIds: [],
              },
            }),
          },
          topLevelSections: { root: { x: 0, y: 0, w: 400, h: 300, zIndex: 0 } },
          activeIds: [],
        }),
      ),
    ).toThrowError(/group section and cannot carry an item tree/);
  });
});
