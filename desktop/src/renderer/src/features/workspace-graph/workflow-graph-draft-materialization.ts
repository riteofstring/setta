import type {
  WorkflowDefinition,
  WorkflowGraph,
  WorkflowGraphProjection,
} from "@generated/backend";

import {
  emptyWorkflowGraph,
  workflowGraphWithAddedDraftEdge,
  workflowGraphWithAddedDraftNode,
  type WorkflowDraftEdgeConnection,
  type WorkflowDraftNodeType,
} from "./workflow-graph-draft";
import type { WorkflowDraftNodePosition } from "./workflow-graph-toolbar";

interface MaterializeWorkflowDraftNodeRequest {
  createWorkflowDefinition: (
    workspaceId: string,
    name?: string,
    graph?: WorkflowGraph,
  ) => Promise<WorkflowDefinition>;
  nodeType: WorkflowDraftNodeType;
  position: WorkflowDraftNodePosition;
  projection: WorkflowGraphProjection | null;
  syntheticGraphEnabled: boolean;
  workspaceId: string;
}

export async function materializeWorkflowDraftNode({
  createWorkflowDefinition,
  nodeType,
  position,
  projection,
  syntheticGraphEnabled,
  workspaceId,
}: MaterializeWorkflowDraftNodeRequest): Promise<WorkflowGraphProjection | null> {
  const preflight = workflowDraftNodeEditPreflight({
    projection,
    syntheticGraphEnabled,
    workspaceId,
  });
  if (preflight === "skip") {
    return null;
  }
  if (preflight !== null) {
    throw new Error(preflight);
  }
  const graph = await workflowGraphWithDraftNode(projection, workspaceId, nodeType, position);
  const definition =
    projection === null
      ? await createWorkflowDefinition(workspaceId, "Untitled workflow", graph)
      : await window.setta.workflow.updateDefinition(
          workspaceId,
          projection.definitionId,
          projection.definitionName,
          projection.definitionDescription,
          graph,
        );
  return workflowProjectionForDefinition(workspaceId, definition.id);
}

export async function workflowProjectionForDefinition(
  workspaceId: string,
  definitionId: string,
): Promise<WorkflowGraphProjection> {
  const refreshed = await window.setta.workflow.graphProjection(workspaceId, definitionId);
  if (refreshed.projection === null) {
    throw new Error(`workflow graph projection ${definitionId} was not returned`);
  }
  return refreshed.projection;
}

interface MaterializeWorkflowDraftEdgeRequest {
  connection: WorkflowDraftEdgeConnection;
  projection: WorkflowGraphProjection;
}

export async function materializeWorkflowDraftEdge({
  connection,
  projection,
}: MaterializeWorkflowDraftEdgeRequest): Promise<WorkflowGraphProjection> {
  const definition = await window.setta.workflow.readDefinition(
    projection.workspaceId,
    projection.definitionId,
  );
  const graph = workflowGraphWithAddedDraftEdge(definition.graph, connection);
  const updated = await window.setta.workflow.updateDefinition(
    projection.workspaceId,
    definition.id,
    definition.name,
    definition.description,
    graph,
  );
  return workflowProjectionForDefinition(projection.workspaceId, updated.id);
}

function workflowDraftNodeEditPreflight({
  projection,
  syntheticGraphEnabled,
  workspaceId,
}: Pick<
  MaterializeWorkflowDraftNodeRequest,
  "projection" | "syntheticGraphEnabled" | "workspaceId"
>): "skip" | string | null {
  if (syntheticGraphEnabled) {
    return "skip";
  }
  if (workspaceId === "") {
    return "Open a workspace before editing a workflow";
  }
  if (projection !== null && !projection.editable) {
    return "Select the draft workflow before editing the graph";
  }
  return null;
}

async function workflowGraphWithDraftNode(
  projection: WorkflowGraphProjection | null,
  workspaceId: string,
  nodeType: WorkflowDraftNodeType,
  position: WorkflowDraftNodePosition,
): Promise<WorkflowGraph> {
  const baseGraph =
    projection === null
      ? emptyWorkflowGraph()
      : (await window.setta.workflow.readDefinition(workspaceId, projection.definitionId)).graph;
  return workflowGraphWithAddedDraftNode(baseGraph, nodeType, {
    x: position.worldX,
    y: position.worldY,
  });
}
