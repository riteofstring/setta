import { Point } from "pixi.js";

import { labelVisibilityModeForZoom } from "./pixi-renderer-label-visibility";
import { countNodeOutlineGraphics } from "./pixi-renderer-node-geometry";
import {
  cameraState,
  countMapValues,
  frameSampleStats,
  interactivePortsForNode,
  portWorldPosition,
  samplePixiVisualState,
  totalDisplayObjectCount,
  visibleDisplayObjectCount,
} from "./pixi-renderer-helpers";

export function createWorkflowGraphDebugSnapshot({
  app,
  backgroundColor,
  debugSurfaceId,
  edges,
  loadedNodeLabelFont,
  nodeBodies,
  nodeContainers,
  nodeLabels,
  nodeLabelFontSizeModes,
  nodeLabelVisibilityReasons,
  nodeGeometryContextCounts,
  nodeOutlines,
  nodes,
  nodeShadows,
  portVisuals,
  reactRenderCount,
  recentFrameMs,
  renderState,
  requireNodeLabel,
  spatialQueries,
  viewport,
}) {
  return ({ includeVisual = true } = {}) => {
    const canvasLayout = workflowGraphCanvasLayoutMetrics(app.canvas, {
      height: app.renderer.screen.height,
      width: app.renderer.screen.width,
    });
    const visual = includeVisual
      ? samplePixiVisualState(app.renderer, app.stage, backgroundColor)
      : skippedVisualState();
    const camera = cameraState(viewport);
    const nodeGeometryContexts = nodeGeometryContextCounts();
    const frameStats = frameSampleStats(recentFrameMs);
    const state = renderState();
    return {
      camera,
      canvas: {
        bottom: canvasLayout.bottom,
        clientHeight: canvasLayout.clientHeight,
        clientWidth: canvasLayout.clientWidth,
        height: app.canvas.height,
        left: canvasLayout.left,
        right: canvasLayout.right,
        top: canvasLayout.top,
        width: app.canvas.width,
      },
      graph: {
        edgeCount: edges.length,
        edges: edges.map((edge) => ({
          id: edge.id,
          diagnostic: edge.diagnostic ?? null,
          label: edge.label ?? "",
          sourceNodeId: edge.sourceNodeId,
          sourcePortId: edge.sourcePortId,
          targetNodeId: edge.targetNodeId,
          targetPortId: edge.targetPortId,
        })),
        nodeCount: nodes.length,
        nodes: nodes.map((node) => {
          const screen = viewport.toScreen(node.x + node.width / 2, node.y + node.height / 2);
          const label = requireNodeLabel(node.id);
          const labelGlobal = label.getGlobalPosition(new Point());
          return {
            id: node.id,
            diagnostic: node.diagnostic ?? null,
            height: node.height,
            label: {
              eventMode: label.eventMode,
              fontDistanceFieldRange: loadedNodeLabelFont.distanceField.range,
              fontDistanceFieldType: loadedNodeLabelFont.distanceField.type,
              fontFamily: label.style.fontFamily,
              fontSize: label.style.fontSize,
              fontSizeMode: nodeLabelFontSizeModes.get(node.id) ?? "normal",
              globalX: labelGlobal.x,
              globalY: labelGlobal.y,
              kind: "bitmap-text",
              screenX: label.x,
              screenY: label.y,
              scaleX: label.scale.x,
              scaleY: label.scale.y,
              text: label.text,
              visible: label.visible,
              visibilityReason: nodeLabelVisibilityReasons.get(node.id) ?? "zoom-hidden",
              worldScaleX: label.worldTransform.a,
              worldScaleY: label.worldTransform.d,
            },
            ports: interactivePortsForNode(node).map((port) => {
              const world = portWorldPosition(node, port.id);
              const portScreen = viewport.toScreen(world.x, world.y);
              return {
                id: port.id,
                label: port.label ?? "",
                role: port.role,
                screenX: portScreen.x,
                screenY: portScreen.y,
                x: world.x,
                y: world.y,
              };
            }),
            screenX: screen.x,
            screenY: screen.y,
            width: node.width,
            x: node.x,
            y: node.y,
          };
        }),
        workflow: state.workflow,
      },
      interaction: {
        drawingEdge: state.drawingEdge,
        drawingMarquee: state.drawingMarquee,
        selectedNodeId: state.selectedNodeId,
        selectedNodeIds: [...state.selectedNodeIds],
      },
      render: {
        averageFrameMs: frameStats.average,
        cameraUpdateCount: state.cameraUpdateCount,
        canvasCreationCount: state.canvasCreationCount,
        edgeCommitCount: state.edgeCommitCount,
        edgeGraphicsCount: 1,
        edgeRedrawCount: state.edgeRedrawCount,
        frameCount: state.frameCount,
        gridDrawCount: state.gridDrawCount,
        graphUpdateCount: state.graphUpdateCount,
        graphUpdateEdgeAddCount: state.graphUpdateEdgeAddCount,
        graphUpdateEdgeRemoveCount: state.graphUpdateEdgeRemoveCount,
        graphUpdateEdgeUpdateCount: state.graphUpdateEdgeUpdateCount,
        graphUpdateNodeAddCount: state.graphUpdateNodeAddCount,
        graphUpdateNodeRemoveCount: state.graphUpdateNodeRemoveCount,
        graphUpdateNodeUpdateCount: state.graphUpdateNodeUpdateCount,
        compactSelectedLabelCount: countMapValues(nodeLabelFontSizeModes, "compact-selected"),
        labelObjectCount: nodeLabels.size,
        labelSyncCount: state.labelSyncCount,
        labelVisibilityMode: labelVisibilityModeForZoom(camera.zoom),
        marqueeUpdateCount: state.marqueeUpdateCount,
        nodeBodyContextCount: nodeGeometryContexts.body,
        nodeBodyGraphicsCount: nodeBodies.size,
        nodeContainerCount: nodeContainers.size,
        nodeDragUpdateCount: state.nodeDragUpdateCount,
        nodeOutlineContextCount: nodeGeometryContexts.outline,
        nodeOutlineGraphicsCount: countNodeOutlineGraphics(nodeOutlines),
        nodeOutlineVisibilityUpdateCount: state.nodeOutlineVisibilityUpdateCount,
        nodeShadowContextCount: nodeGeometryContexts.shadow,
        nodeShadowGraphicsCount: nodeShadows.size,
        pointerPanUpdateCount: state.pointerPanUpdateCount,
        portGraphicsCount: portVisuals.size,
        reactRenderCount: reactRenderCount(),
        rendererResizeCount: state.rendererResizeCount,
        rendererDestroyCount: state.rendererDestroyCount,
        rendererInstanceId: state.rendererInstanceId,
        frozen: state.frozen,
        recentFrameMs: [...recentFrameMs],
        selectionChangeCount: state.selectionChangeCount,
        ...spatialQueries.debugSnapshot(),
        temporaryEdgeUpdateCount: state.temporaryEdgeUpdateCount,
        tickerFramesWhileFrozen: state.tickerFramesWhileFrozen,
        totalDisplayObjectCount: totalDisplayObjectCount(app.stage),
        visibleLabelCount: visibleDisplayObjectCount(nodeLabels.values()),
        wheelPanUpdateCount: state.wheelPanUpdateCount,
        wheelZoomUpdateCount: state.wheelZoomUpdateCount,
        worstFrameMs: frameStats.worst,
      },
      surfaceId: debugSurfaceId,
      visual,
    };
  };
}

