import type {
  SemanticGraph,
  SemanticLayoutPosition,
  WorkflowGraphProjection,
} from "@generated/backend";

import { semanticLayoutPositionInputsFromRendererPositions } from "./semantic-graph-projection";
import { workflowGraphWithNodeLayout, type WorkflowLayoutPosition } from "./workflow-graph-layout";

export async function persistGraphNodePositions({
  positions,
  semanticGraph,
  setWorkflowEditorError,
  updateSemanticLayoutPositions,
  workflowProjection,
}: {
  positions: WorkflowLayoutPosition[];
  semanticGraph: SemanticGraph | null;
  setWorkflowEditorError: (message: string) => void;
  updateSemanticLayoutPositions: (positions: SemanticLayoutPosition[]) => void;
  workflowProjection: WorkflowGraphProjection | null;
}) {
  const semanticError = await persistSemanticNodePositionsResult({
    positions,
    semanticGraph,
    updateSemanticLayoutPositions,
  });
  if (semanticError !== "") {
    setWorkflowEditorError(semanticError);
    return;
  }
  const workflowError = await persistWorkflowNodePositions({
    positions,
    workflowProjection,
  });
  if (workflowError !== "") {
    setWorkflowEditorError(workflowError);
  }
}

async function persistSemanticNodePositions({
  positions,
  semanticGraph,
  updateSemanticLayoutPositions,
}: {
  positions: WorkflowLayoutPosition[];
  semanticGraph: SemanticGraph | null;
  updateSemanticLayoutPositions: (positions: SemanticLayoutPosition[]) => void;
}) {
  if (semanticGraph === null) {
    return;
  }
  const semanticPositions = semanticLayoutPositionInputsFromRendererPositions({
    positions,
    semanticGraph,
  });
  if (semanticPositions.length === 0) {
    return;
  }
  const updated = await window.setta.semanticGraph.updateLayoutPositions({
    positions: semanticPositions,
    workspaceId: semanticGraph.workspaceId,
  });
  updateSemanticLayoutPositions(updated.positions);
}

async function persistSemanticNodePositionsResult({
  positions,
  semanticGraph,
  updateSemanticLayoutPositions,
}: {
  positions: WorkflowLayoutPosition[];
  semanticGraph: SemanticGraph | null;
  updateSemanticLayoutPositions: (positions: SemanticLayoutPosition[]) => void;
}) {
  try {
    await persistSemanticNodePositions({
      positions,
      semanticGraph,
      updateSemanticLayoutPositions,
    });
    return "";
  } catch (error: unknown) {
    return layoutPersistenceErrorMessage(error, "Semantic layout update failed");
  }
}

async function persistWorkflowNodePositions({
  positions,
  workflowProjection,
}: {
  positions: WorkflowLayoutPosition[];
  workflowProjection: WorkflowGraphProjection | null;
}) {
  if (workflowProjection === null) {
    return "";
  }
  const workflowNodeIds = new Set(workflowProjection.nodes.map((node) => node.id));
  const workflowPositions = positions.filter((position) => workflowNodeIds.has(position.nodeId));
  if (!workflowPositions.some((position) => position.moved) || !workflowProjection.editable) {
    return "";
  }
  try {
    const definition = await window.setta.workflow.readDefinition(
      workflowProjection.workspaceId,
      workflowProjection.definitionId,
    );
    const graph = workflowGraphWithNodeLayout(definition.graph, workflowPositions);
    await window.setta.workflow.updateDefinition(
      workflowProjection.workspaceId,
      definition.id,
      definition.name,
      definition.description,
      graph,
    );
    return "";
  } catch (error: unknown) {
    return layoutPersistenceErrorMessage(error, "Workflow layout update failed");
  }
}

function layoutPersistenceErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}
