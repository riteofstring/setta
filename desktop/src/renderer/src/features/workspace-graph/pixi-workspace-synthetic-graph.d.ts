interface PixiWorkspaceSyntheticGraphOptions {
  edgesPerNode: number;
  nodeCount: number;
}

interface PixiWorkspaceSyntheticNode {
  color: number;
  height: number;
  id: string;
  label: string;
  width: number;
  x: number;
  y: number;
}

interface PixiWorkspaceSyntheticEdge {
  id: string;
  sourceNodeId: string;
  sourcePortId: string;
  targetNodeId: string;
  targetPortId: string;
}

interface PixiWorkspaceSyntheticGraph {
  edges: PixiWorkspaceSyntheticEdge[];
  nodes: PixiWorkspaceSyntheticNode[];
}

export function createSyntheticPixiWorkspaceGraph(
  options: PixiWorkspaceSyntheticGraphOptions,
): PixiWorkspaceSyntheticGraph;
