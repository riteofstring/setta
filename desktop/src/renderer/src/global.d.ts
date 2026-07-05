import type { SettaAPI } from "@shared/types";
import type {
  ChatTranscriptScrollDebugSnapshot,
  ScrollToIndexLocation,
} from "./components/chat-transcript-scroll-follow";
import type {
  WorkspaceActivityDebugApi,
  WorkspaceActivityDebugSnapshot,
} from "./features/workspace-graph/workspace-activity-debug-registry";
import type { WorkspaceFrameMetrics } from "./workspace-layout/types";

interface WorkflowGraphDebugSnapshot {
  activity: WorkspaceActivityDebugSnapshot;
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
        label: string;
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
    panningCamera: boolean;
    selectedNodeId: string | null;
    selectedNodeIds: string[];
  };
  render: {
    activityChipTextObjectCount: number;
    activityChipViewCount: number;
    activityMarkerGraphicsCount: number;
    averageFrameMs: number;
    cameraUpdateCount: number;
    canvasCreationCount: number;
    edgeCommitCount: number;
    edgeGraphicsCount: number;
    edgeRedrawCount: number;
    frameCount: number;
    frozen: boolean;
    compactSelectedLabelCount: number;
    gridDrawCount: number;
    graphUpdateCameraMovingCount: number;
    graphUpdateCount: number;
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
    pixiAppCreationCount: number;
    pointerPanUpdateCount: number;
    portGraphicsCount: number;
    reactRenderCount: number;
    rendererResizeCount: number;
    rendererDestroyCount: number;
    rendererInstanceId: string;
    rendererLayerCreationCount: number;
    recentFrameMs: number[];
    selectionChangeCount: number;
    spatialIndexCandidateCount: number;
    spatialIndexNodeCount: number;
    spatialIndexQueryCount: number;
    spatialIndexRebuildCount: number;
    spatialIndexUpdateCount: number;
    temporaryEdgeUpdateCount: number;
    tickerFramesWhileFrozen: number;
    totalDisplayObjectCount: number;
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
  visualGrammar: {
    activityChipLayout: {
      config: {
        maxVisibleChipsPerNode: number;
        maxVisibleChipViews: number;
        readableTextZoomThreshold: number;
        viewportPadding: number;
      };
      globalOverflowCount: number;
      items: Array<{
        hiddenCount: number;
        id: string;
        label: string;
        layoutMode: "readable" | "compact";
        nodeId: string;
        rank: number;
        type: "marker" | "collapsed";
      }>;
      layoutMode: "readable" | "compact";
      markerCount: number;
      missingAnchorCount: number;
      zoom: number;
    };
    activityChipStatesById: Record<string, unknown>;
    activityChips: Array<{
      activityId: string;
      anchorKind: "workflow_node";
      fullLabel: string;
      height: number;
      hiddenCount: number;
      id: string;
      kind: "workflow_status" | "command" | "file_change" | "approval" | "collapsed";
      label: string;
      layoutMode: "readable" | "compact";
      markerId: string;
      nodeId: string;
      placement: "left" | "right";
      rank: number;
      screenBottom: number;
      screenBounds: {
        bottom: number;
        left: number;
        right: number;
        top: number;
      };
      screenLeft: number;
      screenRight: number;
      screenTop: number;
      screenX: number;
      screenY: number;
      sourceMarkerIds: string[];
      status: string;
      textVisible: boolean;
      type: "marker" | "collapsed";
      visible: boolean;
      visualState: unknown;
      width: number;
      x: number;
      y: number;
    }>;
    activityMarkerStatesById: Record<string, unknown>;
    edgeStatesById: Record<string, unknown>;
    nodeStatesById: Record<string, unknown>;
  };
}

interface WorkflowGraphDebugApi {
  __renderers: Map<string, () => WorkflowGraphDebugSnapshot>;
  getSnapshot: (surfaceId?: string) => WorkflowGraphDebugSnapshot;
  getSnapshots: () => Record<string, WorkflowGraphDebugSnapshot>;
  getSurfaceIds: () => string[];
  tryGetSnapshot: (surfaceId?: string) => WorkflowGraphDebugSnapshot | null;
}

interface WorkflowNodeDetailsDebugApi {
  __surfaces: Map<string, (nodeId: string, nodeExecutionId: string) => boolean>;
  getSurfaceIds: () => string[];
  openNodeDetails: (surfaceId: string, nodeId: string, nodeExecutionId?: string) => boolean;
}

interface WorkflowGraphRuntimeHandle {
  setFocused(focused: boolean): void;
  setFrozen(frozen: boolean): void;
}

interface WorkflowGraphRuntimeApi {
  __handles: Map<string, WorkflowGraphRuntimeHandle>;
  getHandle: (surfaceId: string) => WorkflowGraphRuntimeHandle | null;
}

interface ChatTranscriptScrollDebugApi {
  detach: () => void;
  getSnapshot: () => ChatTranscriptScrollDebugSnapshot;
  jumpToLatest: () => void;
  scrollToIndexAsProgrammaticAnchor: (location: ScrollToIndexLocation) => void;
}

declare global {
  interface Window {
    __settaChatTranscriptScrollDebug?: ChatTranscriptScrollDebugApi;
    __settaWorkspaceReadFrameMetrics?: () => WorkspaceFrameMetrics;
    __settaWorkspaceResetFrameMetrics?: () => void;
    __settaWorkspaceActivityDebug?: WorkspaceActivityDebugApi;
    __settaWorkflowGraphDebug?: WorkflowGraphDebugApi;
    __settaWorkflowNodeDetailsDebug?: WorkflowNodeDetailsDebugApi;
    __settaWorkflowGraphRuntime?: WorkflowGraphRuntimeApi;
    setta: SettaAPI;
  }
}

export {};
