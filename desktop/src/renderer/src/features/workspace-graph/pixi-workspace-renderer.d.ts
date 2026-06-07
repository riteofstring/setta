interface PixiWorkspaceNode {
  color: number;
  diagnostic?: PixiWorkspaceDiagnostic | null;
  height: number;
  id: string;
  label: string;
  ports?: PixiWorkspacePort[];
  width: number;
  x: number;
  y: number;
}

interface PixiWorkspacePort {
  id: string;
  label: string;
  role: "source" | "target";
  xOffset: number;
  yRatio: number;
}

interface PixiWorkspaceEdge {
  diagnostic?: PixiWorkspaceDiagnostic | null;
  id: string;
  label?: string;
  sourceNodeId: string;
  sourcePortId: string;
  targetNodeId: string;
  targetPortId: string;
}

interface PixiWorkspaceDiagnostic {
  codes: string[];
  count: number;
  severity: "error" | "warning";
}

interface PixiWorkspaceGraph {
  edges: PixiWorkspaceEdge[];
  nodes: PixiWorkspaceNode[];
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

export interface PixiWorkspaceCameraState {
  x: number;
  y: number;
  zoom: number;
}

interface PixiWorkspaceNodePosition {
  nodeId: string;
  x: number;
  y: number;
}

interface PixiWorkspaceCanvasContextMenu {
  clientX: number;
  clientY: number;
  worldX: number;
  worldY: number;
}

export interface PixiWorkspaceEdgeConnection {
  sourceNodeId: string;
  sourcePortId: string;
  targetNodeId: string;
  targetPortId: string;
}

interface CreatePixiWorkspaceRendererOptions {
  debugEnabled: boolean;
  debugSurfaceId?: string;
  graph?: PixiWorkspaceGraph;
  host: HTMLElement;
  initialCameraState?: PixiWorkspaceCameraState | null;
  onCanvasContextMenu?: (menu: PixiWorkspaceCanvasContextMenu) => void;
  onEdgeCreate?: (connection: PixiWorkspaceEdgeConnection) => void;
  onNodeDelete?: (nodeIds: string[]) => void;
  onNodeOpen?: (nodeId: string) => void;
  onNodePositionsChange?: (positions: PixiWorkspaceNodePosition[]) => void;
  onNodeSelectionChange?: (nodeIds: string[]) => void;
  reactRenderCount: () => number;
}

export interface PixiWorkspaceRenderer {
  cameraState: () => PixiWorkspaceCameraState;
  destroy: () => void;
}

export function createPixiWorkspaceRenderer(
  options: CreatePixiWorkspaceRendererOptions,
): Promise<PixiWorkspaceRenderer>;
