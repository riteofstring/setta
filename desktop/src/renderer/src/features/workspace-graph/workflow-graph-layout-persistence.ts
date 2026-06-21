import type {
  SemanticGraph,
  SemanticLayoutPosition,
  WorkflowGraphNodeLayout,
  WorkflowGraphProjection,
  WorkflowGraphViewLayoutTarget,
} from "@generated/backend";

import { semanticLayoutPositionInputsFromRendererPositions } from "./semantic-graph-projection";
import type { WorkflowLayoutPosition } from "./workflow-graph-layout";

type LayoutPersistenceStatus = "persisted" | "skipped" | "failed";

interface SkippedLayoutPersistenceOutcome<Owner extends string> {
  owner: Owner;
  status: "skipped";
}

interface FailedLayoutPersistenceOutcome<Owner extends string> {
  error: string;
  owner: Owner;
  status: "failed";
}

type SemanticLayoutPersistenceOutcome =
  | SkippedLayoutPersistenceOutcome<"semantic_layout">
  | FailedLayoutPersistenceOutcome<"semantic_layout">
  | {
      owner: "semantic_layout";
      positions: SemanticLayoutPosition[];
      status: "persisted";
    };

type WorkflowLayoutPersistenceOwner = "workflow_definition_layout" | "workflow_view_layout";

type WorkflowLayoutPersistenceOutcome =
  | SkippedLayoutPersistenceOutcome<WorkflowLayoutPersistenceOwner>
  | FailedLayoutPersistenceOutcome<WorkflowLayoutPersistenceOwner>
  | {
      owner: "workflow_definition_layout";
      projection: WorkflowGraphProjection;
      status: "persisted";
    }
  | {
      owner: "workflow_view_layout";
      positions: WorkflowGraphNodeLayout[];
      status: "persisted";
    };

export interface GraphNodeLayoutPersistenceOutcome {
  semantic: SemanticLayoutPersistenceOutcome;
  status: LayoutPersistenceStatus;
  workflow: WorkflowLayoutPersistenceOutcome;
}

export function graphNodeLayoutPersistenceErrorMessage(outcome: GraphNodeLayoutPersistenceOutcome) {
  if (outcome.semantic.status === "failed") {
    return outcome.semantic.error;
  }
  if (outcome.workflow.status === "failed") {
    return outcome.workflow.error;
  }
  return "Graph layout update failed";
}

export async function persistGraphNodePositions({
  positions,
  semanticGraph,
  workflowViewLayoutTarget,
  workflowProjection,
}: {
  positions: WorkflowLayoutPosition[];
  semanticGraph: SemanticGraph | null;
  workflowViewLayoutTarget?: WorkflowGraphViewLayoutTarget | null;
  workflowProjection: WorkflowGraphProjection | null;
}): Promise<GraphNodeLayoutPersistenceOutcome> {
  const semantic = await persistSemanticNodePositions({
    positions,
    semanticGraph,
  });
  if (semantic.status === "failed") {
    const workflow: WorkflowLayoutPersistenceOutcome = {
      owner: workflowLayoutPersistenceOwner(workflowProjection),
      status: "skipped",
    };
    return {
      semantic,
      status: graphNodeLayoutPersistenceStatus({ semantic, workflow }),
      workflow,
    };
  }
  const workflow = await persistWorkflowNodePositions({
    positions,
    workflowViewLayoutTarget: workflowViewLayoutTarget ?? null,
    workflowProjection,
  });
  return {
    semantic,
    status: graphNodeLayoutPersistenceStatus({ semantic, workflow }),
    workflow,
  };
}

