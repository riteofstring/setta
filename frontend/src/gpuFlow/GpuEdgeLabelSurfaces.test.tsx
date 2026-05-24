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
import type { GpuEdgeSceneLabel } from "./edges/edgeSources";
import {
  drawGpuEdgeLabelCanvas,
  getGpuEdgeLabelSourceStyle,
  GpuEdgeLabelSurfaceLayer,
  toGpuEdgeLabelSurfaceLayout,
} from "./GpuEdgeLabelSurfaces";

describe("GpuEdgeLabelSurfaceLayer", () => {
  it("maps edge-scene label geometry to renderer-owned surface layouts", () => {
    expect(toGpuEdgeLabelSurfaceLayout(workflowLabel())).toEqual({
      actorKind: "edge-label",
      height: 20,
      surfaceId: "workflow-source-activation:workflow-a",
      width: 96,
      x: 152,
      y: 70,
      zIndex: 7,
    });
    expect(getGpuEdgeLabelSourceStyle(dataEdgeLabel())).toEqual({
      height: 18,
      width: 59.5,
    });
  });

  it("renders label anchors inside the canvas source subtree", () => {
    const markup = renderToStaticMarkup(
      <canvas>
        <GpuEdgeLabelSurfaceLayer labels={[workflowLabel(), dataEdgeLabel()]} />
      </canvas>,
    );

    expect(markup).toContain(
      'data-gpu-flow-source-id="workflow-source-activation:workflow-a"',
    );
    expect(markup).toContain(
      'data-gpu-flow-source-id="data-edge-label:data-edge-a"',
    );
    expect(markup).not.toContain("setta-gpu-flow__edge-label");
    expect(markup).not.toContain("data-gpu-flow-edge-label-layer");
  });

  it("mounts typed edge labels as retained canvas surface sources", async () => {
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
    const onLabelDraw = vi.fn();

    try {
      await act(async () => {
        root.render(
          <GpuEdgeLabelSurfaceLayer
            labels={[workflowLabel(), dataEdgeLabel()]}
            onLabelDraw={onLabelDraw}
          />,
        );
      });

      const workflowSource = mustQueryHTMLElement(
        host,
        '[data-testid="gpu-edge-label-source-workflow-source-activation:workflow-a"]',
      );
      const dataSource = mustQueryHTMLElement(
        host,
        '[data-testid="gpu-edge-label-source-data-edge-label:data-edge-a"]',
      );
      const workflowLabelCanvas = mustQueryHTMLCanvasElement(
        host,
        '[data-testid="gpu-edge-label-canvas-workflow-source-activation:workflow-a"]',
      );
      const dataLabelCanvas = mustQueryHTMLCanvasElement(
        host,
        '[data-testid="gpu-edge-label-canvas-data-edge-label:data-edge-a"]',
      );

      expect(workflowSource.dataset.gpuFlowEdgeLabelSource).toBe("true");
      expect(workflowSource.dataset.edgeid).toBe("workflow-a");
      expect(workflowSource.style.width).toBe("96px");
      expect(workflowSource.style.height).toBe("20px");
      expect(workflowLabelCanvas.dataset.gpuFlowEdgeLabelCanvas).toBe("true");
      expect(workflowLabelCanvas.dataset.edgeid).toBe("workflow-a");
      expect(workflowLabelCanvas.width).toBe(96);
      expect(workflowLabelCanvas.height).toBe(20);
      expect(dataSource.dataset.gpuFlowEdgeLabelSource).toBe("true");
      expect(dataSource.dataset.edgeid).toBe("data-edge-a");
      expect(dataSource.style.width).toBe("59.5px");
      expect(dataSource.style.height).toBe("18px");
      expect(dataLabelCanvas.dataset.gpuFlowEdgeLabelCanvas).toBe("true");
      expect(dataLabelCanvas.dataset.edgeid).toBe("data-edge-a");
      expect(dataLabelCanvas.width).toBe(60);
      expect(dataLabelCanvas.height).toBe(18);
      expect(canvasContext.fillText).toHaveBeenCalledWith(
        "src count >= 3",
        48,
        10,
      );
      expect(canvasContext.fillText).toHaveBeenCalledWith("payload", 29.75, 9);
      expect(onLabelDraw).toHaveBeenCalledWith(
        "workflow-source-activation:workflow-a",
      );
      expect(onLabelDraw).toHaveBeenCalledWith("data-edge-label:data-edge-a");
      expect(host.querySelector(".setta-gpu-flow__edge-label")).toBeNull();
      expect(host.querySelector("[data-gpu-flow-edge-label-layer]")).toBeNull();
    } finally {
      await act(async () => {
        root.unmount();
      });
      getContextSpy.mockRestore();
      host.remove();
    }
  });

  it("draws edge labels with scene-owned text and theme colors", () => {
    const context = createMockCanvasContext();

    drawGpuEdgeLabelCanvas(context, dataEdgeLabel(), { darkMode: true });

    expect(context.clearRect).toHaveBeenCalledWith(0, 0, 59.5, 18);
    expect(context.fillText).toHaveBeenCalledWith("payload", 29.75, 9);
    expect(context.fillStyle).toBe("rgb(226, 232, 240)");
    expect(context.strokeStyle).toBe("rgba(148, 163, 184, 0.35)");
  });
});

type MockCanvasContext = CanvasRenderingContext2D & {
  readonly clearRect: ReturnType<typeof vi.fn>;
  readonly fillText: ReturnType<typeof vi.fn>;
  readonly setTransform: ReturnType<typeof vi.fn>;
};

function createMockCanvasContext(): MockCanvasContext {
  return {
    beginPath: vi.fn(),
    clearRect: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    fillStyle: "",
    fillText: vi.fn(),
    font: "",
    lineTo: vi.fn(),
    lineWidth: 0,
    moveTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    restore: vi.fn(),
    save: vi.fn(),
    setTransform: vi.fn(),
    stroke: vi.fn(),
    strokeStyle: "",
    textAlign: "start",
    textBaseline: "alphabetic",
  } as unknown as MockCanvasContext;
}

function workflowLabel(): GpuEdgeSceneLabel {
  return {
    edgeId: "workflow-a",
    height: 20,
    id: "workflow-source-activation:workflow-a",
    kind: "workflow-source-activation",
    text: "src count >= 3",
    width: 96,
    x: 200,
    y: 80,
    zIndex: 7,
  };
}

function dataEdgeLabel(): GpuEdgeSceneLabel {
  return {
    edgeId: "data-edge-a",
    height: 18,
    id: "data-edge-label:data-edge-a",
    kind: "data-edge-label",
    text: "payload",
    width: 59.5,
    x: 140,
    y: 60,
    zIndex: 3,
  };
}
