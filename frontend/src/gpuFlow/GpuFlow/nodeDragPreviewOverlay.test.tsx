/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import {
  mustQueryHTMLCanvasElement,
  mustQueryHTMLElement,
} from "testUtils/domQueries.test.support";
import "testUtils/reactRefreshPreamble";
import { describe, expect, it, vi } from "vitest";

import {
  drawGpuNodeDragPreviewCanvas,
  getGpuNodeDragPreviewSources,
  getGpuNodeDragPreviewSurfaceLayouts,
  GpuNodeDragPreviewSurfaceLayer,
  type GpuNodeDragPreviewSource,
} from "./nodeDragPreviewOverlay";

describe("GpuNodeDragPreviewSurfaceLayer", () => {
  it("maps layout-store drag preview geometry to retained surface layouts", () => {
    const sources = getGpuNodeDragPreviewSources({
      draggingNodes: [
        {
          nodeId: "dragging-node",
          rect: { height: 80, width: 120, x: 10, y: 20 },
        },
      ],
      dropMarker: {
        axis: "y",
        childNodeId: "dragging-node",
        index: 2,
        parentNodeId: "parent-node",
        rect: { height: 4, width: 180, x: 12, y: 96 },
      },
    });

    expect(sources.map((source) => source.surfaceId)).toEqual([
      "gpu-drag-preview-node:dragging-node",
      "gpu-drop-marker",
    ]);
    expect(getGpuNodeDragPreviewSurfaceLayouts(sources)).toEqual([
      {
        height: 116,
        surfaceId: "gpu-drag-preview-node:dragging-node",
        width: 156,
        x: -8,
        y: 2,
        zIndex: 100_000,
      },
      {
        height: 32,
        surfaceId: "gpu-drop-marker",
        width: 208,
        x: -2,
        y: 82,
        zIndex: 100_001,
      },
    ]);
  });

  it("renders drag preview anchors inside the canvas source subtree", () => {
    const markup = renderToStaticMarkup(
      <canvas>
        <GpuNodeDragPreviewSurfaceLayer sources={previewSources()} />
      </canvas>,
    );

    expect(markup).toContain(
      'data-gpu-flow-source-id="gpu-drag-preview-node:dragging-node"',
    );
    expect(markup).toContain('data-gpu-flow-source-id="gpu-drop-marker"');
    expect(markup).not.toContain("data-gpu-flow-drag-preview-layer");
    expect(markup).not.toContain("data-gpu-flow-drop-marker=");
    expect(markup).not.toContain("data-gpu-flow-drag-preview-node=");
  });

  it("mounts drag preview affordances as retained canvas surface sources", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const canvasContext = createMockCanvasContext();
    const getContextSpy = vi
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockImplementation(((contextId: string) =>
        contextId === "2d"
          ? canvasContext
          : null) as HTMLCanvasElement["getContext"]);
    const onPreviewDraw = vi.fn();

    try {
      await act(async () => {
        root.render(
          <GpuNodeDragPreviewSurfaceLayer
            onPreviewDraw={onPreviewDraw}
            sources={previewSources()}
          />,
        );
      });

      const nodeSource = mustQueryHTMLElement(
        host,
        '[data-testid="gpu-drag-preview-node-source-dragging-node"]',
      );
      const markerSource = mustQueryHTMLElement(
        host,
        '[data-testid="gpu-drop-marker-source"]',
      );
      const nodeCanvas = mustQueryHTMLCanvasElement(
        host,
        '[data-testid="gpu-drag-preview-canvas-gpu-drag-preview-node:dragging-node"]',
      );
      const markerCanvas = mustQueryHTMLCanvasElement(
        host,
        '[data-testid="gpu-drag-preview-canvas-gpu-drop-marker"]',
      );

      expect(nodeSource.dataset.gpuFlowDragPreviewSource).toBe("true");
      expect(nodeSource.dataset.gpuFlowDragPreviewKind).toBe("node-bounds");
      expect(nodeSource.dataset.nodeid).toBe("dragging-node");
      expect(nodeSource.style.width).toBe("156px");
      expect(nodeSource.style.height).toBe("116px");
      expect(markerSource.dataset.gpuFlowDragPreviewSource).toBe("true");
      expect(markerSource.dataset.gpuFlowDragPreviewKind).toBe("drop-marker");
      expect(markerSource.dataset.gpuFlowDropMarkerParent).toBe("parent-node");
      expect(markerSource.style.width).toBe("208px");
      expect(markerSource.style.height).toBe("32px");
      expect(nodeCanvas.dataset.gpuFlowDragPreviewCanvas).toBe("true");
      expect(nodeCanvas.width).toBe(156);
      expect(nodeCanvas.height).toBe(116);
      expect(markerCanvas.dataset.gpuFlowDragPreviewCanvas).toBe("true");
      expect(markerCanvas.width).toBe(208);
      expect(markerCanvas.height).toBe(32);
      expect(canvasContext.arc).toHaveBeenCalledWith(14, 16, 5, 0, Math.PI * 2);
      expect(canvasContext.arc).toHaveBeenCalledWith(
        194,
        16,
        5,
        0,
        Math.PI * 2,
      );
      expect(onPreviewDraw).toHaveBeenCalledWith(
        "gpu-drag-preview-node:dragging-node",
      );
      expect(onPreviewDraw).toHaveBeenCalledWith("gpu-drop-marker");
      expect(
        host.querySelector("[data-gpu-flow-drag-preview-layer]"),
      ).toBeNull();
      expect(host.querySelector("[data-gpu-flow-drop-marker]")).toBeNull();
    } finally {
      await act(async () => {
        root.unmount();
      });
      getContextSpy.mockRestore();
      host.remove();
    }
  });

  it("draws drop markers with retained geometry and theme colors", () => {
    const context = createMockCanvasContext();

    drawGpuNodeDragPreviewCanvas(context, markerSource(), { darkMode: false });

    expect(context.clearRect).toHaveBeenCalledWith(0, 0, 208, 32);
    expect(context.arc).toHaveBeenCalledWith(14, 16, 5, 0, Math.PI * 2);
    expect(context.arc).toHaveBeenCalledWith(194, 16, 5, 0, Math.PI * 2);
    expect(context.fillStyle).toBe("rgba(37, 99, 235, 0.9)");
    expect(context.strokeStyle).toBe("rgba(255, 255, 255, 0.8)");
  });
});

