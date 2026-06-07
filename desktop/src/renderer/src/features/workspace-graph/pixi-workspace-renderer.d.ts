interface PixiWorkspaceNode {
  color: number;
  height: number;
  id: string;
  label: string;
  width: number;
  x: number;
  y: number;
}

interface PixiWorkspaceEdge {
  id: string;
  sourceNodeId: string;
  sourcePortId: string;
  targetNodeId: string;
  targetPortId: string;
}

interface PixiWorkspaceGraph {
  edges: PixiWorkspaceEdge[];
  nodes: PixiWorkspaceNode[];
  workflow?: {
    definitionId: string;
    definitionName: string;
    executionId: string;
    executionStatus: string;
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

interface CreatePixiWorkspaceRendererOptions {
  debugEnabled: boolean;
  debugSurfaceId?: string;
  graph?: PixiWorkspaceGraph;
  host: HTMLElement;
  initialCameraState?: PixiWorkspaceCameraState | null;
  onCanvasContextMenu?: (menu: PixiWorkspaceCanvasContextMenu) => void;
  onNodePositionsChange?: (positions: PixiWorkspaceNodePosition[]) => void;
  reactRenderCount: () => number;
}

export interface PixiWorkspaceRenderer {
  cameraState: () => PixiWorkspaceCameraState;
  destroy: () => void;
}

export function createPixiWorkspaceRenderer(
  options: CreatePixiWorkspaceRendererOptions,
): Promise<PixiWorkspaceRenderer>;
