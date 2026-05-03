import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { GpuEdgeScene } from "../edges/edgeSources";
import { createGpuFlowLayoutStore } from "../layoutStore";
import { createGpuRetainedRowContentScene } from "../retainedContentScene";
import type {
  GpuContentSurface,
  GpuFlowScene,
  GpuSectionSceneNode,
} from "../scene";
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
        scene={sceneWithRetainedContentSurface()}
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
    const retainedContentSourceIndex = markup.indexOf(
      'data-gpu-flow-source-id="dict-a:param-content:unpinned"',
    );
    const canvasCloseIndex = markup.indexOf("</canvas>");

    expect(canvasOpenIndex).toBeGreaterThan(-1);
    expect(sourcePortalIndex).toBeGreaterThan(canvasOpenIndex);
    expect(sourcePortalIndex).toBeLessThan(canvasCloseIndex);
    expect(edgeLabelSourceIndex).toBeGreaterThan(canvasOpenIndex);
    expect(edgeLabelSourceIndex).toBeLessThan(canvasCloseIndex);
    expect(retainedContentSourceIndex).toBeGreaterThan(canvasOpenIndex);
    expect(retainedContentSourceIndex).toBeLessThan(canvasCloseIndex);
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

  it("renders drag preview affordances from the layout store", () => {
    const layoutStore = createGpuFlowLayoutStore({
      nodes: [
        {
          height: 80,
          interactionFlags: { dragging: true },
          nodeId: "dragging-node",
          width: 120,
          x: 10,
          y: 20,
        },
      ],
    });
    layoutStore.getState().setDragPreview({
      draggedNodeIds: ["dragging-node"],
      dropMarker: {
        axis: "y",
        childNodeId: "dragging-node",
        index: 2,
        parentNodeId: "parent-node",
        rect: { height: 4, width: 180, x: 12, y: 96 },
      },
    });

    const markup = renderToStaticMarkup(
      <GpuFlow
        layoutStore={layoutStore}
        renderNode={(node) => <div data-rendered-node={node.nodeId} />}
        viewportStore={createGpuFlowViewportStore({
          transform: [4, 8, 1.5],
        })}
      />,
    );

    expect(markup).toContain('data-gpu-flow-drag-preview-layer="true"');
    expect(markup).toContain('data-gpu-flow-drop-marker="true"');
    expect(markup).toContain('data-gpu-flow-drop-marker-parent="parent-node"');
    expect(markup).toContain('data-gpu-flow-drag-preview-node="dragging-node"');
    expect(markup).toContain("translate(4px, 8px) scale(1.5)");
  });

  it("prefers subscribed layout store nodes over scene snapshot nodes", () => {
    const layoutStore = createGpuFlowLayoutStore({
      nodes: [
        {
          height: 80,
          nodeId: "live-node-a",
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
        scene={sceneWithSection("scene-node-a")}
        viewportStore={createGpuFlowViewportStore({
          transform: [0, 0, 1],
        })}
      />,
    );

    expect(markup).toContain('data-gpu-flow-source-id="live-node-a"');
    expect(markup).not.toContain('data-gpu-flow-source-id="scene-node-a"');
  });

  it("renders scene DOM islands through the supplied renderer", () => {
    const markup = renderToStaticMarkup(
      <GpuFlow
        renderDomIsland={(island) => (
          <div data-rendered-dom-island={island.id} />
        )}
        scene={sceneWithDomIsland()}
        viewportStore={createGpuFlowViewportStore({
          transform: [4, 8, 1.5],
        })}
      />,
    );

    expect(markup).toContain('data-gpu-flow-dom-island="true"');
    expect(markup).toContain('data-gpu-flow-dom-island-id="island-a"');
    expect(markup).toContain(
      'data-gpu-flow-dom-island-kind="retained-content-control"',
    );
    expect(markup).toContain('class="setta-gpu-flow__dom-island nodrag nopan"');
    expect(markup).toContain('data-rendered-dom-island="island-a"');
    expect(markup).toContain("left:19px");
    expect(markup).toContain("top:38px");
    expect(markup).toContain("transform:scale(1.5)");
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

function sceneWithRetainedContentSurface(): GpuFlowScene {
  return {
    contentSurfaces: [retainedContentSurface()],
    domIslands: [],
    edges: [],
    revision: 1,
    sections: [],
  };
}

function retainedContentSurface(): GpuContentSurface {
  const rect = { height: 120, width: 240, x: 10, y: 20 };
  return {
    clipRect: rect,
    id: "dict-a:param-content:unpinned",
    ownerSectionId: "dict-a",
    rect,
    renderer: {
      kind: "canvas-content",
      surfaceId: "dict-a:param-content:unpinned",
    },
    retainedScene: createGpuRetainedRowContentScene({
      id: "dict-a:param-content:unpinned",
      ownerSectionId: "dict-a",
      rowHeight: 28,
      rows: [
        {
          control: textLikeControlDescriptor(),
          controlKind: "text-like",
          depth: 0,
          id: "param-a",
          label: "Param A",
        },
      ],
      scrollOffset: { x: 0, y: 0 },
      viewportRect: { height: rect.height, width: rect.width, x: 0, y: 0 },
    }),
    zIndex: 2,
  };
}

function textLikeControlDescriptor() {
  return {
    defaultDisplayValue: "",
    displayValue: "",
    editorKind: "text" as const,
    kind: "text-like" as const,
    rendererFamily: "text-like",
    commitPolicy: "native-island" as const,
  };
}

function sceneWithSection(sectionId: string): GpuFlowScene {
  return {
    contentSurfaces: [],
    domIslands: [],
    edges: [],
    revision: 1,
    sections: [sectionSceneNode(sectionId)],
  };
}

function sceneWithDomIsland(): GpuFlowScene {
  return {
    contentSurfaces: [],
    domIslands: [
      {
        clipOwnerId: "surface-a",
        contentRect: { height: 20, width: 40, x: 0, y: 0 },
        id: "island-a",
        kind: "retained-content-control",
        ownerSectionId: "section-a",
        rect: { height: 20, width: 40, x: 10, y: 20 },
        source: {
          hitRecordId: "control:param-a",
          kind: "retained-content",
          ownerRowId: "param-a",
          surfaceId: "surface-a",
        },
        zIndex: 9,
      },
    ],
    edges: [],
    revision: 1,
    sections: [],
  };
}

function sectionSceneNode(sectionId: string): GpuSectionSceneNode {
  const rect = {
    height: 80,
    width: 120,
    x: 10,
    y: 20,
  };
  return {
    ...rect,
    bodyRect: rect,
    childLayout: { gap: { x: 0, y: 0 } },
    childSectionIds: [],
    childViewportRect: null,
    chromeRect: rect,
    clipRect: rect,
    contentRenderer: {
      kind: "dom-section",
      surfaceId: sectionId,
    },
    dirty: [],
    interactionLayer: "content",
    layoutMode: "none",
    localRect: rect,
    nodeId: sectionId,
    parentSectionId: null,
    portAnchors: [],
    resizePolicy: {
      aspectRatio: false,
      aspectRatioExtraHeight: 0,
      aspectRatioExtraWidth: 0,
      directions: ["right", "bottom", "bottomRight"],
      locked: false,
      maxHeight: 100_000,
      maxWidth: 100_000,
      minHeight: 0,
      minWidth: 0,
    },
    scrollOffset: { x: 0, y: 0 },
    sectionId,
    worldRect: rect,
  };
}
