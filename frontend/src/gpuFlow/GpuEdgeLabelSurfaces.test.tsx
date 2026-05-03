/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import "testUtils/reactRefreshPreamble";
import { describe, expect, it } from "vitest";
import type { GpuEdgeSceneLabel } from "./edges/edgeSources";
import {
  getGpuEdgeLabelSourceStyle,
  GpuEdgeLabelSurfaceLayer,
  toGpuEdgeLabelSurfaceLayout,
} from "./GpuEdgeLabelSurfaces";

describe("GpuEdgeLabelSurfaceLayer", () => {
  it("maps edge-scene label geometry to renderer-owned surface layouts", () => {
    expect(toGpuEdgeLabelSurfaceLayout(workflowLabel())).toEqual({
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
    expect(markup).not.toContain("data-gpu-flow-edge-label-layer");
  });

  it("mounts typed edge labels as HTML surface sources", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);

    try {
      await act(async () => {
        root.render(
          <GpuEdgeLabelSurfaceLayer
            labels={[workflowLabel(), dataEdgeLabel()]}
          />,
        );
      });

      const workflowSource = host.querySelector<HTMLElement>(
        '[data-testid="gpu-edge-label-source-workflow-source-activation:workflow-a"]',
      );
      const dataSource = host.querySelector<HTMLElement>(
        '[data-testid="gpu-edge-label-source-data-edge-label:data-edge-a"]',
      );
      const workflowLabelElement = host.querySelector<HTMLElement>(
        '[data-testid="gpu-edge-label-workflow-source-activation:workflow-a"]',
      );
      const dataLabelElement = host.querySelector<HTMLElement>(
        '[data-testid="gpu-edge-label-data-edge-label:data-edge-a"]',
      );

      expect(workflowSource?.dataset.gpuFlowEdgeLabelSource).toBe("true");
      expect(workflowSource?.dataset.edgeid).toBe("workflow-a");
      expect(workflowSource?.style.width).toBe("96px");
      expect(workflowSource?.style.height).toBe("20px");
      expect(workflowLabelElement?.textContent).toBe("src count >= 3");
      expect(dataSource?.dataset.gpuFlowEdgeLabelSource).toBe("true");
      expect(dataSource?.dataset.edgeid).toBe("data-edge-a");
      expect(dataSource?.style.width).toBe("59.5px");
      expect(dataSource?.style.height).toBe("18px");
      expect(dataLabelElement?.textContent).toBe("payload");
      expect(host.querySelector("[data-gpu-flow-edge-label-layer]")).toBeNull();
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });
});

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
