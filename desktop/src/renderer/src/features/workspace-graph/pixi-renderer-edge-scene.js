import {
  edgeLevelOfDetailForZoom,
  redrawWorkspaceEdgeHighlights,
  redrawWorkspaceEdges,
} from "./pixi-renderer-edge-rendering";
import { viewportWorldBoundsForScreen } from "./pixi-renderer-helpers";

export function createWorkflowGraphEdgeSceneRenderer({
  debugMetrics,
  edgeGraphics,
  edgeHighlightGraphics,
  edgeLabelLayer,
  edgeSelection,
  edges,
  fontFamily,
  fontSize,
  getNode,
  hoveredNodeIds,
  sceneVisitCounters = null,
  sceneGraph,
  selectedNodeIds,
  validateGlyphs,
  viewport,
}) {
  let lastDrawnEdgeCount = 0;
  let lastDrawnEdgeLabelCount = 0;
  let lastEdgeLevelOfDetail = edgeLevelOfDetailForZoom(viewport.scaled);

  return {
    debugSnapshot,
    edgeLevelOfDetailChanged,
    redrawEdgeHighlights,
    redrawEdges,
  };

  function debugSnapshot() {
    return {
      edgeLevelOfDetail: lastEdgeLevelOfDetail,
      lastDrawnEdgeCount,
      lastDrawnEdgeLabelCount,
    };
  }

  function edgeLevelOfDetailChanged() {
    return edgeLevelOfDetailForZoom(viewport.scaled) !== lastEdgeLevelOfDetail;
  }

  function redrawEdges() {
    const edgeScene = currentEdgeRenderScene();
    const edgeDraw = redrawWorkspaceEdges({
      debugMetrics,
      edgeGraphics,
      edgeLevelOfDetail: edgeScene.edgeLevelOfDetail,
      edgeLabelLayer,
      edges,
      fontFamily,
      fontSize,
      getNode,
      sceneVisitCounters,
      validateGlyphs,
      visibleNodeIds: edgeScene.visibleNodeIds,
      viewportWorldBounds: edgeScene.viewportWorldBounds,
    });
    lastDrawnEdgeCount = edgeDraw.drawnEdgeCount;
    lastDrawnEdgeLabelCount = edgeDraw.drawnEdgeLabelCount;
    lastEdgeLevelOfDetail = edgeDraw.edgeLevelOfDetail;
    redrawEdgeHighlights();
  }

  function redrawEdgeHighlights() {
    const edgeScene = currentEdgeRenderScene();
    redrawWorkspaceEdgeHighlights({
      edgeHighlightGraphics,
      edgeLevelOfDetail: edgeScene.edgeLevelOfDetail,
      edges,
      getNode,
      hoveredEdgeIds: edgeSelection.hoveredEdgeIds,
      hoveredNodeIds,
      sceneVisitCounters,
      selectedEdgeIds: edgeSelection.selectedEdgeIds,
      selectedNodeIds,
      visibleNodeIds: edgeScene.visibleNodeIds,
      viewportWorldBounds: edgeScene.viewportWorldBounds,
    });
  }

  function currentEdgeRenderScene() {
    return {
      edgeLevelOfDetail: edgeLevelOfDetailForZoom(viewport.scaled),
      viewportWorldBounds: viewportWorldBoundsForScreen(viewport, 512),
      visibleNodeIds: sceneGraph.materializedNodeIds(),
    };
  }
}
