import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { GpuEdgeScene } from "../edges/edgeSources";
import { createGpuFlowLayoutStore } from "../layoutStore";
import { createGpuFlowViewportStore } from "../viewportStore";
import { GpuFlow } from "./flowSurface";

describe("GpuFlow", () => {
  it("mounts source-local portals and edge labels inside the canvas source subtree and viewport portals outside it", () => {
    const markup = renderToStaticMarkup(
      <GpuFlow
        edgeScene={edgeSceneWithLabel()}
        portals={[
          {
            className: "project-source-portal",
            coordinateSpace: "source-local",
            id: "project-source-portal-root",
          },
          {
            className: "project-viewport-portal",
            coordinateSpace: "viewport",
            id: "project-viewport-portal-root",
          },
        ]}
        viewportStore={createGpuFlowViewportStore({
          transform: [0, 0, 1],
        })}
      />,
    );

    const canvasOpenIndex = markup.indexOf('data-gpu-flow-surface="true"');
    const sourcePortalIndex = markup.indexOf('id="project-source-portal-root"');
    const viewportPortalIndex = markup.indexOf(
      'id="project-viewport-portal-root"',
    );
    const edgeLabelSourceIndex = markup.indexOf(
      'data-gpu-flow-source-id="data-edge-label:edge-a"',
    );
    const canvasCloseIndex = markup.indexOf("</canvas>");

    expect(canvasOpenIndex).toBeGreaterThan(-1);
    expect(sourcePortalIndex).toBeGreaterThan(canvasOpenIndex);
    expect(sourcePortalIndex).toBeLessThan(canvasCloseIndex);
    expect(edgeLabelSourceIndex).toBeGreaterThan(canvasOpenIndex);
    expect(edgeLabelSourceIndex).toBeLessThan(canvasCloseIndex);
    expect(viewportPortalIndex).toBeGreaterThan(canvasCloseIndex);
    expect(markup).toContain('data-gpu-flow-portal-space="source-local"');
    expect(markup).toContain('data-gpu-flow-portal-space="viewport"');
    expect(markup).not.toContain("data-gpu-flow-edge-label-layer");
  });

  it("renders node source anchors from the layout store", () => {
    const layoutStore = createGpuFlowLayoutStore({
      nodes: [
        {
          height: 80,
          nodeId: "layout-node-a",
          width: 120,
          x: 10,
          y: 20,
        },
      ],
    });

    const markup = renderToStaticMarkup(
      <GpuFlow
        layoutStore={layoutStore}
        renderNode={(node) => <div data-rendered-node={node.nodeId} />}
        viewportStore={createGpuFlowViewportStore({
          transform: [0, 0, 1],
        })}
      />,
    );

    expect(markup).toContain('data-gpu-flow-source-id="layout-node-a"');
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
