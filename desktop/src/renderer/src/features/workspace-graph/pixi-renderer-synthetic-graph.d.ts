import type {
  WorkflowGraphEdgeStatus,
  WorkflowGraphNodeStatus,
  WorkflowNodeKind,
} from "@generated/backend";

interface WorkflowGraphSyntheticGraphOptions {
  edgesPerNode: number;
  nodeCount: number;
  scene?: "semantic-cells" | "workflow";
}

interface WorkflowGraphSyntheticNode {
  activity?: {
    active: boolean;
    count: number;
    kind: string;
  } | null;
  color: number;
  connectable?: boolean;
  dismissed?: boolean;
  height: number;
  id: string;
  kind?: WorkflowNodeKind;
  layer: "semantic" | "workflow";
  label: string;
  mergedIntoNodeId?: string;
  promoted?: boolean;
  splitFromNodeId?: string;
  splitIntoNodeIds?: string[];
  status?: WorkflowGraphNodeStatus;
  width: number;
  x: number;
  y: number;
}

interface WorkflowGraphSyntheticEdge {
  alpha?: number;
  color?: number;
  id: string;
  layer: "semantic" | "workflow";
  label?: string;
  sourceNodeId: string;
  sourcePortId: string;
  status?: WorkflowGraphEdgeStatus;
  targetNodeId: string;
  targetPortId: string;
  width?: number;
}

interface WorkflowGraphSyntheticGraph {
  edges: WorkflowGraphSyntheticEdge[];
  nodes: WorkflowGraphSyntheticNode[];
}

export function createSyntheticWorkflowGraph(
  options: WorkflowGraphSyntheticGraphOptions,
): WorkflowGraphSyntheticGraph;
