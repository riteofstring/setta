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

import { beforeEach, describe, expect, it } from "vitest";
import { setActiveSectionIds } from "../document/activeSections";
import {
  useActiveSections,
  useNodeInternals,
  useWorkspaceDocument,
} from "../document/stores";
import type { Node, WorkspaceSection } from "../document/types";
import { useSectionRefs } from "../section/sectionRefs";
import {
  getActiveSectionsBounds,
  getNodesInside,
  getPaneRect,
  getSectionRect,
  getViewportForBounds,
} from "./graph";
import { useWorkspaceOptions } from "./options";
import { initialCanvasState, useReactFlow } from "./store";

// Ported from the reference fork's `utils/graph.test.ts`, including the section-DOM-ref
// fallbacks that measure nested or unmeasured sections through the section-ref registry.

function createNode(overrides: Partial<Node> & Pick<Node, "id">): Node {
  return {
    id: overrides.id,
    position: overrides.position ?? { x: 0, y: 0 },
    width: overrides.width === undefined ? 100 : overrides.width,
    height: overrides.height === undefined ? 80 : overrides.height,
    zIndex: overrides.zIndex ?? 0,
    tempZIndex: overrides.tempZIndex ?? 0,
    kind: overrides.kind ?? "leaf",
    style: overrides.style,
  };
}

function setNodes(nodes: Array<Node>) {
  testWorkspace.nodeInternals.setState({
    x: new Map(nodes.map((node) => [node.id, node])),
  });
}

beforeEach(() => {
  testWorkspace.nodeInternals.getState().reset();
  testWorkspace.activeSections.getState().reset();
  testWorkspace.sectionRefs.getState().reset();
  testWorkspace.document.getState().reset();
  testWorkspace.options.getState().reset();
  testWorkspace.reactFlow.setState({ ...initialCanvasState });
});

function createSectionRefElement({
  x,
  y,
  width,
  height,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
}): HTMLElement {
  return {
    clientWidth: width,
    clientHeight: height,
    getBoundingClientRect: () => ({ x, y }),
  } as unknown as HTMLElement;
}

function setCanvasDomNode() {
  testWorkspace.reactFlow.setState({
    domNode: {
      getBoundingClientRect: () => ({ x: 0, y: 0 }),
    } as unknown as HTMLDivElement,
  });
}

function createWorkspaceSection(
  id: string,
  children: Array<string> = [],
): WorkspaceSection {
  return {
    id,
    kind: "leaf",
    name: id,
    size: { width: "auto", height: "auto" },
    isMinimized: false,
    positionAndSizeLocked: false,
    isHorizontalOrientation: false,
    styleColor: null,
    overflowMode: false,
    tagColor: null,
    children,
  };
}

