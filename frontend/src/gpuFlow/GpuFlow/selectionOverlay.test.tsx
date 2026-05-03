/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import "testUtils/reactRefreshPreamble";
import { describe, expect, it, vi } from "vitest";

import {
  drawGpuSelectionOverlayCanvas,
  getGpuSelectionOverlaySources,
  getGpuSelectionOverlaySurfaceLayouts,
  GpuSelectionOverlaySurfaceLayer,
  type GpuSelectionOverlaySource,
} from "./selectionOverlay";

describe("GpuSelectionOverlaySurfaceLayer", () => {
  it("maps viewport selection state to retained surface layouts", () => {
    const sources = getGpuSelectionOverlaySources({
      nodesSelectionBounds: { height: 80, width: 120, x: 10, y: 20 },
      primaryNodeId: "section-a",
      transform: [4, 8, 2],
      userSelectionRect: {
        height: 60,
        startX: 20,
        startY: 30,
        width: 100,
        x: 20,
        y: 30,
      },
    });

    expect(sources.map((source) => source.surfaceId)).toEqual([
      "gpu-user-selection",
      "gpu-nodes-selection",
    ]);
    expect(getGpuSelectionOverlaySurfaceLayouts(sources)).toEqual([
      {
        height: 30,
        surfaceId: "gpu-user-selection",
        width: 50,
        x: 8,
        y: 11,
        zIndex: 90_000,
      },
      {
        height: 80,
        surfaceId: "gpu-nodes-selection",
        width: 120,
        x: 10,
        y: 20,
        zIndex: 90_001,
      },
    ]);
  });

  it("renders selection anchors inside the canvas source subtree", () => {
    const markup = renderToStaticMarkup(
      <canvas>
        <GpuSelectionOverlaySurfaceLayer sources={selectionSources()} />
      </canvas>,
    );

    expect(markup).toContain('data-gpu-flow-source-id="gpu-user-selection"');
    expect(markup).toContain('data-gpu-flow-source-id="gpu-nodes-selection"');
    expect(markup).not.toContain("data-gpu-flow-selection-layer");
    expect(markup).not.toContain("data-gpu-flow-nodes-selection-rect");
    expect(markup).not.toContain("setta-gpu-flow__nodes-selection-rect");
  });

  it("mounts selection affordances as retained canvas surface sources", async () => {
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
    const onSelectionDraw = vi.fn();

    try {
      await act(async () => {
        root.render(
          <GpuSelectionOverlaySurfaceLayer
            onSelectionDraw={onSelectionDraw}
            sources={selectionSources()}
          />,
        );
      });

      const userSource = host.querySelector<HTMLElement>(
        '[data-testid="gpu-user-selection-source"]',
      );
      const nodesSource = host.querySelector<HTMLElement>(
        '[data-testid="gpu-nodes-selection-source"]',
      );
      const userCanvas = host.querySelector<HTMLCanvasElement>(
        '[data-testid="gpu-selection-canvas-gpu-user-selection"]',
      );
      const nodesCanvas = host.querySelector<HTMLCanvasElement>(
        '[data-testid="gpu-selection-canvas-gpu-nodes-selection"]',
      );

      expect(userSource?.dataset.gpuFlowSelectionSource).toBe("true");
      expect(userSource?.dataset.gpuFlowSelectionKind).toBe("user-selection");
      expect(userSource?.style.width).toBe("50px");
      expect(userSource?.style.height).toBe("30px");
      expect(nodesSource?.dataset.gpuFlowSelectionSource).toBe("true");
      expect(nodesSource?.dataset.gpuFlowSelectionKind).toBe("nodes-selection");
      expect(nodesSource?.dataset.id).toBe("section-a");
      expect(nodesSource?.style.width).toBe("120px");
      expect(nodesSource?.style.height).toBe("80px");
      expect(userCanvas?.dataset.gpuFlowSelectionCanvas).toBe("true");
      expect(userCanvas?.width).toBe(50);
      expect(userCanvas?.height).toBe(30);
      expect(nodesCanvas?.dataset.gpuFlowSelectionCanvas).toBe("true");
      expect(nodesCanvas?.width).toBe(120);
      expect(nodesCanvas?.height).toBe(80);
      expect(canvasContext.fillRect).toHaveBeenCalledWith(0, 0, 50, 30);
      expect(canvasContext.strokeRect).toHaveBeenCalledWith(0.5, 0.5, 119, 79);
      expect(canvasContext.setLineDash).toHaveBeenCalledWith([4, 3]);
      expect(onSelectionDraw).toHaveBeenCalledWith("gpu-user-selection");
      expect(onSelectionDraw).toHaveBeenCalledWith("gpu-nodes-selection");
      expect(host.querySelector("[data-gpu-flow-selection-layer]")).toBeNull();
      expect(
        host.querySelector("[data-gpu-flow-nodes-selection-rect]"),
      ).toBeNull();
    } finally {
      await act(async () => {
        root.unmount();
      });
      getContextSpy.mockRestore();
      host.remove();
    }
  });

  it("draws selected-node bounds with retained canvas geometry", () => {
    const context = createMockCanvasContext();

    drawGpuSelectionOverlayCanvas(context, nodesSelectionSource(), {
      darkMode: false,
    });

    expect(context.clearRect).toHaveBeenCalledWith(0, 0, 120, 80);
    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 120, 80);
    expect(context.strokeRect).toHaveBeenCalledWith(0.5, 0.5, 119, 79);
    expect(context.fillStyle).toBe("rgba(0, 89, 220, 0.08)");
    expect(context.strokeStyle).toBe("rgba(0, 89, 220, 0.8)");
  });
});

type MockCanvasContext = CanvasRenderingContext2D & {
  readonly clearRect: ReturnType<typeof vi.fn>;
  readonly fillRect: ReturnType<typeof vi.fn>;
  readonly setLineDash: ReturnType<typeof vi.fn>;
  readonly setTransform: ReturnType<typeof vi.fn>;
  readonly strokeRect: ReturnType<typeof vi.fn>;
};

function createMockCanvasContext(): MockCanvasContext {
  return {
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    fillStyle: "",
    lineWidth: 0,
    restore: vi.fn(),
    save: vi.fn(),
    setLineDash: vi.fn(),
    setTransform: vi.fn(),
    strokeRect: vi.fn(),
    strokeStyle: "",
  } as unknown as MockCanvasContext;
}

function selectionSources(): readonly GpuSelectionOverlaySource[] {
  return [
    {
      height: 30,
      kind: "user-selection",
      localRect: { height: 30, width: 50, x: 0, y: 0 },
      surfaceId: "gpu-user-selection",
      width: 50,
      x: 8,
      y: 11,
      zIndex: 90_000,
    },
    nodesSelectionSource(),
  ];
}

function nodesSelectionSource(): GpuSelectionOverlaySource {
  return {
    height: 80,
    kind: "nodes-selection",
    localRect: { height: 80, width: 120, x: 0, y: 0 },
    primaryNodeId: "section-a",
    surfaceId: "gpu-nodes-selection",
    width: 120,
    x: 10,
    y: 20,
    zIndex: 90_001,
  };
}
