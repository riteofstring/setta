import { renderToStaticMarkup } from "react-dom/server";
import type { GpuEdgeScene } from "../edges/edgeSources";
import { createGpuFlowViewportStore } from "../viewportStore";
import { GpuFlow } from "./flowSurface";
import { describe, expect, it } from "vitest";

describe("GpuFlow", () => {
  it("mounts children inside the canvas source subtree before viewport overlays", () => {
    const markup = renderToStaticMarkup(
      <GpuFlow
        edgeScene={edgeSceneWithLabel()}
        viewportStore={createGpuFlowViewportStore({
          transform: [0, 0, 1],
        })}
      >
        <div id="project-owned-portal-root" />
      </GpuFlow>,
    );

    const canvasOpenIndex = markup.indexOf('data-gpu-flow-surface="true"');
    const portalIndex = markup.indexOf('id="project-owned-portal-root"');
    const canvasCloseIndex = markup.indexOf("</canvas>");
    const edgeLabelLayerIndex = markup.indexOf(
      'data-gpu-flow-edge-label-layer="true"',
    );

    expect(canvasOpenIndex).toBeGreaterThan(-1);
    expect(portalIndex).toBeGreaterThan(canvasOpenIndex);
    expect(portalIndex).toBeLessThan(canvasCloseIndex);
    expect(edgeLabelLayerIndex).toBeGreaterThan(canvasCloseIndex);
  });
});

function edgeSceneWithLabel(): GpuEdgeScene {
  return {
    edges: [],
    entries: [],
    hitTestEdges: [],
    labels: [
      {
        edgeId: "edge-a",
        height: 20,
        id: "data-edge-label:edge-a",
        kind: "data-edge-label",
        text: "payload",
        width: 80,
        x: 100,
        y: 50,
      },
    ],
    reconnectAnchors: [],
  };
}
