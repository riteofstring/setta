/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import "testUtils/reactRefreshPreamble";
import { describe, expect, it, vi } from "vitest";

import type { GpuFlowLayoutNode } from "../layoutStore";
import {
  drawGpuNodeResizeOverlayCanvas,
  getGpuNodeResizeOverlaySources,
  getGpuNodeResizeOverlaySurfaceLayouts,
  GpuNodeResizeOverlaySurfaceLayer,
  type GpuNodeResizeOverlaySource,
} from "./nodeResizeOverlay";

describe("GpuNodeResizeOverlaySurfaceLayer", () => {
  it("maps selected and resizing nodes to retained resize surface layouts", () => {
    const sources = getGpuNodeResizeOverlaySources({
      nodes: [
        resizeNode({
          height: 80,
          nodeId: "section-a",
          width: 120,
          x: 10,
          y: 20,
        }),
        resizeNode({
          height: 60,
          interactionFlags: { resizing: true },
          nodeId: "section-b",
          width: 90,
          x: 200,
          y: 30,
        }),
      ],
      primaryNodeId: "section-a",
    });

    expect(sources.map((source) => source.surfaceId)).toEqual([
      "gpu-node-resize-handles:section-a",
      "gpu-node-resize-handles:section-b",
    ]);
    expect(getGpuNodeResizeOverlaySurfaceLayouts(sources)).toEqual([
      {
        height: 88,
        surfaceId: "gpu-node-resize-handles:section-a",
        width: 128,
        x: 10,
        y: 20,
        zIndex: 90_003,
      },
      {
        height: 68,
        surfaceId: "gpu-node-resize-handles:section-b",
        width: 98,
        x: 200,
        y: 30,
        zIndex: 90_002,
      },
    ]);
    expect(sources[0]?.handles).toEqual([
      {
        direction: "right",
        rect: { height: 80, width: 16, x: 112, y: 0 },
      },
      {
        direction: "bottom",
        rect: { height: 16, width: 120, x: 0, y: 72 },
      },
      {
        direction: "bottomRight",
        rect: { height: 16, width: 16, x: 112, y: 72 },
      },
    ]);
    expect(sources[1]?.kind).toBe("resizing");
  });

  it("renders resize anchors inside the canvas source subtree", () => {
    const markup = renderToStaticMarkup(
      <canvas>
        <GpuNodeResizeOverlaySurfaceLayer sources={resizeSources()} />
      </canvas>,
    );

    expect(markup).toContain(
      'data-gpu-flow-source-id="gpu-node-resize-handles:section-a"',
    );
    expect(markup).not.toContain("section-resize-handle");
    expect(markup).not.toContain("data-section-resize-frame");
  });

  it("mounts resize affordances as retained canvas surface sources", async () => {
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
    const onResizeDraw = vi.fn();

    try {
      await act(async () => {
        root.render(
          <GpuNodeResizeOverlaySurfaceLayer
            onResizeDraw={onResizeDraw}
            sources={resizeSources()}
          />,
        );
      });

      const resizeSource = host.querySelector<HTMLElement>(
        '[data-testid="gpu-node-resize-source-section-a"]',
      );
      const resizeCanvas = host.querySelector<HTMLCanvasElement>(
        '[data-testid="gpu-node-resize-canvas-section-a"]',
      );

      expect(resizeSource?.dataset.gpuFlowResizeSource).toBe("true");
      expect(resizeSource?.dataset.gpuFlowResizeKind).toBe("selected");
      expect(resizeSource?.dataset.nodeid).toBe("section-a");
      expect(resizeSource?.style.width).toBe("128px");
      expect(resizeSource?.style.height).toBe("88px");
      expect(resizeCanvas?.dataset.gpuFlowResizeCanvas).toBe("true");
      expect(resizeCanvas?.width).toBe(128);
      expect(resizeCanvas?.height).toBe(88);
      expect(canvasContext.clearRect).toHaveBeenCalledWith(0, 0, 128, 88);
      expect(canvasContext.quadraticCurveTo).toHaveBeenCalled();
      expect(onResizeDraw).toHaveBeenCalledWith(
        "gpu-node-resize-handles:section-a",
      );
      expect(host.querySelector(".section-resize-handle")).toBeNull();
    } finally {
      await act(async () => {
        root.unmount();
      });
      getContextSpy.mockRestore();
      host.remove();
    }
  });

  it("draws active resize handles with retained geometry", () => {
    const context = createMockCanvasContext();

    drawGpuNodeResizeOverlayCanvas(context, resizeSource("resizing"), {
      darkMode: false,
    });

    expect(context.clearRect).toHaveBeenCalledWith(0, 0, 128, 88);
    expect(context.fill).toHaveBeenCalledTimes(3);
    expect(context.fillStyle).toBe("rgba(37, 99, 235, 0.92)");
    expect(context.strokeStyle).toBe("rgba(255, 255, 255, 0.82)");
  });
});

type MockCanvasContext = CanvasRenderingContext2D & {
  readonly clearRect: ReturnType<typeof vi.fn>;
  readonly fill: ReturnType<typeof vi.fn>;
  readonly quadraticCurveTo: ReturnType<typeof vi.fn>;
  readonly setTransform: ReturnType<typeof vi.fn>;
};

function createMockCanvasContext(): MockCanvasContext {
  return {
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

function resizeSources(): readonly GpuNodeResizeOverlaySource[] {
  return [resizeSource("selected")];
}

function resizeSource(
  kind: GpuNodeResizeOverlaySource["kind"],
): GpuNodeResizeOverlaySource {
  return {
    handles: [
      {
        direction: "right",
        rect: { height: 80, width: 16, x: 112, y: 0 },
      },
      {
        direction: "bottom",
        rect: { height: 16, width: 120, x: 0, y: 72 },
      },
      {
        direction: "bottomRight",
        rect: { height: 16, width: 16, x: 112, y: 72 },
      },
    ],
    height: 88,
    kind,
    nodeId: "section-a",
    surfaceId: "gpu-node-resize-handles:section-a",
    width: 128,
    x: 10,
    y: 20,
    zIndex: 90_003,
  };
}

function resizeNode({
  height,
  interactionFlags,
  nodeId,
  width,
  x,
  y,
}: Pick<GpuFlowLayoutNode, "height" | "nodeId" | "width" | "x" | "y"> &
  Pick<Partial<GpuFlowLayoutNode>, "interactionFlags">): GpuFlowLayoutNode {
  return {
    height,
    interactionFlags,
    nodeId,
    resizePolicy: {
      aspectRatio: false,
      aspectRatioExtraHeight: 0,
      aspectRatioExtraWidth: 0,
      directions: ["right", "bottom", "bottomRight"],
      locked: false,
      maxHeight: 1000,
      maxWidth: 1000,
      minHeight: 0,
      minWidth: 0,
    },
    width,
    x,
    y,
  } as GpuFlowLayoutNode;
}
