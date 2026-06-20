import type {
  SemanticGraph,
  SemanticLayoutPosition,
  WorkflowGraphNodeLayout,
  WorkflowGraphProjection,
} from "@generated/backend";

import { semanticLayoutPositionInputsFromRendererPositions } from "./semantic-graph-projection";
import type { WorkflowLayoutPosition } from "./workflow-graph-layout";

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
}): Promise<WorkflowGraphProjection | null> {
  const semanticError = await persistSemanticNodePositionsResult({
    positions,
    semanticGraph,
    updateSemanticLayoutPositions,
  });
  if (semanticError !== "") {
    setWorkflowEditorError(semanticError);
    return null;
  }
  const workflowResult = await persistWorkflowNodePositions({
    positions,
    workflowProjection,
  });
  if (workflowResult.error !== "") {
    setWorkflowEditorError(workflowResult.error);
    return null;
  }
  return workflowResult.projection;
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
}): Promise<{ error: string; projection: WorkflowGraphProjection | null }> {
  if (workflowProjection === null) {
    return { error: "", projection: null };
  }
  const workflowNodeIds = new Set(workflowProjection.nodes.map((node) => node.id));
  const workflowPositions = positions.filter((position) => workflowNodeIds.has(position.nodeId));
  if (!workflowPositions.some((position) => position.moved) || !workflowProjection.editable) {
    return { error: "", projection: null };
  }
  try {
    const projection = await window.setta.workflow.updateDefinitionLayout({
      definitionId: workflowProjection.definitionId,
      expectedRevision: workflowProjection.draftRevision,
      positions: workflowLayoutPositionsForBackend(workflowPositions),
      workspaceId: workflowProjection.workspaceId,
    });
    return { error: "", projection };
  } catch (error: unknown) {
    return {
      error: layoutPersistenceErrorMessage(error, "Workflow layout update failed"),
      projection: null,
    };
  }
}

function workflowLayoutPositionsForBackend(
  positions: WorkflowLayoutPosition[],
): WorkflowGraphNodeLayout[] {
  return positions.map((position) => ({
    nodeId: position.nodeId,
    x: Math.round(position.x),
    y: Math.round(position.y),
  }));
}

function layoutPersistenceErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}
