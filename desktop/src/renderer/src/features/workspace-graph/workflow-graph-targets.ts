import type { WorkflowGraphNode, WorkflowGraphProjection } from "@generated/backend";

import type { WorkflowGraphRuntimeIndicator } from "./pixi-renderer";
import type { WorkspaceTrajectoryNodeDetails } from "./workspace-trajectory-store";
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
  runtime: WorkflowGraphRuntimeIndicator | null = null,
  trajectory: WorkspaceTrajectoryNodeDetails | null = null,
  focusedRunItemId = "",
): WorkflowNodeDetailsTarget {
  const node = projection.nodes.find((candidate) => candidate.id === nodeId) ?? null;
  return {
    ...workflowProjectionDetailsTargetFields(projection),
    focusedRunItemId,
    nodeId,
    ...workflowNodeTargetMetadata(node, nodeId),
    projectionIncomingEdges: projection.edges.filter((edge) => edge.toNodeId === nodeId),
    projectionOutgoingEdges: projection.edges.filter((edge) => edge.fromNodeId === nodeId),
    runtime,
    trajectory,
  };
}

function workflowProjectionDetailsTargetFields(projection: WorkflowGraphProjection) {
  return {
    definitionId: projection.definitionId,
    definitionName: projection.definitionName,
    definitionVersionId: projection.definitionVersionId,
    definitionVersionNumber: projection.definitionVersionNumber,
    editable: projection.editable,
    executionId: projection.executionId,
    versionMismatch: projection.versionMismatch,
    viewMode: projection.viewMode,
    workspaceId: projection.workspaceId,
  };
}

function workflowNodeTargetMetadata(
  node: WorkflowGraphNode | null,
  nodeId: string,
): Pick<WorkflowNodeDetailsTarget, "nodeKind" | "nodeLabel" | "nodeStatus"> {
  return {
    nodeKind: node?.kind ?? "",
    nodeLabel: node?.label ?? nodeId,
    nodeStatus: node?.status ?? "",
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