async function persistSemanticNodePositions({
  positions,
  semanticGraph,
}: {
  positions: WorkflowLayoutPosition[];
  semanticGraph: SemanticGraph | null;
}): Promise<SemanticLayoutPersistenceOutcome> {
  const owner = "semantic_layout";
  if (semanticGraph === null) {
    return { owner, status: "skipped" };
  }
  const semanticPositions = semanticLayoutPositionInputsFromRendererPositions({
    positions,
    semanticGraph,
  });
  if (semanticPositions.length === 0) {
    return { owner, status: "skipped" };
  }
  try {
    const updated = await window.setta.semanticGraph.updateLayoutPositions({
      positions: semanticPositions,
      workspaceId: semanticGraph.workspaceId,
    });
    return {
      owner,
      positions: updated.positions,
      status: "persisted",
    };
  } catch (error: unknown) {
    return {
      error: layoutPersistenceErrorMessage(error, "Semantic layout update failed"),
      owner,
      status: "failed",
    };
  }
}

async function persistWorkflowNodePositions({
  positions,
  workflowViewLayoutTarget,
  workflowProjection,
}: {
  positions: WorkflowLayoutPosition[];
  workflowViewLayoutTarget: WorkflowGraphViewLayoutTarget | null;
  workflowProjection: WorkflowGraphProjection | null;
}): Promise<WorkflowLayoutPersistenceOutcome> {
  const owner = workflowLayoutPersistenceOwner(workflowProjection);
  if (workflowProjection === null) {
    return { owner, status: "skipped" };
  }
  const workflowNodeIds = new Set(workflowProjection.nodes.map((node) => node.id));
  const workflowPositions = positions.filter(
    (position) => position.moved === true && workflowNodeIds.has(position.nodeId),
  );
  if (workflowPositions.length === 0) {
    return { owner, status: "skipped" };
  }
  if (!workflowProjection.editable) {
    return persistWorkflowViewLayoutNodePositions({
      positions: workflowPositions,
      workflowProjection,
      workflowViewLayoutTarget,
    });
  }
  const definitionOwner = "workflow_definition_layout";
  try {
    const projection = await window.setta.workflow.updateDefinitionLayout({
      definitionId: workflowProjection.definitionId,
      expectedRevision: workflowProjection.draftRevision,
      positions: workflowLayoutPositionsForBackend(workflowPositions),
      workspaceId: workflowProjection.workspaceId,
    });
    return {
      owner: definitionOwner,
      projection,
      status: "persisted",
    };
  } catch (error: unknown) {
    return {
      error: layoutPersistenceErrorMessage(error, "Workflow layout update failed"),
      owner: definitionOwner,
      status: "failed",
    };
  }
}

async function persistWorkflowViewLayoutNodePositions({
  positions,
  workflowProjection,
  workflowViewLayoutTarget,
}: {
  positions: WorkflowLayoutPosition[];
  workflowProjection: WorkflowGraphProjection;
  workflowViewLayoutTarget: WorkflowGraphViewLayoutTarget | null;
}): Promise<WorkflowLayoutPersistenceOutcome> {
  const owner = "workflow_view_layout";
  if (workflowViewLayoutTarget === null) {
    return { owner, status: "skipped" };
  }
  try {
    const layout = await window.setta.workflow.updateGraphViewLayout({
      positions: workflowLayoutPositionsForBackend(positions),
      target: workflowViewLayoutTarget,
      workspaceId: workflowProjection.workspaceId,
    });
    return {
      owner,
      positions: layout.positions,
      status: "persisted",
    };
  } catch (error: unknown) {
    return {
      error: layoutPersistenceErrorMessage(error, "Workflow view layout update failed"),
      owner,
      status: "failed",
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

function workflowLayoutPersistenceOwner(
  workflowProjection: WorkflowGraphProjection | null,
): WorkflowLayoutPersistenceOwner {
  if (workflowProjection?.editable === false) {
    return "workflow_view_layout";
  }
  return "workflow_definition_layout";
}

function graphNodeLayoutPersistenceStatus({
  semantic,
  workflow,
}: {
  semantic: SemanticLayoutPersistenceOutcome;
  workflow: WorkflowLayoutPersistenceOutcome;
}): LayoutPersistenceStatus {
  if (semantic.status === "failed" || workflow.status === "failed") {
    return "failed";
  }
  if (semantic.status === "persisted" || workflow.status === "persisted") {
    return "persisted";
  }
  return "skipped";
}
