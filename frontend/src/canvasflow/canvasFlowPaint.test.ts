/* @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest";
import { paintCanvasFlow } from "./canvasFlowPaint";
import type { CanvasFlowRenderingContext } from "./canvasFlowTypes";

describe("paintCanvasFlow", () => {
  afterEach(() => {
    delete (window as { __settaCanvasFlowPerfVariant?: string })
      .__settaCanvasFlowPerfVariant;
    vi.restoreAllMocks();
  });

  it("samples paint stats by default instead of writing canvas dataset attributes every paint", () => {
    const { canvas, ctx, element } = createPaintHarness();
    const now = vi.spyOn(performance, "now");

    now.mockReturnValue(0);
    paintCanvasFlow(createPaintParams({ canvas, ctx, element }));
    expect(canvas.dataset.paintSequence).toBe("1");
    expect(canvas.dataset.viewportX).toBe("0.00");

    now.mockReturnValue(10);
    paintCanvasFlow(
      createPaintParams({
        canvas,
        ctx,
        element,
        viewport: { x: -20, y: 0, zoom: 1 },
      }),
    );
    expect(canvas.dataset.paintSequence).toBe("1");
    expect(canvas.dataset.viewportX).toBe("0.00");

    now.mockReturnValue(300);
    paintCanvasFlow(
      createPaintParams({
        canvas,
        ctx,
        element,
        viewport: { x: -20, y: 0, zoom: 1 },
      }),
    );
    expect(canvas.dataset.paintSequence).toBe("2");
    expect(canvas.dataset.viewportX).toBe("-20.00");
  });

  it("writes paint stats every paint when diagnostics are explicitly enabled", () => {
    const { canvas, ctx, element } = createPaintHarness();
    canvas.dataset.canvasFlowDiagnostics = "enabled";
    const now = vi.spyOn(performance, "now");

    now.mockReturnValue(0);
    paintCanvasFlow(createPaintParams({ canvas, ctx, element }));
    expect(canvas.dataset.paintSequence).toBe("1");

    now.mockReturnValue(10);
    paintCanvasFlow(
      createPaintParams({
        canvas,
        ctx,
        element,
        viewport: { x: -20, y: 0, zoom: 1 },
      }),
    );
    expect(canvas.dataset.paintSequence).toBe("2");
    expect(canvas.dataset.viewportX).toBe("-20.00");
  });

  it("draws HTML nodes in screen coordinates instead of a scaled canvas transform", () => {
    const { canvas, ctx, element } = createPaintHarness();

    paintCanvasFlow(
      createPaintParams({
        canvas,
        ctx,
        element,
        node: {
          height: 400,
          position: { x: 100, y: 200 },
          width: 300,
        },
        viewport: { x: 40, y: 30, zoom: 0.1 },
      }),
    );

    expect(ctx.drawElementImage).toHaveBeenCalledWith(element, 50, 50, 30, 40);
  });

  it("can skip edge drawing for the perf isolation harness", () => {
    const { canvas, ctx, element } = createPaintHarness();
    (
      window as { __settaCanvasFlowPerfVariant?: string }
    ).__settaCanvasFlowPerfVariant = "no-edges";

    const stats = paintCanvasFlow(
      createPaintParams({
        canvas,
        ctx,
        element,
        edge: true,
      }),
    );

    expect(stats.edgeCount).toBe(1);
    expect(ctx.beginPath).not.toHaveBeenCalled();
  });

  it("can replace HTML node drawing with diagnostic rectangles", () => {
    const { canvas, ctx, element } = createPaintHarness();
    (
      window as { __settaCanvasFlowPerfVariant?: string }
    ).__settaCanvasFlowPerfVariant = "rect-nodes";

    paintCanvasFlow(createPaintParams({ canvas, ctx, element }));

    expect(ctx.drawElementImage).not.toHaveBeenCalled();
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 100, 100);
  });

  it("can skip DOM transform assignment for the perf isolation harness", () => {
    const { canvas, ctx, element } = createPaintHarness();
    (
      window as { __settaCanvasFlowPerfVariant?: string }
    ).__settaCanvasFlowPerfVariant = "skip-transform";

    paintCanvasFlow(createPaintParams({ canvas, ctx, element }));

    expect(ctx.drawElementImage).toHaveBeenCalled();
    expect(element.style.transform).toBe("");
  });

  it("uses cheap node previews during low-zoom viewport gestures", () => {
    const { canvas, ctx, element } = createPaintHarness();
    const { elements, nodes } = createNodeSet(element, 8);

    const stats = paintCanvasFlow(
      createPaintParams({
        canvas,
        ctx,
        element,
        nodeElements: elements,
        nodes,
        viewport: { x: 0, y: 0, zoom: 0.1 },
        viewportGestureActive: true,
      }),
    );

    expect(stats.gesturePreviewNodeCount).toBe(8);
    expect(ctx.drawElementImage).not.toHaveBeenCalled();
    expect(element.style.transform).toBe("");
  });

  it("keeps full HTML drawing during high-zoom viewport gestures", () => {
    const { canvas, ctx, element } = createPaintHarness();
    const { elements, nodes } = createNodeSet(element, 8);

    const stats = paintCanvasFlow(
      createPaintParams({
        canvas,
        ctx,
        element,
        nodeElements: elements,
        nodes,
        viewport: { x: 0, y: 0, zoom: 1 },
        viewportGestureActive: true,
      }),
    );

    expect(stats.gesturePreviewNodeCount).toBe(0);
    expect(ctx.drawElementImage).toHaveBeenCalled();
    expect(element.style.transform).toBe("matrix(1, 0, 0, 1, 0, 0)");
  });
});

function createPaintHarness() {
  const canvas = document.createElement("canvas");
  canvas.width = 800;
  canvas.height = 400;
  const element = document.createElement("div");
  const ctx = createContext();
  return { canvas, ctx, element };
}

function createPaintParams({
  canvas,
  ctx,
  edge,
  element,
  node,
  nodeElements,
  nodes,
  viewport = { x: 0, y: 0, zoom: 1 },
  viewportGestureActive,
}: {
  canvas: HTMLCanvasElement;
  ctx: CanvasFlowRenderingContext;
  element: HTMLElement;
  edge?: boolean;
  nodeElements?: Map<string, HTMLElement>;
  node?: Partial<{
    height: number;
    position: { x: number; y: number };
    tempZIndex: number;
    width: number;
    zIndex: number;
  }>;
  nodes?: Array<{
    height: number;
    id: string;
    position: { x: number; y: number };
    tempZIndex: number;
    width: number;
    zIndex: number;
  }>;
  viewport?: { x: number; y: number; zoom: number };
  viewportGestureActive?: boolean;
}) {
  return {
    canvas,
    connectionState: {
      connectionPosition: { x: 0, y: 0 },
      connectionStartHandle: null,
      connectionStatus: null,
    },
    ctx,
    darkMode: false,
    edgeHandlePositions: {},
    edges: edge ? [createTestEdge()] : [],
    gridSize: 20,
    nodeElements: nodeElements ?? new Map([["node-1", element]]),
    nodes: nodes ?? [
      {
        height: node?.height ?? 100,
        id: "node-1",
        position: node?.position ?? { x: 0, y: 0 },
        tempZIndex: node?.tempZIndex ?? 0,
        width: node?.width ?? 100,
        zIndex: node?.zIndex ?? 0,
      },
    ],
    previousInteractiveNodeIds: new Set<string>(),
    showGridLines: false,
    size: {
      cssHeight: 400,
      cssWidth: 800,
      pixelHeight: 400,
      pixelRatio: 1,
      pixelWidth: 800,
    },
    viewport,
    viewportGestureActive,
    wireColor: "#000",
  };
}

function createContext(): CanvasFlowRenderingContext {
  return {
    beginPath: vi.fn(),
    clearRect: vi.fn(),
    bezierCurveTo: vi.fn(),
    drawElementImage: vi.fn(() => ({
      toString: () => "matrix(1, 0, 0, 1, 0, 0)",
    })),
    fillText: vi.fn(),
    fillRect: vi.fn(),
    lineTo: vi.fn(),
    moveTo: vi.fn(),
    restore: vi.fn(),
    resetTransform: vi.fn(),
    save: vi.fn(),
    scale: vi.fn(),
    setTransform: vi.fn(),
    stroke: vi.fn(),
    strokeRect: vi.fn(),
    translate: vi.fn(),
  } as unknown as CanvasFlowRenderingContext;
}

function createNodeSet(element: HTMLElement, count: number) {
  const elements = new Map<string, HTMLElement>();
  const nodes = Array.from({ length: count }, (_, index) => {
    const nodeElement = index === 0 ? element : document.createElement("div");
    const id = `node-${index}`;
    elements.set(id, nodeElement);
    return {
      height: 100,
      id,
      position: { x: index * 120, y: 0 },
      tempZIndex: 0,
      width: 100,
      zIndex: 0,
    };
  });
  return { elements, nodes };
}

function createTestEdge() {
  return {
    id: "edge-1",
    kind: "data",
    pathType: "straight",
    source: { x: 0, y: 0 },
    target: { x: 100, y: 100 },
    zIndex: 0,
  } as const;
}
