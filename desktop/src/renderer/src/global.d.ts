import type { SettaAPI } from "@shared/types";

interface WorkflowGraphDebugSnapshot {
  canvas: {
    bottom: number;
    clientHeight: number;
    clientWidth: number;
    height: number;
    left: number;
    right: number;
    top: number;
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
      label: string;
      layer: "semantic" | "workflow";
      sourceNodeId: string;
      sourcePortId: string;
      status: string;
      targetNodeId: string;
      targetPortId: string;
    }>;
    nodeCount: number;
    nodes: Array<{
      dismissed: boolean;
      height: number;
      id: string;
      kind: string;
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
      layer: "semantic" | "workflow";
      mergedIntoNodeId: string;
      ports: Array<{
        id: string;
        label: string;
        role: "source" | "target";
        screenX: number;
        screenY: number;
        x: number;
        y: number;
      }>;
      screenX: number;
      screenY: number;
      splitFromNodeId: string;
      splitIntoNodeIds: string[];
      status: string;
      promoted: boolean;
      width: number;
      x: number;
      y: number;
    }>;
    workflow: {
      definitionId: string;
      definitionName: string;
      definitionVersionId: string;
      definitionVersionNumber: number;
      editable: boolean;
      executionId: string;
      executionStatus: string;
      versionMismatch: boolean;
      viewMode: "draft" | "version" | "run";
      workspaceId: string;
    } | null;
  };
  interaction: {
    drawingEdge: boolean;
    drawingMarquee: boolean;
    selectedEdgeId: string | null;
    selectedEdgeIds: string[];
    selectedNodeId: string | null;
    selectedNodeIds: string[];
  };
  render: {
    activeEdgeFlowCount: number;
    activeNodePulseCount: number;
    averageFrameMs: number;
    animationActive: boolean;
    animationEnabled: boolean;
    cameraUpdateCount: number;
    cellAnimCount: number;
    edgeCommitCount: number;
    edgeFlowRedrawCount: number;
    edgeGraphicsCount: number;
    edgeRedrawCount: number;
    edgeSelectionChangeCount: number;
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
    nodePulseRedrawCount: number;
    nodeOutlineContextCount: number;
    nodeOutlineGraphicsCount: number;
    nodeOutlineVisibilityUpdateCount: number;
    nodeShadowContextCount: number;
    nodeShadowGraphicsCount: number;
    pointerPanUpdateCount: number;
    portGraphicsCount: number;
    reactRenderCount: number;
    reduceMotion: boolean;
    recentFrameMs: number[];
    selectionChangeCount: number;
    spatialIndexCandidateCount: number;
    spatialIndexNodeCount: number;
    spatialIndexQueryCount: number;
    spatialIndexRebuildCount: number;
    spatialIndexUpdateCount: number;
    temporaryEdgeUpdateCount: number;
    totalDisplayObjectCount: number;
    transitionsActive: number;
    visibleLabelCount: number;
    wheelPanUpdateCount: number;
    wheelZoomUpdateCount: number;
    worstFrameMs: number;
  };
  surfaceId: string;
  visual: {
    hasNonBackgroundPixels: boolean;
    nonBackgroundPixelCount: number;
    sampledColorCount: number;
    sampledPixelCount: number;
  };
}

interface WorkflowGraphDebugApi {
  __renderers: Map<string, () => WorkflowGraphDebugSnapshot>;
  getSnapshot: (surfaceId?: string) => WorkflowGraphDebugSnapshot;
  getSnapshots: () => Record<string, WorkflowGraphDebugSnapshot>;
  getSurfaceIds: () => string[];
}

declare global {
  interface Window {
    __settaWorkflowGraphDebug?: WorkflowGraphDebugApi;
    setta: SettaAPI;
  }
}

export {};
