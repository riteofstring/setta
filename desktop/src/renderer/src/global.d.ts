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
      materialized: boolean;
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
        materialized: boolean;
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
    cameraDependentSyncFrameCount: number;
    cameraDependentSyncRequiresMovingFrame: boolean;
    cameraDependentSyncScheduled: boolean;
    cameraMoving: boolean;
    cameraMovingLabelHiddenFrameCount: number;
    cameraMovingSyncFrameCount: number;
    cameraSettleDelayMs: number;
    cameraSettleLabelSyncCount: number;
    cameraSettleRestoreFrameCount: number;
    cameraSettledSyncFrameCount: number;
    cameraUpdateCount: number;
    cellAnimCandidateCount: number;
    cellAnimCap: number;
    cellAnimCapped: boolean;
    cellAnimCount: number;
    cellAnimRedrawCount: number;
    edgeCommitCount: number;
    edgeLevelOfDetail: "low" | "medium" | "high";
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
    lastDrawnEdgeCount: number;
    lastDrawnEdgeLabelCount: number;
    lastLabelVisibilityCandidateCount: number;
    lastMarqueeCandidateCount: number;
    lastNodeHitCandidateCount: number;
    lastPortHitCandidateCount: number;
    lastSceneWindowCandidateCount: number;
    lastSceneWindowEnteredCount: number;
    lastSceneWindowExitedCount: number;
    lastSceneWindowVisibleNodeCount: number;
    lastVisibleMaterializedNodeCount: number;
    marqueeUpdateCount: number;
    materializedLabelCount: number;
    materializedNodeCount: number;
    materializedPortCount: number;
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
    nodeViewPoolDestroyCount: number;
    nodeViewPoolHitCount: number;
    nodeViewPoolMissCount: number;
    nodeViewPoolReleaseCount: number;
    p95FrameMs: number;
    pointerPanUpdateCount: number;
    portGraphicsCount: number;
    pooledLabelCount: number;
    pooledNodeViewCount: number;
    reactRenderCount: number;
    reduceMotion: boolean;
    recentFrameMs: number[];
    selectionChangeCount: number;
    semanticTendrilAnimCandidateCount: number;
    semanticTendrilAnimCap: number;
    semanticTendrilAnimCapped: boolean;
    semanticTendrilAnimCount: number;
    semanticTendrilRedrawCount: number;
    sceneWindowChangeCount: number;
    sceneWindowEnterPaddingScreenPx: number;
    sceneWindowExitPaddingScreenPx: number;
    sceneWindowInitialized: boolean;
    sceneWindowSize: number;
    spatialIndexCandidateCount: number;
    spatialIndexNodeCount: number;
    spatialIndexQueryCount: number;
    spatialIndexRebuildCount: number;
    spatialIndexUpdateCount: number;
    timingBuckets: Record<
      string,
      {
        averageMs: number;
        count: number;
        recentMs: number;
        totalMs: number;
        worstMs: number;
      }
    >;
    timingSampleLimit: number;
    timingSamples: Array<{
      at: number;
      bucket: string;
      details?: Record<string, unknown>;
      durationMs: number;
      sequence: number;
    }>;
    temporaryEdgeUpdateCount: number;
    displayObjectCountsByLayer: Record<
      string,
      {
        directChildCount: number;
        totalCount: number;
        visibleCount: number;
      }
    >;
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
  __renderers: Map<string, unknown>;
  getSnapshot: (surfaceId?: string) => WorkflowGraphDebugSnapshot;
  getSnapshots: () => Record<string, WorkflowGraphDebugSnapshot>;
  getSurfaceIds: () => string[];
  releaseAnimationFrame: (surfaceId?: string) => { tickerHeld: false; tickerStarted: boolean };
  renderAnimationFrame: (
    surfaceId?: string,
    options?: { holdTicker?: boolean; now?: number },
  ) => { animationActive: boolean; now: number; tickerHeld: boolean; tickerStarted: boolean };
}

declare global {
  interface Window {
    __settaWorkflowGraphDebug?: WorkflowGraphDebugApi;
    setta: SettaAPI;
  }
}

export {};
