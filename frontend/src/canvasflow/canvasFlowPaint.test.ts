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

  it("can reuse captured element images for the snapshot-cache perf variant", () => {
    const { canvas, ctx, element } = createPaintHarness();
    (
      window as { __settaCanvasFlowPerfVariant?: string }
    ).__settaCanvasFlowPerfVariant = "snapshot-cache";
    const image = createElementImage();
    const captureElementImage = vi.fn(() => image);
    (
      canvas as HTMLCanvasElement & {
        captureElementImage: (element: Element) => typeof image;
      }
    ).captureElementImage = captureElementImage;

    const firstStats = paintCanvasFlow(
      createPaintParams({ canvas, ctx, element }),
    );
    const secondStats = paintCanvasFlow(
      createPaintParams({ canvas, ctx, element }),
    );

    expect(captureElementImage).toHaveBeenCalledTimes(1);
    expect(ctx.drawElementImage).toHaveBeenNthCalledWith(
      1,
      image,
      0,
      0,
      100,
      100,
    );
    expect(ctx.drawElementImage).toHaveBeenNthCalledWith(
      2,
      image,
      0,
      0,
      100,
      100,
    );
    expect(firstStats.snapshotCacheMissCount).toBe(1);
    expect(firstStats.snapshotCacheHitCount).toBe(0);
    expect(secondStats.snapshotCacheMissCount).toBe(0);
    expect(secondStats.snapshotCacheHitCount).toBe(1);
  });

  it("invalidates cached element images for changed node ids", () => {
    const { canvas, ctx, element } = createPaintHarness();
    (
      window as { __settaCanvasFlowPerfVariant?: string }
    ).__settaCanvasFlowPerfVariant = "snapshot-cache";
    const firstImage = createElementImage();
    const secondImage = createElementImage();
    const captureElementImage = vi
      .fn()
      .mockReturnValueOnce(firstImage)
      .mockReturnValueOnce(secondImage);
    (
      canvas as HTMLCanvasElement & {
        captureElementImage: (element: Element) => typeof firstImage;
      }
    ).captureElementImage = captureElementImage;

    paintCanvasFlow(createPaintParams({ canvas, ctx, element }));
    const stats = paintCanvasFlow(
      createPaintParams({
        canvas,
        changedNodeIds: new Set(["node-1"]),
        ctx,
        element,
      }),
    );

    expect(firstImage.close).toHaveBeenCalledTimes(1);
    expect(captureElementImage).toHaveBeenCalledTimes(2);
    expect(ctx.drawElementImage).toHaveBeenNthCalledWith(
      2,
      secondImage,
      0,
      0,
      100,
      100,
    );
    expect(stats.snapshotCacheMissCount).toBe(1);
    expect(stats.snapshotCacheHitCount).toBe(0);
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
  changedNodeIds,
  ctx,
  edge,
  element,
  node,
  viewport = { x: 0, y: 0, zoom: 1 },
}: {
  canvas: HTMLCanvasElement;
  changedNodeIds?: ReadonlySet<string>;
  ctx: CanvasFlowRenderingContext;
  element: HTMLElement;
  edge?: boolean;
  node?: Partial<{
    height: number;
    position: { x: number; y: number };
    tempZIndex: number;
    width: number;
    zIndex: number;
  }>;
  viewport?: { x: number; y: number; zoom: number };
}) {
  return {
    canvas,
    changedNodeIds,
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
    nodeElements: new Map([["node-1", element]]),
    nodes: [
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

function createElementImage() {
  return {
    close: vi.fn(),
    height: 100,
    width: 100,
  };
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
