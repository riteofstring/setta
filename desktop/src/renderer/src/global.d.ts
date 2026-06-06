import type { SettaAPI } from "@shared/types";

interface PixiWorkspaceDebugSnapshot {
  canvas: {
    clientHeight: number;
    clientWidth: number;
    height: number;
    width: number;
  };
  camera: {
    x: number;
    y: number;
    zoom: number;
  };
  graph: {
    edgeCount: number;
    edges: Array<{
      id: string;
      sourceNodeId: string;
      sourcePortId: string;
      targetNodeId: string;
      targetPortId: string;
    }>;
    nodeCount: number;
    nodes: Array<{
      height: number;
      id: string;
      label: {
        eventMode: string;
        fontDistanceFieldRange: number;
        fontDistanceFieldType: "msdf";
        fontFamily: string;
        fontSize: number;
        fontSizeMode: "normal" | "compact-selected";
        globalX: number;
        globalY: number;
        kind: "bitmap-text";
        screenX: number;
        screenY: number;
        scaleX: number;
        scaleY: number;
        text: string;
        visible: boolean;
        visibilityReason:
          | "selected"
          | "visible-priority"
          | "all-visible"
          | "outside-viewport"
          | "zoom-hidden"
          | "decluttered";
        worldScaleX: number;
        worldScaleY: number;
      };
      ports: Array<{
        id: string;
        role: "source" | "target";
        screenX: number;
        screenY: number;
        x: number;
        y: number;
      }>;
      screenX: number;
      screenY: number;
      width: number;
      x: number;
      y: number;
    }>;
  };
  interaction: {
    drawingEdge: boolean;
    drawingMarquee: boolean;
    selectedNodeId: string | null;
    selectedNodeIds: string[];
  };
  render: {
    averageFrameMs: number;
    cameraUpdateCount: number;
    edgeCommitCount: number;
    edgeGraphicsCount: number;
    edgeRedrawCount: number;
    frameCount: number;
    compactSelectedLabelCount: number;
    gridDrawCount: number;
    labelObjectCount: number;
    labelSyncCount: number;
    labelVisibilityMode: "selected" | "visible-priority" | "all-visible";
    lastLabelVisibilityCandidateCount: number;
    lastMarqueeCandidateCount: number;
    lastNodeHitCandidateCount: number;
    lastPortHitCandidateCount: number;
    marqueeUpdateCount: number;
    nodeBodyContextCount: number;
    nodeBodyGraphicsCount: number;
    nodeContainerCount: number;
    nodeDragUpdateCount: number;
    nodeOutlineContextCount: number;
    nodeOutlineGraphicsCount: number;
    nodeOutlineVisibilityUpdateCount: number;
    nodeShadowContextCount: number;
    nodeShadowGraphicsCount: number;
    pointerPanUpdateCount: number;
    portGraphicsCount: number;
    reactRenderCount: number;
    recentFrameMs: number[];
    selectionChangeCount: number;
    spatialIndexCandidateCount: number;
    spatialIndexNodeCount: number;
    spatialIndexQueryCount: number;
    spatialIndexRebuildCount: number;
    spatialIndexUpdateCount: number;
    temporaryEdgeUpdateCount: number;
    totalPixiDisplayObjectCount: number;
    visibleLabelCount: number;
    wheelPanUpdateCount: number;
    wheelZoomUpdateCount: number;
    worstFrameMs: number;
  };
  visual: {
    hasNonBackgroundPixels: boolean;
    nonBackgroundPixelCount: number;
    sampledColorCount: number;
    sampledPixelCount: number;
  };
}

interface PixiWorkspaceDebugApi {
  getSnapshot: () => PixiWorkspaceDebugSnapshot;
}

declare global {
  interface Window {
    __settaPixiWorkspaceDebug?: PixiWorkspaceDebugApi;
    setta: SettaAPI;
  }
}

export {};
