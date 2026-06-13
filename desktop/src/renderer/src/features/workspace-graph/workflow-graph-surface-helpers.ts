import type {
  SemanticGraph,
  WorkflowDefinition,
  WorkflowGraph,
  WorkflowGraphProjection,
  WorkflowPendingApproval,
  WorkflowValidationResult,
} from "@generated/backend";

import type { WorkflowGraphGraph } from "./pixi-renderer";
import { createSyntheticWorkflowGraph } from "./pixi-renderer-synthetic-graph";
import { mergeWorkflowAndSemanticGraphs } from "./semantic-graph-projection";
import type { SyntheticWorkflowGraphOptions } from "./workflow-graph-camera-scope";
import {
  emptyWorkflowGraph,
  workflowGraphWithAddedDraftEdge,
  workflowGraphWithAddedDraftNode,
  type WorkflowDraftEdgeConnection,
  type WorkflowDraftNodeType,
} from "./workflow-graph-draft";
import type { WorkflowLayoutPosition } from "./workflow-graph-layout";
import { rendererGraphFromWorkflowProjection } from "./workflow-graph-projection";
import type { WorkflowDraftNodePosition } from "./workflow-graph-toolbar";

type CreateWorkflowDefinition = (
  workspaceId: string,
  name?: string,
  graph?: WorkflowGraph,
) => Promise<WorkflowDefinition>;
export type WorkflowGraphRendererGraph = WorkflowGraphGraph;

export function rendererGraphForWorkflowProjection(
  projection: WorkflowGraphProjection | null,
  validation: WorkflowValidationResult | null,
) {
  if (projection === null) {
    return undefined;
  }
  return rendererGraphFromWorkflowProjection(projection, validation);
}

export function workflowValidationForDraftProjection(
  projection: WorkflowGraphProjection | null,
): WorkflowValidationResult | null {
  if (
    projection === null ||
    projection.viewMode !== "draft" ||
    projection.validation.status !== "current"
  ) {
    return null;
  }
  return projection.validation.snapshot?.result ?? null;
}

export function workflowProjectionWithLayoutPositions(
  projection: WorkflowGraphProjection | null,
  positions: WorkflowLayoutPosition[],
): WorkflowGraphProjection | null {
  if (projection === null || !projection.editable) {
    return projection;
  }
  const positionByNodeId = new Map(positions.map((position) => [position.nodeId, position]));
  const currentByNodeId = new Map(
    projection.layout.nodes.map((position) => [position.nodeId, position]),
  );
  return {
    ...projection,
    layout: {
      nodes: projection.nodes.flatMap((node) => {
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

export function semanticGraphIsEmpty({
  semanticGraph,
  semanticReady,
  workflowGraph,
}: {
  semanticGraph: SemanticGraph | null;
  semanticReady: boolean;
  workflowGraph: WorkflowGraphRendererGraph | undefined;
}) {
  return (
    semanticReady &&
    semanticGraph !== null &&
    semanticGraph.nodes.length === 0 &&
    (workflowGraph === undefined || workflowGraph.nodes.length === 0)
  );
}

export function workflowRendererGraphForSurface({
  semanticGraph,
  syntheticGraph,
  workflowGraph,
  workflowProjectionReady,
  workflowWorkspaceId,
}: {
  semanticGraph: WorkflowGraphRendererGraph | undefined;
  syntheticGraph: SyntheticWorkflowGraphOptions;
  workflowGraph: WorkflowGraphRendererGraph | undefined;
  workflowProjectionReady: boolean;
  workflowWorkspaceId: string;
}) {
  if (syntheticGraph) {
    return createSyntheticWorkflowGraph(syntheticGraph);
  }
  const merged = mergeWorkflowAndSemanticGraphs({ semanticGraph, workflowGraph });
  if (merged) {
    return merged;
  }
  if (workflowGraph) {
    return workflowGraph;
  }
  if (workflowProjectionReady && workflowWorkspaceId !== "") {
    return emptyWorkflowRendererGraph();
  }
  return undefined;
}

export function workflowRendererScopeKey(
  syntheticGraph: SyntheticWorkflowGraphOptions,
  workflowWorkspaceId: string,
) {
  if (syntheticGraph !== null) {
    return `synthetic:${syntheticGraph.nodeCount}:${syntheticGraph.edgesPerNode}`;
  }
  return `workspace:${workflowWorkspaceId}`;
}

export function workflowProjectionPendingApproval(projection: WorkflowGraphProjection | null) {
  if (projection === null) {
    return null;
  }
  return pendingWorkflowApproval(projection);
}

interface MaterializeWorkflowDraftNodeRequest {
  createWorkflowDefinition: CreateWorkflowDefinition;
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

export async function workflowProjectionForExecution(
  workspaceId: string,
  definitionId: string,
  definitionVersionId: string,
  executionId: string,
): Promise<WorkflowGraphProjection> {
  const refreshed = await window.setta.workflow.graphProjection(
    workspaceId,
    definitionId,
    definitionVersionId,
    executionId,
  );
  if (refreshed.projection === null) {
    throw new Error(`workflow graph projection ${executionId} was not returned`);
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

export function workflowRunDraftPreflightMessage({
  projection,
  syntheticGraphEnabled,
  workspaceId,
}: {
  projection: WorkflowGraphProjection | null;
  syntheticGraphEnabled: boolean;
  workspaceId: string;
}): "skip" | string | null {
  if (syntheticGraphEnabled) {
    return "skip";
  }
  if (workspaceId === "") {
    return "Open a workspace before running a workflow";
  }
  if (projection === null) {
    return "Add a workflow node before running";
  }
  if (!projection.editable) {
    return "Switch to the draft workflow before starting another run";
  }
  return null;
}

function pendingWorkflowApproval(
  projection: WorkflowGraphProjection,
): WorkflowPendingApproval | null {
  for (const node of projection.nodes) {
    if (node.pendingApproval !== null) {
      return node.pendingApproval;
    }
  }
  return null;
}

function emptyWorkflowRendererGraph() {
  return {
    edges: [],
    nodes: [],
    workflow: null,
  };
}
