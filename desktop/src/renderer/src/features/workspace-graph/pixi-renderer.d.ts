export interface WorkflowGraphNode {
  activity?: {
    active: boolean;
    count: number;
    kind: string;
  } | null;
  color: number;
  connectable?: boolean;
  diagnostic?: WorkflowGraphDiagnostic | null;
  height: number;
  id: string;
  layer?: "semantic" | "workflow";
  label: string;
  ports?: WorkflowGraphPort[];
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
  layer?: "semantic" | "workflow";
  label?: string;
  sourceNodeId: string;
  sourcePortId: string;
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

interface CreateWorkflowGraphRendererOptions {
  abortSignal?: AbortSignal;
  debugEnabled: boolean;
  debugSurfaceId?: string;
  graph?: WorkflowGraphGraph;
  host: HTMLElement;
  initialCameraState?: WorkflowGraphCameraState | null;
  onCanvasContextMenu?: (menu: WorkflowGraphCanvasContextMenu) => void;
  onCameraStateChange?: (camera: WorkflowGraphCameraState) => void;
  onEdgeCreate?: (connection: WorkflowGraphEdgeConnection) => void;
  onNodeDelete?: (nodeIds: string[]) => void;
  onNodeOpen?: (nodeId: string) => void;
  onNodePositionsChange?: (positions: WorkflowGraphNodePosition[]) => void;
  onNodeSelectionChange?: (nodeIds: string[]) => void;
  reactRenderCount: () => number;
}

export interface WorkflowGraphRenderer {
  cameraState: () => WorkflowGraphCameraState;
  destroy: () => void;
}

export function createWorkflowGraphRenderer(
  options: CreateWorkflowGraphRendererOptions,
): Promise<WorkflowGraphRenderer>;
