import type {
  SemanticRuntimeModelAudit,
  SemanticContextSourceRefs,
  SemanticWorkingSetPulseKind,
  SemanticWorkingSetStatus,
  WorkflowGraphEdgeStatus,
  WorkflowGraphNodeStatus,
  WorkflowNodeKind,
} from "@generated/backend";
import type { WorkspaceTrajectoryFrameSnapshot } from "./workspace-trajectory-store";

export interface WorkflowGraphRuntimeIndicator {
  hiddenSourceCount: number;
  modelAudits: WorkflowGraphRuntimeModelAudit[];
  patchIds: string[];
  pulseCount: number;
  recentPulses: WorkflowGraphRuntimePulse[];
  runIds: string[];
  sourceCount: number;
  sourceRefs: SemanticContextSourceRefs[];
  status: SemanticWorkingSetStatus;
  statusCounts: WorkflowGraphRuntimeStatusCount[];
  windowIds: string[];
}

export type WorkflowGraphRuntimeModelAudit = SemanticRuntimeModelAudit;

export interface WorkflowGraphRuntimePulse {
  id: string;
  kind: SemanticWorkingSetPulseKind;
  patchId: string;
  publicSummary: string;
  runId: string;
  sourceRefs: SemanticContextSourceRefs;
  status: SemanticWorkingSetStatus;
  targetEntityId: string;
  windowId: string;
}

export interface WorkflowGraphRuntimeStatusCount {
  count: number;
  status: SemanticWorkingSetStatus;
}

export interface WorkflowGraphNode {
  activity?: {
    active: boolean;
    count: number;
    kind: string;
    pulseKind?: SemanticWorkingSetPulseKind;
  } | null;
  color: number;
  connectable?: boolean;
  diagnostic?: WorkflowGraphDiagnostic | null;
  /** Semantic-only renderer flag; merged nodes are also treated as dismissed by projections. */
  dismissed?: boolean;
  executionCount?: number;
  height: number;
  id: string;
  /** Workflow-only node kind. Semantic kind is pre-resolved into color. */
  kind?: WorkflowNodeKind;
  layer: "semantic" | "workflow";
  label: string;
  movementOwner?: WorkflowGraphNodeMovementOwner | null;
  /** Semantic-only lineage id in renderer namespace, or "" when unset. */
  mergedIntoNodeId?: string;
  ports?: WorkflowGraphPort[];
  /** Semantic-only renderer flag. */
  promoted?: boolean;
  /** Workflow-only aggregate semantic runtime indicator for the node. */
  runtime?: WorkflowGraphRuntimeIndicator | null;
  /** Semantic-only visual role. Committed cells are durable graph state; the others are live working-set projections. */
  semanticRole?: "committed" | "preview" | "source_pulse";
  /** Semantic-only pulse source from SemanticWorkingSet. */
  semanticPulseKind?: SemanticWorkingSetPulseKind;
  /** Semantic-only lineage id in renderer namespace, or "" when unset. */
  splitFromNodeId?: string;
  /** Semantic-only lineage ids in renderer namespace. */
  splitIntoNodeIds?: string[];
  /** Workflow-only node status. */
  status?: WorkflowGraphNodeStatus;
  width: number;
  x: number;
  y: number;
}

export type WorkflowGraphNodeMovementOwner =
  | { kind: "semantic_layout" }
  | { kind: "synthetic_layout" }
  | { kind: "workflow_definition_layout" }
  | { kind: "workflow_view_layout" };

export interface WorkflowGraphPort {
  id: string;
  label: string;
  role: "source" | "target";
  xOffset: number;
  yRatio: number;
}

export interface WorkflowGraphEdge {
  alpha?: number;
  color?: number;
  diagnostic?: WorkflowGraphDiagnostic | null;
  id: string;
  layer: "semantic" | "workflow";
  label?: string;
  sourceNodeId: string;
  sourcePortId: string;
  /** Workflow-only edge status. Semantic edge kind is pre-resolved into color. */
  status?: WorkflowGraphEdgeStatus;
  /** Semantic-only pulse source from SemanticWorkingSet. */
  semanticPulseKind?: SemanticWorkingSetPulseKind;
  targetNodeId: string;
  targetPortId: string;
  width?: number;
}

export interface WorkflowGraphDiagnostic {
  codes: string[];
  count: number;
  severity: "error" | "warning";
}

export interface WorkflowGraphGraph {
  edges: WorkflowGraphEdge[];
  nodes: WorkflowGraphNode[];
  workflow?: {
    definitionId: string;
    definitionName: string;
    definitionVersionId: string;
    definitionVersionNumber: number;
    draftRevision: string;
    editable: boolean;
    executionId: string;
    executionStatus: string;
    versionMismatch: boolean;
    viewMode: "draft" | "version" | "run";
    workspaceId: string;
  } | null;
  workflowRuntimeByNodeId?: Record<string, WorkflowGraphRuntimeIndicator>;
}

