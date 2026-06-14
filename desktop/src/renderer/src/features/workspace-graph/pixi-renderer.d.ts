import type {
  SemanticWorkingSetPulseKind,
  WorkflowGraphEdgeStatus,
  WorkflowGraphNodeStatus,
  WorkflowNodeKind,
} from "@generated/backend";

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
  /** Semantic-only lineage id in renderer namespace, or "" when unset. */
  mergedIntoNodeId?: string;
  ports?: WorkflowGraphPort[];
  /** Semantic-only renderer flag. */
  promoted?: boolean;
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
}

export interface WorkflowGraphCameraState {
  x: number;
  y: number;
  zoom: number;
}

export interface WorkflowGraphNodePosition {
  moved: boolean;
  nodeId: string;
  x: number;
  y: number;
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
  onCanvasContextMenu?: ((menu: WorkflowGraphCanvasContextMenu) => void) | null;
  onCameraStateChange?: (camera: WorkflowGraphCameraState) => void;
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
  graph?: WorkflowGraphGraph;
  host: HTMLElement;
  initialCameraState?: WorkflowGraphCameraState | null;
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
  cameraState: () => WorkflowGraphCameraState;
  destroy: () => void;
  setHandlers: (handlers: WorkflowGraphRendererHandlers) => void;
  updateGraph: (graph: WorkflowGraphGraph) => void;
}

export function createWorkflowGraphRenderer(
  options: CreateWorkflowGraphRendererOptions,
): Promise<WorkflowGraphRenderer>;
