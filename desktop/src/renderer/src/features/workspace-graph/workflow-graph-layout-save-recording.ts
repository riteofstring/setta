import type { WorkflowGraphProjection, WorkflowGraphViewLayoutTarget } from "@generated/backend";
import type { RendererGraphLayoutSaveOwner } from "@shared/recording";

import type { WorkflowLayoutPosition } from "./workflow-graph-layout";
import {
  graphNodeLayoutPersistenceErrorMessage,
  type GraphNodeLayoutPersistenceOutcome,
} from "./workflow-graph-layout-persistence";
import { recordWorkflowGraphLayoutSaveEvent } from "./workflow-graph-recording";

export interface WorkflowGraphLayoutSaveRecording {
  affectedNodeIds: string[];
  generation: number;
  owners: RendererGraphLayoutSaveOwner[];
  surfaceId: string;
  target: ReturnType<typeof workflowGraphRecordingLayoutSaveTarget>;
}

export function startWorkflowGraphLayoutSaveRecording({
  positions,
  projection,
  saveSequence,
  semanticLayoutInputCount,
  surfaceId,
  viewLayoutTarget,
  workflowLayoutInputCount,
  workflowViewLayoutInputCount,
}: {
  positions: readonly WorkflowLayoutPosition[];
  projection: WorkflowGraphProjection | null;
  saveSequence: number;
  semanticLayoutInputCount: number;
  surfaceId: string;
  viewLayoutTarget: WorkflowGraphViewLayoutTarget | null;
  workflowLayoutInputCount: number;
  workflowViewLayoutInputCount: number;
}): WorkflowGraphLayoutSaveRecording {
  const recording = {
    affectedNodeIds: movedWorkflowGraphNodeIds(positions),
    generation: saveSequence,
    owners: workflowGraphLayoutSaveOwnersForPending({
      semanticLayoutInputCount,
      workflowLayoutInputCount,
      workflowViewLayoutInputCount,
    }),
    surfaceId,
    target: workflowGraphRecordingLayoutSaveTarget(projection, viewLayoutTarget),
  };
  recordWorkflowGraphLayoutSaveEvent({
    ...recording,
    phase: "started",
    status: "started",
  });
  return recording;
}

export function recordSupersededWorkflowGraphLayoutSave(
  recording: WorkflowGraphLayoutSaveRecording,
): void {
  recordWorkflowGraphLayoutSaveEvent({
    ...recording,
    error: "Superseded by a newer graph layout save",
    phase: "skipped",
    status: "skipped",
  });
}

export function recordWorkflowGraphLayoutSaveOutcome(
  recording: WorkflowGraphLayoutSaveRecording,
  outcome: GraphNodeLayoutPersistenceOutcome,
): void {
  recordWorkflowGraphLayoutSaveEvent({
    ...recording,
    error: outcome.status === "failed" ? graphNodeLayoutPersistenceErrorMessage(outcome) : "",
    owners: workflowGraphLayoutSaveOwnersForOutcome(outcome),
    phase: workflowGraphLayoutSavePhaseForOutcome(outcome),
    status: outcome.status,
  });
}

function movedWorkflowGraphNodeIds(positions: readonly WorkflowLayoutPosition[]): string[] {
  return positions.filter((position) => position.moved).map((position) => position.nodeId);
}

function workflowGraphLayoutSaveOwnersForPending({
  semanticLayoutInputCount,
  workflowLayoutInputCount,
  workflowViewLayoutInputCount,
}: {
  semanticLayoutInputCount: number;
  workflowLayoutInputCount: number;
  workflowViewLayoutInputCount: number;
}): RendererGraphLayoutSaveOwner[] {
  const owners: RendererGraphLayoutSaveOwner[] = [];
  if (semanticLayoutInputCount > 0) {
    owners.push("semantic_layout");
  }
  if (workflowLayoutInputCount > 0) {
    owners.push("workflow_definition_layout");
  }
  if (workflowViewLayoutInputCount > 0) {
    owners.push("workflow_view_layout");
  }
  return owners;
}

function workflowGraphLayoutSaveOwnersForOutcome(
  outcome: GraphNodeLayoutPersistenceOutcome,
): RendererGraphLayoutSaveOwner[] {
  const owners: RendererGraphLayoutSaveOwner[] = [];
  if (outcome.semantic.status !== "skipped") {
    owners.push(outcome.semantic.owner);
  }
  if (outcome.workflow.status !== "skipped") {
    owners.push(outcome.workflow.owner);
  }
  return owners;
}

function workflowGraphLayoutSavePhaseForOutcome(
  outcome: GraphNodeLayoutPersistenceOutcome,
): "failed" | "skipped" | "succeeded" {
  switch (outcome.status) {
    case "failed":
      return "failed";
    case "persisted":
      return "succeeded";
    case "skipped":
      return "skipped";
    default:
      return assertNever(outcome.status);
  }
}

function workflowGraphRecordingLayoutSaveTarget(
  projection: WorkflowGraphProjection | null,
  viewLayoutTarget: WorkflowGraphViewLayoutTarget | null,
) {
  if (projection === null) {
    return null;
  }
  return {
    definitionId: projection.definitionId,
    editable: projection.editable,
    executionId: projection.executionId,
    versionId: projection.definitionVersionId,
    viewLayoutKind: viewLayoutTarget?.kind ?? "",
    viewMode: projection.viewMode,
    workspaceId: projection.workspaceId,
  };
}

function assertNever(value: never): never {
  throw new Error(`Unhandled workflow graph layout save status: ${String(value)}`);
}
