import type { WorkspaceUILayout } from "@generated/backend";

type WorkspaceUIColumn = WorkspaceUILayout["columns"][number];
type WorkspaceUIPane = WorkspaceUILayout["panes"][number];
type WorkflowNodeDetailsConfig = NonNullable<WorkspaceUIPane["workflowNodeDetailsConfig"]>;
type WorkflowGraphEdge = WorkflowNodeDetailsConfig["projectionIncomingEdges"][number];
type WorkflowCondition = WorkflowGraphEdge["condition"];

export function workspaceUILayoutsEqual(
  left: WorkspaceUILayout | null,
  right: WorkspaceUILayout,
): boolean {
  if (left === null) {
    return false;
  }
  return (
    layoutScalarFieldsEqual(left, right) &&
    arraysEqual(left.columns, right.columns, workspaceUIColumnsEqual) &&
    arraysEqual(left.panes, right.panes, workspaceUIPanesEqual)
  );
}

function layoutScalarFieldsEqual(left: WorkspaceUILayout, right: WorkspaceUILayout): boolean {
  return allEqual([
    left.schemaVersion === right.schemaVersion,
    left.revision === right.revision,
    left.workspaceId === right.workspaceId,
    left.focusedPaneId === right.focusedPaneId,
  ]);
}

function workspaceUIColumnsEqual(left: WorkspaceUIColumn, right: WorkspaceUIColumn): boolean {
  return (
    allEqual([
      left.columnId === right.columnId,
      left.index === right.index,
      left.planeIndex === right.planeIndex,
      left.previousProportionWidth === right.previousProportionWidth,
      left.slotIndex === right.slotIndex,
    ]) &&
    columnWidthSpecsEqual(left.idealWidthSpec, right.idealWidthSpec) &&
    columnWidthSpecsEqual(left.widthSpec, right.widthSpec) &&
    stringArraysEqual(left.paneIds, right.paneIds)
  );
}

function workspaceUIPanesEqual(left: WorkspaceUIPane, right: WorkspaceUIPane): boolean {
  return (
    allEqual([
      left.columnId === right.columnId,
      left.heat === right.heat,
      left.heightPx === right.heightPx,
      left.paneId === right.paneId,
      left.sequence === right.sequence,
      left.subtitle === right.subtitle,
      left.surfaceId === right.surfaceId,
      left.surfaceKind === right.surfaceKind,
      left.title === right.title,
      left.tone === right.tone,
      left.weight === right.weight,
    ]) &&
    terminalPaneConfigsEqual(left.terminalConfig, right.terminalConfig) &&
    workflowNodeDetailsConfigsEqual(left.workflowNodeDetailsConfig, right.workflowNodeDetailsConfig)
  );
}

function columnWidthSpecsEqual(
  left: WorkspaceUIColumn["widthSpec"],
  right: WorkspaceUIColumn["widthSpec"],
): boolean {
  return left.unit === right.unit && left.value === right.value;
}

function terminalPaneConfigsEqual(
  left: WorkspaceUIPane["terminalConfig"],
  right: WorkspaceUIPane["terminalConfig"],
): boolean {
  if (left === null || right === null) {
    return left === right;
  }
  return allEqual([
    left.cwdOverride === right.cwdOverride,
    left.profileId === right.profileId,
    left.titleOverride === right.titleOverride,
  ]);
}

function workflowNodeDetailsConfigsEqual(
  left: WorkspaceUIPane["workflowNodeDetailsConfig"],
  right: WorkspaceUIPane["workflowNodeDetailsConfig"],
): boolean {
  if (left === null || right === null) {
    return left === right;
  }
  return (
    allEqual([
      left.definitionId === right.definitionId,
      left.definitionName === right.definitionName,
      left.definitionVersionId === right.definitionVersionId,
      left.definitionVersionNumber === right.definitionVersionNumber,
      left.executionId === right.executionId,
      left.nodeExecutionId === right.nodeExecutionId,
      left.nodeId === right.nodeId,
      left.nodeKind === right.nodeKind,
      left.nodeLabel === right.nodeLabel,
      left.nodeStatus === right.nodeStatus,
      left.versionMismatch === right.versionMismatch,
      left.viewMode === right.viewMode,
      left.workspaceId === right.workspaceId,
    ]) &&
    workflowGraphEdgesEqual(left.projectionIncomingEdges, right.projectionIncomingEdges) &&
    workflowGraphEdgesEqual(left.projectionOutgoingEdges, right.projectionOutgoingEdges)
  );
}

function stringArraysEqual(left: string[], right: string[]): boolean {
  return arraysEqual(left, right, (leftValue, rightValue) => leftValue === rightValue);
}

function workflowGraphEdgesEqual(left: WorkflowGraphEdge[], right: WorkflowGraphEdge[]): boolean {
  return arraysEqual(left, right, workflowGraphEdgeEqual);
}

function workflowGraphEdgeEqual(left: WorkflowGraphEdge, right: WorkflowGraphEdge): boolean {
  return (
    allEqual([
      left.id === right.id,
      left.kind === right.kind,
      left.fromNodeId === right.fromNodeId,
      left.toNodeId === right.toNodeId,
      left.label === right.label,
      left.status === right.status,
      left.activeTokenCount === right.activeTokenCount,
      left.completedTokenCount === right.completedTokenCount,
      left.cancelledTokenCount === right.cancelledTokenCount,
    ]) && workflowConditionsEqual(left.condition, right.condition)
  );
}

function workflowConditionsEqual(left: WorkflowCondition, right: WorkflowCondition): boolean {
  if (left === null || right === null) {
    return left === right;
  }
  return allEqual([
    left.kind === right.kind,
    left.nodeId === right.nodeId,
    left.status === right.status,
    left.signalName === right.signalName,
    left.signalValue === right.signalValue,
    left.exitCode === right.exitCode,
    left.invert === right.invert,
  ]);
}

function arraysEqual<T>(
  left: T[],
  right: T[],
  itemsEqual: (left: T, right: T) => boolean,
): boolean {
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    const leftItem = left[index];
    const rightItem = right[index];
    if (leftItem === undefined || rightItem === undefined || !itemsEqual(leftItem, rightItem)) {
      return false;
    }
  }
  return true;
}

function allEqual(values: boolean[]): boolean {
  return values.every((value) => value);
}