type MockCanvasContext = CanvasRenderingContext2D & {
  readonly arc: ReturnType<typeof vi.fn>;
  readonly clearRect: ReturnType<typeof vi.fn>;
  readonly setTransform: ReturnType<typeof vi.fn>;
};

function createMockCanvasContext(): MockCanvasContext {
  return {
    arc: vi.fn(),
    beginPath: vi.fn(),
    clearRect: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    fillStyle: "",
    lineTo: vi.fn(),
    lineWidth: 0,
    moveTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    restore: vi.fn(),
    save: vi.fn(),
    setTransform: vi.fn(),
    shadowBlur: 0,
    shadowColor: "",
    shadowOffsetY: 0,
    stroke: vi.fn(),
    strokeStyle: "",
  } as unknown as MockCanvasContext;
}

function previewSources(): readonly GpuNodeDragPreviewSource[] {
  return [
    {
      height: 116,
      kind: "node-bounds",
      localRect: { height: 80, width: 120, x: 18, y: 18 },
      nodeId: "dragging-node",
      surfaceId: "gpu-drag-preview-node:dragging-node",
      width: 156,
      x: -8,
      y: 2,
      zIndex: 100_000,
    },
    markerSource(),
  ];
}

function markerSource(): GpuNodeDragPreviewSource {
  return {
    axis: "y",
    childNodeId: "dragging-node",
    height: 32,
    index: 2,
    kind: "drop-marker",
    localRect: { height: 4, width: 180, x: 14, y: 14 },
    parentNodeId: "parent-node",
    surfaceId: "gpu-drop-marker",
    width: 208,
    x: -2,
    y: 82,
    zIndex: 100_001,
  };
}
