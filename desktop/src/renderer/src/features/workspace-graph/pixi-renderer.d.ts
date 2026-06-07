interface WorkflowGraphNode {
  color: number;
  diagnostic?: WorkflowGraphDiagnostic | null;
  height: number;
  id: string;
  label: string;
  ports?: WorkflowGraphPort[];
  width: number;
  x: number;
  y: number;
}

interface WorkflowGraphPort {
  id: string;
  label: string;
  role: "source" | "target";
  xOffset: number;
  yRatio: number;
}

interface WorkflowGraphEdge {
  diagnostic?: WorkflowGraphDiagnostic | null;
  id: string;
  label?: string;
  sourceNodeId: string;
  sourcePortId: string;
  targetNodeId: string;
  targetPortId: string;
}

interface WorkflowGraphDiagnostic {
  codes: string[];
  count: number;
  severity: "error" | "warning";
}

interface WorkflowGraphGraph {
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

interface WorkflowGraphNodePosition {
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
