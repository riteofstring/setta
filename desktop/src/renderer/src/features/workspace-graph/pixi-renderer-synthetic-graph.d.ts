interface WorkflowGraphSyntheticGraphOptions {
  edgesPerNode: number;
  nodeCount: number;
}

interface WorkflowGraphSyntheticNode {
  color: number;
  height: number;
  id: string;
  label: string;
  width: number;
  x: number;
  y: number;
}

interface WorkflowGraphSyntheticEdge {
  id: string;
  sourceNodeId: string;
  sourcePortId: string;
  targetNodeId: string;
  targetPortId: string;
}

interface WorkflowGraphSyntheticGraph {
  edges: WorkflowGraphSyntheticEdge[];
  nodes: WorkflowGraphSyntheticNode[];
}

export function createSyntheticWorkflowGraph(
  options: WorkflowGraphSyntheticGraphOptions,
): WorkflowGraphSyntheticGraph;
