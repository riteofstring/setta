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

interface CreatePixiWorkspaceRendererOptions {
  debugEnabled: boolean;
  graph?: PixiWorkspaceGraph;
  host: HTMLElement;
  reactRenderCount: () => number;
}

interface PixiWorkspaceRenderer {
  destroy: () => void;
}

export function createPixiWorkspaceRenderer(
  options: CreatePixiWorkspaceRendererOptions,
): Promise<PixiWorkspaceRenderer>;
