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
  debugMetrics,
  debugSurfaceId,
  displayObjectLayers,
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
    const clearColor = typeof backgroundColor === "function" ? backgroundColor() : backgroundColor;
    const visual = includeVisual
      ? samplePixiVisualState(app.renderer, app.stage, clearColor)
      : skippedVisualState();
    const camera = cameraState(viewport);
    const nodeGeometryContexts = nodeGeometryContextCounts();
    const frameStats = frameSampleStats(recentFrameMs);
    const state = renderState();
    const timing = debugMetrics.snapshot();
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
          layer: edge.layer,
          label: edge.label ?? "",
          sourceNodeId: edge.sourceNodeId,
          sourcePortId: edge.sourcePortId,
          status: edge.status ?? "",
          targetNodeId: edge.targetNodeId,
          targetPortId: edge.targetPortId,
        })),
        nodeCount: nodes.length,
        nodes: nodes.map((node) =>
          nodeDebugSnapshot(node, {
            loadedNodeLabelFont,
            nodeLabelFontSizeModes,
            nodeLabelVisibilityReasons,
            requireNodeLabel,
            viewport,
          }),
        ),
        workflow: state.workflow,
      },
      interaction: {
        drawingEdge: state.drawingEdge,
        drawingMarquee: state.drawingMarquee,
        selectedEdgeId: state.selectedEdgeId,
        selectedEdgeIds: [...state.selectedEdgeIds],
        selectedNodeId: state.selectedNodeId,
        selectedNodeIds: [...state.selectedNodeIds],
      },
      render: {
        activeEdgeFlowCount: state.activeEdgeFlowCount,
        activeNodePulseCount: state.activeNodePulseCount,
        averageFrameMs: frameStats.average,
        animationActive: state.animationActive,
        animationEnabled: state.animationEnabled,
        cameraUpdateCount: state.cameraUpdateCount,
        canvasCreationCount: state.canvasCreationCount,
        cellAnimCandidateCount: state.cellAnimCandidateCount,
        cellAnimCap: state.cellAnimCap,
        cellAnimCapped: state.cellAnimCapped,
        cellAnimCount: state.cellAnimCount,
        cellAnimRedrawCount: state.cellAnimRedrawCount,
        edgeCommitCount: state.edgeCommitCount,
        edgeGraphicsCount: 3,
        edgeFlowRedrawCount: state.edgeFlowRedrawCount,
        edgeRedrawCount: state.edgeRedrawCount,
        edgeSelectionChangeCount: state.edgeSelectionChangeCount,
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
        nodePulseRedrawCount: state.nodePulseRedrawCount,
        nodeOutlineContextCount: nodeGeometryContexts.outline,
        nodeOutlineGraphicsCount: countNodeOutlineGraphics(nodeOutlines),
        nodeOutlineVisibilityUpdateCount: state.nodeOutlineVisibilityUpdateCount,
        nodeShadowContextCount: nodeGeometryContexts.shadow,
        nodeShadowGraphicsCount: nodeShadows.size,
        p95FrameMs: frameStats.p95,
        pointerPanUpdateCount: state.pointerPanUpdateCount,
        portGraphicsCount: portVisuals.size,
        reactRenderCount: reactRenderCount(),
        reduceMotion: state.reduceMotion,
        rendererDestroyCount: state.rendererDestroyCount,
        rendererInstanceId: state.rendererInstanceId,
        recentFrameMs: [...recentFrameMs],
        selectionChangeCount: state.selectionChangeCount,
        semanticTendrilAnimCandidateCount: state.semanticTendrilAnimCandidateCount,
        semanticTendrilAnimCap: state.semanticTendrilAnimCap,
        semanticTendrilAnimCapped: state.semanticTendrilAnimCapped,
        semanticTendrilAnimCount: state.semanticTendrilAnimCount,
        semanticTendrilRedrawCount: state.semanticTendrilRedrawCount,
        ...spatialQueries.debugSnapshot(),
        timingBuckets: timing.timingBuckets,
        timingSampleLimit: timing.timingSampleLimit,
        timingSamples: timing.timingSamples,
        temporaryEdgeUpdateCount: state.temporaryEdgeUpdateCount,
        displayObjectCountsByLayer: displayObjectCountsByLayer(displayObjectLayers),
        totalDisplayObjectCount: totalDisplayObjectCount(app.stage),
        transitionsActive: state.transitionsActive,
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

function nodeDebugSnapshot(
  node,
  {
    loadedNodeLabelFont,
    nodeLabelFontSizeModes,
    nodeLabelVisibilityReasons,
    requireNodeLabel,
    viewport,
  },
) {
  const screen = viewport.toScreen(node.x + node.width / 2, node.y + node.height / 2);
  return {
    id: node.id,
    diagnostic: node.diagnostic ?? null,
    dismissed: node.dismissed ?? false,
    height: node.height,
    kind: node.kind ?? "",
    label: nodeLabelDebugSnapshot(node, {
      loadedNodeLabelFont,
      nodeLabelFontSizeModes,
      nodeLabelVisibilityReasons,
      requireNodeLabel,
    }),
    layer: node.layer,
    mergedIntoNodeId: node.mergedIntoNodeId ?? "",
    ports: nodePortDebugSnapshots(node, viewport),
    promoted: node.promoted ?? false,
    screenX: screen.x,
    screenY: screen.y,
    splitFromNodeId: node.splitFromNodeId ?? "",
    splitIntoNodeIds: node.splitIntoNodeIds ?? [],
    status: node.status ?? "",
    width: node.width,
    x: node.x,
    y: node.y,
  };
}

function nodeLabelDebugSnapshot(
  node,
  { loadedNodeLabelFont, nodeLabelFontSizeModes, nodeLabelVisibilityReasons, requireNodeLabel },
) {
  const label = requireNodeLabel(node.id);
  const labelGlobal = label.getGlobalPosition(new Point());
  return {
    eventMode: label.eventMode,
    fontDistanceFieldRange: loadedNodeLabelFont.distanceField.range,
    fontDistanceFieldType: loadedNodeLabelFont.distanceField.type,
    fontFamily: label.style.fontFamily,
    fontSize: label.style.fontSize,
    fontSizeMode: nodeLabelFontSizeModes.get(node.id) ?? "normal",
    globalX: labelGlobal.x,
    globalY: labelGlobal.y,
    kind: "bitmap-text",
    scaleX: label.scale.x,
    scaleY: label.scale.y,
    screenX: label.x,
    screenY: label.y,
    text: label.text,
    visibilityReason: nodeLabelVisibilityReasons.get(node.id) ?? "zoom-hidden",
    visible: label.visible,
    worldScaleX: label.worldTransform.a,
    worldScaleY: label.worldTransform.d,
  };
}

function nodePortDebugSnapshots(node, viewport) {
  return interactivePortsForNode(node).map((port) => {
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
  });
}

function displayObjectCountsByLayer(layers) {
  return Object.fromEntries(
    Object.entries(layers).map(([name, displayObject]) => [
      name,
      {
        directChildCount: Array.isArray(displayObject.children) ? displayObject.children.length : 0,
        totalCount: totalDisplayObjectCount(displayObject),
        visibleCount: visibleDisplayTreeCount(displayObject),
      },
    ]),
  );
}

function visibleDisplayTreeCount(displayObject) {
  if (!displayObject.visible) {
    return 0;
  }
  let count = 1;
  const children = displayObject.children;
  if (!Array.isArray(children)) {
    return count;
  }
  for (const child of children) {
    count += visibleDisplayTreeCount(child);
  }
  return count;
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
