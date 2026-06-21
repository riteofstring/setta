export const recordingRendererEventChannel = "recording:renderer-event";
export const recordingCartographerAuditSnapshotEventName =
  "setta:record-cartographer-audit-snapshot";
export const recordingWorkflowGraphEventName = "setta:record-workflow-graph-event";
export const recordingWorkflowGraphManualSnapshotEventName = "setta:record-workflow-graph-snapshot";

export const workflowGraphRecordingSchemaVersion = 2;

export type RendererRecordedEvent =
  | RendererClickEvent
  | RendererKeydownEvent
  | RendererSubmitEvent
  | RendererCartographerAuditSnapshotEvent
  | RendererErrorEvent
  | RendererGraphRecordedEvent
  | RendererLayoutSnapshotEvent
  | RendererUnhandledRejectionEvent;

interface RendererRecordedEventBase {
  at: string;
  target?: RendererTargetSummary;
  type: string;
  url: string;
}

interface RendererTargetSummary {
  ariaLabel: string;
  classes: string;
  id: string;
  name: string;
  role: string;
  tag: string;
  text: string;
  type: string;
}

interface RendererClickEvent extends RendererRecordedEventBase {
  button: number;
  type: "click";
}

interface RendererKeydownEvent extends RendererRecordedEventBase {
  altKey: boolean;
  ctrlKey: boolean;
  key: string;
  metaKey: boolean;
  shiftKey: boolean;
  type: "keydown";
}

interface RendererSubmitEvent extends RendererRecordedEventBase {
  type: "submit";
}

interface RendererCartographerAuditSnapshotEvent extends RendererRecordedEventBase {
  snapshot: unknown;
  trigger: string;
  type: "cartographer_audit_snapshot";
  workspaceId: string;
}

interface RendererErrorEvent extends RendererRecordedEventBase {
  message: string;
  source: string;
  type: "error";
}

interface RendererUnhandledRejectionEvent extends RendererRecordedEventBase {
  reason: string;
  type: "unhandledrejection";
}

interface RendererLayoutSnapshotEvent extends RendererRecordedEventBase {
  activeRunStatus: string;
  chatDetailPane: RendererRect | null;
  composer: RendererRect | null;
  queueSize: number;
  selectedConversationId: string;
  transcript: RendererScrollRect | null;
  trigger: string;
  type: "layout_snapshot";
  viewport: {
    height: number;
    width: number;
  };
  visibleTurnIds: string[];
}

export type RendererGraphRecordedEvent =
  | RendererGraphInteractionEvent
  | RendererGraphLayoutSaveEvent
  | RendererGraphReplacementEvent
  | RendererGraphSnapshotEvent;

interface RendererGraphRecordedEventBase extends RendererRecordedEventBase {
  graph: RendererGraphRecordingState;
  surfaceId: string;
}

export interface RendererGraphSnapshotEvent extends RendererGraphRecordedEventBase {
  trigger:
    | "manual"
    | "pointercancel"
    | "pointerup"
    | "wheel_burst_end"
    | "layout_save_started"
    | "layout_save_settled";
  type: "graph_snapshot";
}

export interface RendererGraphInteractionEvent extends RendererGraphRecordedEventBase {
  interaction: {
    affectedNodeIds: string[];
    kind:
      | "activity_sprite"
      | "edge_draw"
      | "marquee"
      | "node_drag"
      | "pointer_pan"
      | "selection"
      | "wheel";
    movementOwner: string;
    movedNodes: RendererGraphMovedNodePosition[];
    phase: "blocked" | "cancel" | "commit" | "start" | "update";
    pointerType: string;
    popoverRunItemId: string;
    reason: string;
    sourceNodeId: string;
    sourcePortId: string;
    spriteChatRunId: string;
    spriteId: string;
    spriteRunItemId: string;
    spriteWorkflowExecutionId: string;
    spriteWorkflowNodeExecutionId: string;
    targetNodeId: string;
    targetPortId: string;
  };
  type: "graph_interaction";
}

export type RendererGraphLayoutSaveOwner =
  | "semantic_layout"
  | "workflow_definition_layout"
  | "workflow_view_layout";

export interface RendererGraphLayoutSaveEvent extends RendererGraphRecordedEventBase {
  layoutSave: {
    affectedNodeIds: string[];
    error: string;
    generation: number;
    owner: RendererGraphLayoutSaveOwner | "multiple" | "none";
    owners: RendererGraphLayoutSaveOwner[];
    phase: "failed" | "skipped" | "started" | "succeeded";
    status: "failed" | "persisted" | "skipped" | "started";
    target: RendererGraphLayoutSaveTarget | null;
  };
  type: "graph_layout_save";
}

