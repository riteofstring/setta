import type { WorkflowGraphProjection } from "@generated/backend";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { WorkflowLayoutPosition } from "./workflow-graph-layout";
import { workflowProjectionWithLayoutPositions } from "./workflow-graph-surface-helpers";

export interface PendingWorkflowLayoutPosition extends WorkflowLayoutPosition {
  saveSequence: number;
}

export function useWorkflowLayoutOverlay({
  projection,
}: {
  projection: WorkflowGraphProjection | null;
}) {
  const [pendingWorkflowLayoutPositions, setPendingWorkflowLayoutPositions] = useState<
    PendingWorkflowLayoutPosition[]
  >([]);
  const projectionKey = workflowProjectionLayoutOverlayKey(projection);

  useEffect(() => {
    setPendingWorkflowLayoutPositions([]);
  }, [projectionKey]);

  const workflowProjectionWithLocalLayout = useMemo(
    () => workflowProjectionWithLayoutPositions(projection, pendingWorkflowLayoutPositions),
    [pendingWorkflowLayoutPositions, projection],
  );

  const preparePendingWorkflowLayout = useCallback(
    (
      projectionForLayout: WorkflowGraphProjection | null,
      positions: WorkflowLayoutPosition[],
      saveSequence: number,
    ) => {
      const inputs = workflowLayoutPositionsForProjection({
        positions,
        projection: projectionForLayout,
        saveSequence,
      });
      if (inputs.length > 0) {
        setPendingWorkflowLayoutPositions((current) =>
          pendingWorkflowLayoutPositionsWithInputs({ current, inputs }),
        );
      }
      return inputs;
    },
    [],
  );

  const clearPersistedWorkflowLayout = useCallback(
    (inputs: readonly PendingWorkflowLayoutPosition[], saveSequence: number) => {
      setPendingWorkflowLayoutPositions((current) =>
        pendingWorkflowLayoutPositionsAfterPersist({
          current,
          inputs,
          saveSequence,
        }),
      );
    },
    [],
  );

  return {
    clearPersistedWorkflowLayout,
    pendingWorkflowLayoutPositions,
    preparePendingWorkflowLayout,
    workflowProjectionWithLocalLayout,
  };
}

export function workflowLayoutPositionsForProjection({
  positions,
  projection,
  saveSequence,
}: {
  positions: readonly WorkflowLayoutPosition[];
  projection: WorkflowGraphProjection | null;
  saveSequence: number;
}): PendingWorkflowLayoutPosition[] {
  if (projection === null || !projection.editable) {
    return [];
  }
  const workflowNodeIds = new Set(projection.nodes.map((node) => node.id));
  return positions
    .filter((position) => workflowNodeIds.has(position.nodeId))
    .map((position) => ({
      moved: position.moved,
      nodeId: position.nodeId,
      saveSequence,
      x: Math.round(position.x),
      y: Math.round(position.y),
    }));
}

export function pendingWorkflowLayoutPositionsWithInputs({
  current,
  inputs,
}: {
  current: readonly PendingWorkflowLayoutPosition[];
  inputs: readonly PendingWorkflowLayoutPosition[];
}): PendingWorkflowLayoutPosition[] {
  const byNodeId = new Map(current.map((position) => [position.nodeId, position]));
  for (const input of inputs) {
    byNodeId.set(input.nodeId, { ...input });
  }
  return [...byNodeId.values()];
}

export function pendingWorkflowLayoutPositionsAfterPersist({
  current,
  inputs,
  saveSequence,
}: {
  current: readonly PendingWorkflowLayoutPosition[];
  inputs: readonly PendingWorkflowLayoutPosition[];
  saveSequence: number;
}): PendingWorkflowLayoutPosition[] {
  if (inputs.length === 0) {
    return [...current];
  }
  const persistedNodeIds = new Set(inputs.map((input) => input.nodeId));
  return current.filter(
    (position) => !persistedNodeIds.has(position.nodeId) || position.saveSequence > saveSequence,
  );
}

function workflowProjectionLayoutOverlayKey(projection: WorkflowGraphProjection | null) {
  if (projection === null) {
    return "";
  }
  return `${projection.workspaceId}:${projection.definitionId}`;
}
