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
  if (projection !== null) {
    return window.setta.workflow.addNode({
      definitionId: projection.definitionId,
      expectedRevision: projection.draftRevision,
      nodeType,
      position: {
        x: Math.round(position.worldX),
        y: Math.round(position.worldY),
      },
      workspaceId: projection.workspaceId,
    });
  }
  const graph = workflowGraphWithAddedDraftNode(emptyWorkflowGraph(), nodeType, {
    x: position.worldX,
    y: position.worldY,
  });
  const definition = await createWorkflowDefinition(workspaceId, "Untitled workflow", graph);
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
  await waitForWorkflowGraphDebugAddEdgeDelay();
  return window.setta.workflow.addEdge({
    connection: {
      sourceNodeId: connection.sourceNodeId,
      sourcePortId: connection.sourcePortId ?? "",
      targetNodeId: connection.targetNodeId,
      targetPortId: connection.targetPortId ?? "",
    },
    definitionId: projection.definitionId,
    expectedRevision: projection.draftRevision,
    workspaceId: projection.workspaceId,
  });
}

declare global {
  interface Window {
    __settaWorkflowGraphAddEdgeDelayCalls?: number;
    __settaWorkflowGraphAddEdgeDelayMs?: number;
  }
}

async function waitForWorkflowGraphDebugAddEdgeDelay() {
  if (!window.setta.app.flags.workflowGraphDebug) {
    return;
  }
  const delayMs = window.__settaWorkflowGraphAddEdgeDelayMs;
  if (typeof delayMs !== "number" || !Number.isFinite(delayMs) || delayMs <= 0) {
    return;
  }
  window.__settaWorkflowGraphAddEdgeDelayCalls =
    (window.__settaWorkflowGraphAddEdgeDelayCalls ?? 0) + 1;
  await new Promise((resolve) => window.setTimeout(resolve, delayMs));
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
