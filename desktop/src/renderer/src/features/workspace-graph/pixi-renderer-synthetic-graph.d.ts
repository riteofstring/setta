import type {
  WorkflowGraphEdgeStatus,
  WorkflowGraphNodeStatus,
  WorkflowNodeKind,
} from "@generated/backend";

interface WorkflowGraphSyntheticGraphOptions {
  edgesPerNode: number;
  nodeCount: number;
  scene?:
    | "merged"
    | "phase0-dense"
    | "phase0-normal"
    | "phase0-scaling"
    | "phase0-simple"
    | "phase0-stress"
    | "semantic-cells"
    | "workflow"
    | "workflow-running"
    | "workflow-running-runtime";
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
  movementOwner?: { kind: "synthetic_layout" };
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