export interface RendererGraphLayoutSaveTarget {
  definitionId: string;
  editable: boolean | null;
  executionId: string;
  versionId: string;
  viewLayoutKind: string;
  viewMode: string;
  workspaceId: string;
}

export interface RendererGraphReplacementEvent extends RendererGraphRecordedEventBase {
  replacement: {
    activeInteraction: string;
    graphVersion: number;
    phase: "applied" | "dropped" | "queued";
    reason: string;
  };
  type: "graph_replacement";
}

export interface RendererGraphRecordingState {
  camera: RendererGraphCamera | null;
  counts: RendererGraphRecordingCounts;
  lastLayoutSave: RendererGraphLayoutSaveSummary | null;
  nodes: {
    moved: RendererGraphNodeSummary[];
    selected: RendererGraphNodeSummary[];
    touched: RendererGraphNodeSummary[];
    visible: RendererGraphNodeSummary[];
  };
  pendingLayout: {
    generation: number | null;
    writeCount: number;
  };
  schemaVersion: typeof workflowGraphRecordingSchemaVersion;
  selected: {
    edgeIds: string[];
    nodeIds: string[];
  };
  surfaceId: string;
  timing: RendererGraphTimingSummary | null;
  trajectory: RendererGraphTrajectorySummary;
  truncation: RendererGraphTruncation[];
  visibility: RendererGraphVisibilitySummary;
  workflow: RendererGraphWorkflowSummary | null;
}

interface RendererGraphCamera {
  x: number;
  y: number;
  zoom: number;
}

interface RendererGraphRecordingCounts {
  edges: number;
  materializedNodes: number;
  movedNodes: number;
  nodes: number;
  selectedEdges: number;
  selectedNodes: number;
  trajectorySprites: number;
  visibleNodes: number;
}

export interface RendererGraphLayoutSaveSummary {
  affectedNodeIds: string[];
  error: string;
  generation: number;
  owner: RendererGraphLayoutSaveOwner | "multiple" | "none";
  owners: RendererGraphLayoutSaveOwner[];
  status: "failed" | "persisted" | "skipped" | "started";
}

export interface RendererGraphNodeSummary {
  id: string;
  kind: string;
  labelVisibilityReason: string;
  labelVisible: boolean;
  layer: string;
  materialized: boolean;
  moved: boolean;
  movementOwner: string;
  screenX: number;
  screenY: number;
  selected: boolean;
  status: string;
  visible: boolean;
  x: number;
  y: number;
}

export interface RendererGraphMovedNodePosition {
  movementOwner: string;
  nodeId: string;
  oldX: number;
  oldY: number;
  x: number;
  y: number;
}

export interface RendererGraphTimingSummary {
  averageFrameMs: number | null;
  p95FrameMs: number | null;
  recentFrameMs: number[];
  timingBucketCount: number;
  timingBuckets: Record<string, unknown>;
  timingSampleCount: number;
  timingSamples: unknown[];
  worstFrameMs: number | null;
}

export interface RendererGraphTrajectorySummary {
  anchorSummaries: unknown[];
  anchors: unknown;
  displayCount: number;
  frameRevision: number;
  groupCount: number;
  recentLaneCount: number;
  totalCount: number;
}

export interface RendererGraphTruncation {
  limit: number;
  omitted: number;
  path: string;
  total: number;
}

interface RendererGraphVisibilitySummary {
  edges: RendererGraphVisibilityCategorySummary;
  labels: RendererGraphVisibilityCategorySummary;
  nodes: RendererGraphVisibilityCategorySummary;
  sprites: RendererGraphVisibilityCategorySummary;
}

interface RendererGraphVisibilityCategorySummary {
  hidden: number;
  hiddenReasons: Record<string, number>;
  total: number;
  visible: number;
  visibleReasons: Record<string, number>;
}

export interface RendererGraphWorkflowSummary {
  definitionId: string;
  editable: boolean | null;
  executionId: string;
  versionId: string;
  viewMode: string;
  workspaceId: string;
}

interface RendererRect {
  bottom: number;
  height: number;
  left: number;
  right: number;
  top: number;
  width: number;
}

interface RendererScrollRect extends RendererRect {
  clientHeight: number;
  scrollHeight: number;
}
