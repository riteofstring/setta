import type { WorkflowGraphProjection } from "@generated/backend";

import type {
  WorkflowNodeDetailsTarget,
  WorkflowSettingsTarget,
} from "../../stores/workflow-editor-store";

export function selectedWorkflowProjectionNode(
  projection: WorkflowGraphProjection | null,
  nodeId: string | null,
) {
  if (projection === null || nodeId === null) {
    return null;
  }
  return projection.nodes.find((node) => node.id === nodeId) ?? null;
}

export function workflowNodeDetailsTarget(
  projection: WorkflowGraphProjection,
  nodeId: string,
): WorkflowNodeDetailsTarget {
  const node = projection.nodes.find((candidate) => candidate.id === nodeId);
  if (node === undefined) {
    throw new Error(`workflow node ${nodeId} is not present in the current projection`);
  }
  return {
    definitionId: projection.definitionId,
    definitionName: projection.definitionName,
    definitionVersionId: projection.definitionVersionId,
    definitionVersionNumber: projection.definitionVersionNumber,
    executionId: projection.executionId,
    nodeId,
    nodeKind: node.kind,
    nodeLabel: node.label,
    nodeStatus: node.status,
    projectionIncomingEdges: projection.edges.filter((edge) => edge.toNodeId === nodeId),
    projectionOutgoingEdges: projection.edges.filter((edge) => edge.fromNodeId === nodeId),
    versionMismatch: projection.versionMismatch,
    viewMode: projection.viewMode,
    workspaceId: projection.workspaceId,
  };
}

export function workflowSettingsTarget(
  projection: WorkflowGraphProjection,
): WorkflowSettingsTarget {
  return {
    definitionDescription: projection.definitionDescription,
    definitionId: projection.definitionId,
    definitionName: projection.definitionName,
    editable: projection.editable,
    viewMode: projection.viewMode,
    workspaceId: projection.workspaceId,
  };
}