describe("getNodesInside", () => {
  it("uses node internals geometry to resolve overlapping nodes", () => {
    setNodes([
      createNode({
        id: "section-a",
        position: { x: 10, y: 20 },
        width: 100,
        height: 80,
      }),
      createNode({
        id: "section-b",
        position: { x: 180, y: 40 },
        width: 120,
        height: 90,
      }),
    ]);

    expect(getNodesInside(testWorkspace.host, { x: 0, y: 0, width: 150, height: 140 })).toEqual([
      "section-a",
    ]);
    expect(getNodesInside(testWorkspace.host, { x: 0, y: 0, width: 400, height: 200 })).toEqual([
      "section-a",
      "section-b",
    ]);
  });

  it("respects partial-overlap mode", () => {
    setNodes([
      createNode({
        id: "section-a",
        position: { x: 10, y: 20 },
        width: 100,
        height: 80,
      }),
    ]);

    expect(
      getNodesInside(testWorkspace.host, { x: 90, y: 70, width: 40, height: 40 }, [0, 0, 1], false),
    ).toEqual([]);
    expect(
      getNodesInside(testWorkspace.host, { x: 90, y: 70, width: 40, height: 40 }, [0, 0, 1], true),
    ).toEqual(["section-a"]);
  });

  it("does not select unmeasured nodes without a registered DOM ref", () => {
    setNodes([
      createNode({
        id: "section-a",
        position: { x: 10, y: 20 },
        width: null,
        height: null,
      }),
    ]);

    expect(getNodesInside(testWorkspace.host, { x: 0, y: 0, width: 500, height: 500 })).toEqual([]);
  });

  it("treats zero-sized node internals without a DOM ref as unmeasured", () => {
    setNodes([
      createNode({
        id: "section-width-zero",
        position: { x: 5, y: 5 },
        width: 0,
        height: 40,
      }),
      createNode({
        id: "section-height-zero",
        position: { x: 5, y: 50 },
        width: 40,
        height: 0,
      }),
    ]);

    expect(getNodesInside(testWorkspace.host, { x: 0, y: 0, width: 200, height: 200 })).toEqual([]);
  });

  it("falls back to section DOM bounds for unmeasured node internals", () => {
    setCanvasDomNode();
    setNodes([
      createNode({
        id: "section-a",
        position: { x: 10, y: 20 },
        width: null,
        height: null,
      }),
    ]);
    testWorkspace.sectionRefs.setState({
      selfOnly: {
        "section-a": createSectionRefElement({
          x: 40,
          y: 60,
          width: 120,
          height: 80,
        }),
      },
    });

    expect(getNodesInside(testWorkspace.host, { x: 30, y: 50, width: 140, height: 100 })).toEqual([
      "section-a",
    ]);
    expect(getNodesInside(testWorkspace.host, { x: 500, y: 500, width: 10, height: 10 })).toEqual(
      [],
    );
  });

  it("falls back to section DOM bounds when node internals have zero-sized geometry", () => {
    setCanvasDomNode();
    setNodes([
      createNode({
        id: "section-a",
        position: { x: 10, y: 20 },
        width: 0,
        height: 40,
      }),
    ]);
    testWorkspace.sectionRefs.setState({
      selfOnly: {
        "section-a": createSectionRefElement({
          x: 40,
          y: 60,
          width: 120,
          height: 80,
        }),
      },
    });

    expect(getNodesInside(testWorkspace.host, { x: 30, y: 50, width: 140, height: 100 })).toEqual([
      "section-a",
    ]);
  });

  it("falls back to nested section DOM geometry when a selectable section has no node internals entry", () => {
    setCanvasDomNode();
    testWorkspace.document.setState({
      sections: {
        "group-section": createWorkspaceSection("group-section", [
          "group-child-a",
        ]),
        "group-child-a": createWorkspaceSection("group-child-a"),
      },
      parentSectionMap: { "group-child-a": "group-section" },
    });
    setNodes([
      createNode({
        id: "group-section",
        position: { x: 300, y: 120 },
        width: 260,
        height: 220,
      }),
    ]);
    testWorkspace.sectionRefs.setState({
      selfOnly: {
        "group-child-a": createSectionRefElement({
          x: 360,
          y: 180,
          width: 120,
          height: 64,
        }),
      },
    });

    expect(getNodesInside(testWorkspace.host, { x: 350, y: 170, width: 140, height: 84 })).toEqual([
      "group-child-a",
    ]);
  });
});

describe("getActiveSectionsBounds", () => {
  it("uses node internals geometry for active section bounds", () => {
    setActiveSectionIds(testWorkspace.host, ["section-a", "section-b"]);
    setNodes([
      createNode({
        id: "section-a",
        position: { x: 10, y: 20 },
        width: 100,
        height: 80,
      }),
      createNode({
        id: "section-b",
        position: { x: 180, y: 40 },
        width: 120,
        height: 90,
      }),
    ]);

    expect(getActiveSectionsBounds(testWorkspace.host)).toEqual({
      x: 10,
      y: 20,
      width: 290,
      height: 110,
    });
  });

  it("does not let a selected descendant expand its selected ancestor's visible bounds", () => {
    setCanvasDomNode();
    testWorkspace.document.setState({
      sections: {
        group: {
          ...createWorkspaceSection("group", ["nested"]),
          overflowMode: true,
          size: { width: 260, height: 220 },
        },
        nested: createWorkspaceSection("nested"),
      },
      parentSectionMap: { nested: "group" },
    });
    setActiveSectionIds(testWorkspace.host, ["group", "nested"]);
    setNodes([
      createNode({
        id: "group",
        position: { x: 100, y: 80 },
        width: 260,
        height: 220,
      }),
    ]);
    testWorkspace.sectionRefs.setState({
      selfOnly: {
        nested: createSectionRefElement({
          x: 140,
          y: 340,
          width: 180,
          height: 100,
        }),
      },
    });

    expect(getActiveSectionsBounds(testWorkspace.host)).toEqual({
      x: 100,
      y: 80,
      width: 260,
      height: 220,
    });
  });

  it("returns a zero rect when no active section has measured geometry", () => {
    setActiveSectionIds(testWorkspace.host, ["section-a"]);
    setNodes([
      createNode({
        id: "section-a",
        position: { x: 10, y: 20 },
        width: 0,
        height: 0,
      }),
    ]);

    expect(getActiveSectionsBounds(testWorkspace.host)).toEqual({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    });
  });

  it("falls back to the section DOM ref for sections without measured node internals", () => {
    setCanvasDomNode();
    testWorkspace.options.setState({ snapToGrid: false });
    setActiveSectionIds(testWorkspace.host, ["nested-section"]);
    testWorkspace.sectionRefs.setState({
      selfOnly: {
        "nested-section": createSectionRefElement({
          x: 30,
          y: 40,
          width: 120,
          height: 60,
        }),
      },
    });

    expect(getActiveSectionsBounds(testWorkspace.host)).toEqual({
      x: 30,
      y: 40,
      width: 120,
      height: 60,
    });
  });

  it("skips snap-to-grid rounding when measuring with ignoreGrid", () => {
    setCanvasDomNode();
    setActiveSectionIds(testWorkspace.host, ["nested-section"]);
    testWorkspace.sectionRefs.setState({
      selfOnly: {
        "nested-section": createSectionRefElement({
          x: 32,
          y: 41,
          width: 120,
          height: 60,
        }),
      },
    });

    // The default 15px snap grid rounds the measured origin; ignoreGrid preserves it.
    expect(getActiveSectionsBounds(testWorkspace.host, false)).toEqual({
      x: 30,
      y: 45,
      width: 120,
      height: 60,
    });
    expect(getActiveSectionsBounds(testWorkspace.host, true)).toEqual({
      x: 32,
      y: 41,
      width: 120,
      height: 60,
    });
  });
});

