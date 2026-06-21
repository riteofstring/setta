import type {
  SemanticGraph,
  WorkflowGraphProjection,
  WorkflowPendingApproval,
  WorkflowValidationResult,
} from "@generated/backend";

import type {
  WorkflowGraphGraph,
  WorkflowGraphUpdateMetadata,
  WorkflowGraphUpdateSource,
} from "./pixi-renderer";
import { createSyntheticWorkflowGraph } from "./pixi-renderer-synthetic-graph";
import { mergeWorkflowAndSemanticGraphs } from "./semantic-graph-projection";
import type { SyntheticWorkflowGraphOptions } from "./workflow-graph-camera-scope";
import { rendererGraphFromWorkflowProjection } from "./workflow-graph-projection";

export type WorkflowGraphRendererGraph = WorkflowGraphGraph;
export type WorkflowGraphRendererGraphUpdate = {
  graph: WorkflowGraphRendererGraph;
  metadata: WorkflowGraphUpdateMetadata;
};
export type WorkflowGraphSourceInputs = {
  semanticGraph: WorkflowGraphRendererGraph | undefined;
  workflowGraph: WorkflowGraphRendererGraph | undefined;
  workflowValidation: WorkflowValidationResult | null;
};

export function rendererGraphForWorkflowProjection(
  projection: WorkflowGraphProjection | null,
  validation: WorkflowValidationResult | null,
) {
  if (projection === null) {
    return undefined;
  }
  return rendererGraphFromWorkflowProjection(projection, validation);
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

export function workflowGraphUpdateSourceForSurface({
  previous,
  semanticGraph,
  semanticGraphUpdateSource,
  syntheticGraph,
  workflowGraph,
  workflowProjectionUpdateSource,
  workflowValidation,
}: {
  previous: WorkflowGraphSourceInputs;
  semanticGraph: WorkflowGraphRendererGraph | undefined;
  semanticGraphUpdateSource: WorkflowGraphUpdateSource;
  syntheticGraph: SyntheticWorkflowGraphOptions;
  workflowGraph: WorkflowGraphRendererGraph | undefined;
  workflowProjectionUpdateSource: WorkflowGraphUpdateSource;
  workflowValidation: WorkflowValidationResult | null;
}): WorkflowGraphUpdateSource {
  if (syntheticGraph !== null) {
    return "draft-validation-local";
  }
  return (
    workflowInputUpdateSource({
      previous,
      workflowGraph,
      workflowProjectionUpdateSource,
      workflowValidation,
    }) ??
    semanticInputUpdateSource({ previous, semanticGraph, semanticGraphUpdateSource }) ??
    fallbackWorkflowUpdateSource({
      workflowGraph,
      workflowProjectionUpdateSource,
      workflowValidation,
    })
  );
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

function workflowInputUpdateSource({
  previous,
  workflowGraph,
  workflowProjectionUpdateSource,
  workflowValidation,
}: {
  previous: WorkflowGraphSourceInputs;
  workflowGraph: WorkflowGraphRendererGraph | undefined;
  workflowProjectionUpdateSource: WorkflowGraphUpdateSource;
  workflowValidation: WorkflowValidationResult | null;
}) {
  if (previous.workflowValidation !== workflowValidation) {
    return "draft-validation-local";
  }
  if (previous.workflowGraph !== workflowGraph && workflowProjectionUpdateSource !== "unknown") {
    return workflowProjectionUpdateSource;
  }
  return null;
}

function semanticInputUpdateSource({
  previous,
  semanticGraph,
  semanticGraphUpdateSource,
}: {
  previous: WorkflowGraphSourceInputs;
  semanticGraph: WorkflowGraphRendererGraph | undefined;
  semanticGraphUpdateSource: WorkflowGraphUpdateSource;
}) {
  if (previous.semanticGraph === semanticGraph || semanticGraph === undefined) {
    return null;
  }
  return semanticGraphUpdateSource === "unknown" ? null : semanticGraphUpdateSource;
}

function fallbackWorkflowUpdateSource({
  workflowGraph,
  workflowProjectionUpdateSource,
  workflowValidation,
}: {
  workflowGraph: WorkflowGraphRendererGraph | undefined;
  workflowProjectionUpdateSource: WorkflowGraphUpdateSource;
  workflowValidation: WorkflowValidationResult | null;
}) {
  if (workflowValidation !== null) {
    return "draft-validation-local";
  }
  if (workflowGraph !== undefined && workflowProjectionUpdateSource !== "unknown") {
    return workflowProjectionUpdateSource;
  }
  return "unknown";
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
