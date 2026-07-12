import type { WorkflowGraph } from "@generated/backend";

export interface WorkflowLayoutPosition {
  moved?: boolean;
  nodeId: string;
  x: number;
  y: number;
}

export function workflowGraphWithNodeLayout(
  graph: WorkflowGraph,
  positions: WorkflowLayoutPosition[],
): WorkflowGraph {
  const positionByNodeId = new Map(positions.map((position) => [position.nodeId, position]));
  const currentByNodeId = new Map(
    graph.layout.nodes.map((position) => [position.nodeId, position]),
  );
  return {
    ...graph,
    layout: {
      nodes: graph.nodes.flatMap((node) => {
        const position = positionByNodeId.get(node.id) ?? currentByNodeId.get(node.id);
        if (!position) {
          return [];
        }
        return [
          {
            nodeId: node.id,
            x: Math.round(position.x),
            y: Math.round(position.y),
          },
        ];
      }),
    },
  };
}