export interface WorkflowGraphCameraState {
  x: number;
  y: number;
  zoom: number;
}

export interface WorkflowGraphCameraChange {
  cameraMotion: "moving" | "settled";
  interactionKind: string;
}

export interface WorkflowGraphActivitySpriteTarget {
  anchorNodeId: string;
  chatRunId: string;
  clientX: number;
  clientY: number;
  height: number;
  kind: string;
  runItemId: string;
  screenX: number;
  screenY: number;
  spriteId: string;
  status: string;
  width: number;
  workspaceId: string;
  workflowExecutionId: string;
  workflowNodeExecutionId: string;
  workflowNodeId: string;
}

export interface WorkflowGraphNodePosition {
  moved: boolean;
  nodeId: string;
  x: number;
  y: number;
}

export interface WorkflowGraphNodePositionSaveSettlement {
  nodeIds: string[];
  status: "failed" | "persisted" | "skipped";
}

interface WorkflowGraphCanvasContextMenu {
  clientX: number;
  clientY: number;
  worldX: number;
  worldY: number;
}

export interface WorkflowGraphEdgeConnection {
  sourceNodeId: string;
  sourcePortId: string;
  targetNodeId: string;
  targetPortId: string;
}

export interface WorkflowGraphRendererHandlers {
  onActivitySpriteClick?: ((target: WorkflowGraphActivitySpriteTarget) => void) | null;
  onCanvasContextMenu?: ((menu: WorkflowGraphCanvasContextMenu) => void) | null;
  onCameraStateChange?: (
    camera: WorkflowGraphCameraState,
    change?: WorkflowGraphCameraChange,
  ) => void;
  onEdgeCreate?: (connection: WorkflowGraphEdgeConnection) => void;
  onEdgeDelete?: (edgeIds: string[]) => void;
  onEdgeSelectionChange?: (edgeIds: string[]) => void;
  onNodeDelete?: (nodeIds: string[]) => void;
  onNodeOpen?: ((nodeId: string) => void) | null;
  onNodePositionsChange?: (positions: WorkflowGraphNodePosition[]) => void;
  onNodeSelectionChange?: (nodeIds: string[]) => void;
  reactRenderCount?: () => number;
}

interface CreateWorkflowGraphRendererOptions {
  abortSignal?: AbortSignal;
  animationEnabled?: boolean;
  debugEnabled: boolean;
  debugSurfaceId?: string;
  graph: WorkflowGraphGraph;
  host: HTMLElement;
  initialCameraState?: WorkflowGraphCameraState | null;
  onActivitySpriteClick?: WorkflowGraphRendererHandlers["onActivitySpriteClick"];
  onCanvasContextMenu?: WorkflowGraphRendererHandlers["onCanvasContextMenu"];
  onCameraStateChange?: WorkflowGraphRendererHandlers["onCameraStateChange"];
  onEdgeCreate?: WorkflowGraphRendererHandlers["onEdgeCreate"];
  onEdgeDelete?: WorkflowGraphRendererHandlers["onEdgeDelete"];
  onEdgeSelectionChange?: WorkflowGraphRendererHandlers["onEdgeSelectionChange"];
  onNodeDelete?: WorkflowGraphRendererHandlers["onNodeDelete"];
  onNodeOpen?: WorkflowGraphRendererHandlers["onNodeOpen"];
  onNodePositionsChange?: WorkflowGraphRendererHandlers["onNodePositionsChange"];
  onNodeSelectionChange?: WorkflowGraphRendererHandlers["onNodeSelectionChange"];
  reactRenderCount?: WorkflowGraphRendererHandlers["reactRenderCount"];
  reduceMotion?: boolean;
}

export interface WorkflowGraphRenderer {
  activate: () => void;
  cameraState: () => WorkflowGraphCameraState;
  destroy: () => void;
  isCameraMoving: () => boolean;
  resize: () => void;
  setHandlers: (handlers: WorkflowGraphRendererHandlers) => void;
  settleNodePositionSave: (settlement: WorkflowGraphNodePositionSaveSettlement) => void;
  suspend: () => void;
  transferHost: (host: HTMLElement) => void;
  updateTrajectoryRuntime: (frame: WorkspaceTrajectoryFrameSnapshot) => void;
  updateGraph: (graph: WorkflowGraphGraph) => void;
}

export function createWorkflowGraphRenderer(
  options: CreateWorkflowGraphRendererOptions,
): Promise<WorkflowGraphRenderer>;