describe("getSectionRect", () => {
  it("returns null when no ref is registered", () => {
    expect(getSectionRect(testWorkspace.host, "missing-section")).toBeNull();
  });

  it("prefers the selfOnly ref and converts through the viewport transform", () => {
    setCanvasDomNode();
    testWorkspace.options.setState({ snapToGrid: false });
    testWorkspace.reactFlow.setState({ transform: [10, 20, 2] });
    testWorkspace.sectionRefs.setState({
      selfOnly: {
        "section-a": createSectionRefElement({
          x: 110,
          y: 220,
          width: 50,
          height: 40,
        }),
      },
      withNested: {
        "section-a": createSectionRefElement({
          x: 0,
          y: 0,
          width: 999,
          height: 999,
        }),
      },
    });

    expect(getSectionRect(testWorkspace.host, "section-a", true)).toEqual({
      x: 50,
      y: 100,
      width: 50,
      height: 40,
    });
  });
});

describe("getViewportForBounds", () => {
  it("centers the bounds at the zoom that fits them with padding", () => {
    const viewport = getViewportForBounds(
      { x: 0, y: 0, width: 400, height: 300 },
      800,
      600,
      {
        minZoom: 0.1,
        maxZoom: 10,
      },
    );

    // 800 / (400 * 1.1) is the limiting zoom on both axes.
    expect(viewport.zoom).toBeCloseTo(800 / 440);
    expect(viewport.x).toBeCloseTo(800 / 2 - 200 * viewport.zoom);
    expect(viewport.y).toBeCloseTo(600 / 2 - 150 * viewport.zoom);
  });

  it("clamps the zoom into the provided range", () => {
    expect(
      getViewportForBounds({ x: 0, y: 0, width: 10, height: 10 }, 800, 600, {
        minZoom: 0.1,
        maxZoom: 2,
      }).zoom,
    ).toBe(2);
    expect(
      getViewportForBounds(
        { x: 0, y: 0, width: 100000, height: 100000 },
        800,
        600,
        {
          minZoom: 0.5,
          maxZoom: 2,
        },
      ).zoom,
    ).toBe(0.5);
  });

  it("fits and centers bounds inside shell pane insets", () => {
    const viewport = getViewportForBounds(
      { x: 0, y: 0, width: 400, height: 100 },
      800,
      600,
      { minZoom: 0.1, maxZoom: 10 },
      {
        padding: 0,
        viewportInsets: { top: 0, right: 100, bottom: 0, left: 200 },
      },
    );

    expect(viewport.zoom).toBe(1.25);
    expect(viewport.x).toBe(200);
    expect(viewport.y).toBe(237.5);
  });

  it("fits bounds to the whole canvas when open panes cover it", () => {
    const viewport = getViewportForBounds(
      { x: 0, y: 0, width: 400, height: 100 },
      320,
      861,
      { minZoom: 0.1, maxZoom: 10 },
      {
        padding: 0,
        viewportInsets: { top: 0, right: 40, bottom: 0, left: 280 },
      },
    );

    expect(viewport.zoom).toBe(0.8);
    expect(viewport.x).toBe(0);
    expect(viewport.y).toBe(390.5);
  });
});

describe("getPaneRect", () => {
  it("projects only the unobscured canvas area into flow coordinates", () => {
    testWorkspace.reactFlow.setState({
      width: 800,
      height: 600,
      transform: [100, 50, 2],
      viewportInsets: { top: 0, right: 100, bottom: 0, left: 200 },
    });

    expect(getPaneRect(testWorkspace.host, testWorkspace.reactFlow.getState())).toEqual({
      x: 50,
      y: -25,
      width: 250,
      height: 300,
    });
  });
});
