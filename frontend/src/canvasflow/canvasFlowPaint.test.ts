/* @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest";
import { paintCanvasFlow } from "./canvasFlowPaint";
import type { CanvasFlowRenderingContext } from "./canvasFlowTypes";

describe("paintCanvasFlow", () => {
  afterEach(() => {
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

    expect(ctx.drawElementImage).toHaveBeenCalledWith(
      element,
      50,
      50,
      30,
      40,
    );
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
  element,
  node,
  viewport = { x: 0, y: 0, zoom: 1 },
}: {
  canvas: HTMLCanvasElement;
  ctx: CanvasFlowRenderingContext;
  element: HTMLElement;
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
    connectionState: {
      connectionPosition: { x: 0, y: 0 },
      connectionStartHandle: null,
      connectionStatus: null,
    },
    ctx,
    darkMode: false,
    edgeHandlePositions: {},
    edges: [],
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
    clearRect: vi.fn(),
    drawElementImage: vi.fn(() => ({
      toString: () => "matrix(1, 0, 0, 1, 0, 0)",
    })),
    fillRect: vi.fn(),
    restore: vi.fn(),
    resetTransform: vi.fn(),
    save: vi.fn(),
    scale: vi.fn(),
    setTransform: vi.fn(),
    translate: vi.fn(),
  } as unknown as CanvasFlowRenderingContext;
}
