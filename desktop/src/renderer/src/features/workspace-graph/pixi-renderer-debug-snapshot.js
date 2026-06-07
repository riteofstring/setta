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
    const canvasRect = app.canvas.getBoundingClientRect();
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
        bottom: canvasRect.bottom,
        clientHeight: app.canvas.clientHeight,
        clientWidth: app.canvas.clientWidth,
        height: app.canvas.height,
        left: canvasRect.left,
        right: canvasRect.right,
        top: canvasRect.top,
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
        edgeCommitCount: state.edgeCommitCount,
        edgeGraphicsCount: 1,
        edgeRedrawCount: state.edgeRedrawCount,
        frameCount: state.frameCount,
        gridDrawCount: state.gridDrawCount,
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
        recentFrameMs: [...recentFrameMs],
        selectionChangeCount: state.selectionChangeCount,
        ...spatialQueries.debugSnapshot(),
        temporaryEdgeUpdateCount: state.temporaryEdgeUpdateCount,
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

function skippedVisualState() {
  return {
    hasNonBackgroundPixels: false,
    nonBackgroundPixelCount: 0,
    sampledColorCount: 0,
    sampledPixelCount: 0,
    skipped: true,
  };
}