export function workflowGraphCanvasLayoutMetrics(canvas, fallbackScreenSize = null) {
  const canvasRect = canvas.getBoundingClientRect();
  const canvasMetrics = {
    bottom: canvasRect.bottom,
    clientHeight: canvas.clientHeight,
    clientWidth: canvas.clientWidth,
    left: canvasRect.left,
    right: canvasRect.right,
    top: canvasRect.top,
  };
  if (canvasMetrics.clientWidth > 0 && canvasMetrics.clientHeight > 0) {
    return canvasMetrics;
  }

  const parent = canvas.parentElement;
  if (!parent) {
    return canvasMetricsWithFallbackScreenSize(canvasMetrics, fallbackScreenSize);
  }
  const parentRect = parent.getBoundingClientRect();
  const parentClientWidth = parent.clientWidth || Math.round(parentRect.width);
  const parentClientHeight = parent.clientHeight || Math.round(parentRect.height);
  if (parentClientWidth <= 0 || parentClientHeight <= 0) {
    return canvasMetricsWithFallbackScreenSize(canvasMetrics, fallbackScreenSize);
  }

  return {
    bottom: parentRect.bottom,
    clientHeight: parentClientHeight,
    clientWidth: parentClientWidth,
    left: parentRect.left,
    right: parentRect.right,
    top: parentRect.top,
  };
}

function canvasMetricsWithFallbackScreenSize(canvasMetrics, fallbackScreenSize) {
  if (
    fallbackScreenSize === null ||
    fallbackScreenSize.width <= 0 ||
    fallbackScreenSize.height <= 0
  ) {
    return canvasMetrics;
  }
  return {
    bottom: canvasMetrics.top + fallbackScreenSize.height,
    clientHeight: fallbackScreenSize.height,
    clientWidth: fallbackScreenSize.width,
    left: canvasMetrics.left,
    right: canvasMetrics.left + fallbackScreenSize.width,
    top: canvasMetrics.top,
  };
}

function skippedVisualState() {
  return {
    hasNonBackgroundPixels: false,
    nonBackgroundPixelCount: 0,
    sampledColorCount: 0,
    sampledPixelCount: 0,
    skipped: true,
  };
}
