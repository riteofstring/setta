import { beforeEach, describe, expect, it } from "vitest";
import { setActiveSectionIds } from "../document/activeSections";
import { useActiveSections, useNodeInternals } from "../document/stores";
import type { Node } from "../document/types";
import { useSectionRefs } from "../section/sectionRefs";
import {
  getActiveSectionsBounds,
  getNodesInside,
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
  useNodeInternals.setState({
    x: new Map(nodes.map((node) => [node.id, node])),
  });
}

beforeEach(() => {
  useNodeInternals.getState().reset();
  useActiveSections.getState().reset();
  useSectionRefs.getState().reset();
  useWorkspaceOptions.getState().reset();
  useReactFlow.setState({ ...initialCanvasState });
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
  useReactFlow.setState({
    domNode: {
      getBoundingClientRect: () => ({ x: 0, y: 0 }),
    } as unknown as HTMLDivElement,
  });
}

describe("getNodesInside", () => {
  it("uses node internals geometry to resolve overlapping nodes", () => {
    setNodes([
      createNode({ id: "section-a", position: { x: 10, y: 20 }, width: 100, height: 80 }),
      createNode({ id: "section-b", position: { x: 180, y: 40 }, width: 120, height: 90 }),
    ]);

    expect(getNodesInside({ x: 0, y: 0, width: 150, height: 140 })).toEqual(["section-a"]);
    expect(getNodesInside({ x: 0, y: 0, width: 400, height: 200 })).toEqual([
      "section-a",
      "section-b",
    ]);
  });

  it("respects partial-overlap mode", () => {
    setNodes([createNode({ id: "section-a", position: { x: 10, y: 20 }, width: 100, height: 80 })]);

    expect(getNodesInside({ x: 90, y: 70, width: 40, height: 40 }, [0, 0, 1], false)).toEqual([]);
    expect(getNodesInside({ x: 90, y: 70, width: 40, height: 40 }, [0, 0, 1], true)).toEqual([
      "section-a",
    ]);
  });

  it("does not select unmeasured nodes", () => {
    setNodes([
      createNode({ id: "section-a", position: { x: 10, y: 20 }, width: null, height: null }),
    ]);

    expect(getNodesInside({ x: 0, y: 0, width: 500, height: 500 })).toEqual([]);
  });

  it("treats zero-sized node internals as unmeasured for marquee hit testing", () => {
    setNodes([
      createNode({ id: "section-width-zero", position: { x: 5, y: 5 }, width: 0, height: 40 }),
      createNode({ id: "section-height-zero", position: { x: 5, y: 50 }, width: 40, height: 0 }),
    ]);

    expect(getNodesInside({ x: 0, y: 0, width: 200, height: 200 })).toEqual([]);
  });
});

describe("getActiveSectionsBounds", () => {
  it("uses node internals geometry for active section bounds", () => {
    setActiveSectionIds(["section-a", "section-b"]);
    setNodes([
      createNode({ id: "section-a", position: { x: 10, y: 20 }, width: 100, height: 80 }),
      createNode({ id: "section-b", position: { x: 180, y: 40 }, width: 120, height: 90 }),
    ]);

    expect(getActiveSectionsBounds()).toEqual({
      x: 10,
      y: 20,
      width: 290,
      height: 110,
    });
  });

  it("returns a zero rect when no active section has measured geometry", () => {
    setActiveSectionIds(["section-a"]);
    setNodes([createNode({ id: "section-a", position: { x: 10, y: 20 }, width: 0, height: 0 })]);

    expect(getActiveSectionsBounds()).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });

  it("falls back to the section DOM ref for sections without measured node internals", () => {
    setCanvasDomNode();
    useWorkspaceOptions.setState({ snapToGrid: false });
    setActiveSectionIds(["nested-section"]);
    useSectionRefs.setState({
      selfOnly: {
        "nested-section": createSectionRefElement({ x: 30, y: 40, width: 120, height: 60 }),
      },
    });

    expect(getActiveSectionsBounds()).toEqual({ x: 30, y: 40, width: 120, height: 60 });
  });

  it("skips snap-to-grid rounding when measuring with ignoreGrid", () => {
    setCanvasDomNode();
    setActiveSectionIds(["nested-section"]);
    useSectionRefs.setState({
      selfOnly: {
        "nested-section": createSectionRefElement({ x: 32, y: 41, width: 120, height: 60 }),
      },
    });

    // The default 15px snap grid rounds the measured origin; ignoreGrid preserves it.
    expect(getActiveSectionsBounds(false)).toEqual({ x: 30, y: 45, width: 120, height: 60 });
    expect(getActiveSectionsBounds(true)).toEqual({ x: 32, y: 41, width: 120, height: 60 });
  });
});

describe("getSectionRect", () => {
  it("returns null when no ref is registered", () => {
    expect(getSectionRect("missing-section")).toBeNull();
  });

  it("prefers the selfOnly ref and converts through the viewport transform", () => {
    setCanvasDomNode();
    useWorkspaceOptions.setState({ snapToGrid: false });
    useReactFlow.setState({ transform: [10, 20, 2] });
    useSectionRefs.setState({
      selfOnly: { "section-a": createSectionRefElement({ x: 110, y: 220, width: 50, height: 40 }) },
      withNested: { "section-a": createSectionRefElement({ x: 0, y: 0, width: 999, height: 999 }) },
    });

    expect(getSectionRect("section-a", true)).toEqual({ x: 50, y: 100, width: 50, height: 40 });
  });
});

describe("getViewportForBounds", () => {
  it("centers the bounds at the zoom that fits them with padding", () => {
    const viewport = getViewportForBounds({ x: 0, y: 0, width: 400, height: 300 }, 800, 600, {
      minZoom: 0.1,
      maxZoom: 10,
    });

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
      getViewportForBounds({ x: 0, y: 0, width: 100000, height: 100000 }, 800, 600, {
        minZoom: 0.5,
        maxZoom: 2,
      }).zoom,
    ).toBe(0.5);
  });
});
