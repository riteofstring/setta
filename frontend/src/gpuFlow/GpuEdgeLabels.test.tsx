/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import "testUtils/reactRefreshPreamble";
import { describe, expect, it } from "vitest";
import {
  getGpuEdgeLabelLayerStyle,
  getGpuEdgeLabelStyle,
  GpuEdgeLabelLayer,
} from "./GpuEdgeLabels";
import type { GpuEdgeSceneLabel } from "./edges/edgeSources";
import { createGpuFlowViewportStore } from "./viewportStore";

describe("GpuEdgeLabelLayer", () => {
  it("aligns edge labels through the GPU viewport transform", () => {
    expect(getGpuEdgeLabelLayerStyle([10, -20, 2])).toEqual({
      transform: "translate(10px, -20px) scale(2)",
    });
    expect(getGpuEdgeLabelStyle(workflowLabel())).toEqual({
      height: 20,
      transform: "translate(152px, 70px)",
      width: 96,
      zIndex: 7,
    });
  });

  it("renders typed edge labels as pointer-transparent overlay content", () => {
    const store = createGpuFlowViewportStore({ transform: [10, -20, 2] });
    const markup = renderToStaticMarkup(
      <GpuEdgeLabelLayer
        labels={[workflowLabel(), dataEdgeLabel()]}
        viewportStore={store}
      />,
    );

    expect(markup).toContain('data-gpu-flow-edge-label-layer="true"');
    expect(markup).toContain(
      'data-testid="gpu-edge-label-workflow-source-activation:workflow-a"',
    );
    expect(markup).toContain('data-edgeid="workflow-a"');
    expect(markup).toContain("src count &gt;= 3");
    expect(markup).toContain(
      'data-testid="gpu-edge-label-data-edge-label:data-edge-a"',
    );
    expect(markup).toContain('data-edgeid="data-edge-a"');
    expect(markup).toContain("payload");
    expect(markup).toContain("translate(10px, -20px) scale(2)");
    expect(markup).toContain("translate(152px, 70px)");
  });

  it("updates viewport transforms without rerendering label content", async () => {
    const store = createGpuFlowViewportStore({ transform: [0, 0, 1] });
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const frameCallbacks: FrameRequestCallback[] = [];
    const originalRequestAnimationFrame = window.requestAnimationFrame;
    const originalCancelAnimationFrame = window.cancelAnimationFrame;
    let renderCount = 0;
    Object.defineProperty(window, "requestAnimationFrame", {
      configurable: true,
      value: (callback: FrameRequestCallback) => {
        frameCallbacks.push(callback);
        return frameCallbacks.length;
      },
    });
    Object.defineProperty(window, "cancelAnimationFrame", {
      configurable: true,
      value: () => undefined,
    });

    function Harness() {
      renderCount += 1;
      return (
        <GpuEdgeLabelLayer labels={[workflowLabel()]} viewportStore={store} />
      );
    }

    try {
      await act(async () => {
        root.render(<Harness />);
      });
      const layer = host.querySelector<HTMLElement>(
        '[data-gpu-flow-edge-label-layer="true"]',
      );
      const label = host.querySelector<HTMLElement>(
        '[data-testid="gpu-edge-label-workflow-source-activation:workflow-a"]',
      );
      expect(layer?.style.transform).toBe("translate(0px, 0px) scale(1)");
      expect(label).not.toBeNull();

      act(() => {
        store.getState().setTransform([25, -15, 1.5]);
      });

      expect(renderCount).toBe(1);
      expect(
        host.querySelector(
          '[data-testid="gpu-edge-label-workflow-source-activation:workflow-a"]',
        ),
      ).toBe(label);

      await act(async () => {
        for (const callback of frameCallbacks.splice(0)) {
          callback(performance.now());
        }
      });

      expect(renderCount).toBe(1);
      expect(layer?.style.transform).toBe("translate(25px, -15px) scale(1.5)");
      expect(
        host.querySelector(
          '[data-testid="gpu-edge-label-workflow-source-activation:workflow-a"]',
        ),
      ).toBe(label);
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
      Object.defineProperty(window, "requestAnimationFrame", {
        configurable: true,
        value: originalRequestAnimationFrame,
      });
      Object.defineProperty(window, "cancelAnimationFrame", {
        configurable: true,
        value: originalCancelAnimationFrame,
      });
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
