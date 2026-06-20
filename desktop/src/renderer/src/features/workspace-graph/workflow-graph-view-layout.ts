import type {
  WorkflowGraphNodeLayout,
  WorkflowGraphProjection,
  WorkflowGraphViewLayoutTarget,
} from "@generated/backend";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { WorkflowGraphGraph } from "./pixi-renderer";
import type { WorkflowLayoutPosition } from "./workflow-graph-layout";
import {
  pendingWorkflowLayoutPositionsAfterSaveSettlement,
  pendingWorkflowLayoutPositionsWithInputs,
  type PendingWorkflowLayoutPosition,
} from "./workflow-graph-layout-overlay";

export function useWorkflowGraphViewLayout({
  projection,
  setWorkflowEditorError,
}: {
  projection: WorkflowGraphProjection | null;
  setWorkflowEditorError: (message: string) => void;
}) {
  const target = useMemo(
    () => workflowGraphViewLayoutTargetForProjection(projection),
    [projection],
  );
  const workspaceId = projection?.workspaceId ?? "";
  const targetKey = workflowGraphViewLayoutTargetKey(workspaceId, target);
  const [persistedPositions, setPersistedPositions] = useState<WorkflowGraphNodeLayout[]>([]);
  const [pendingPositions, setPendingPositions] = useState<PendingWorkflowLayoutPosition[]>([]);

  useEffect(() => {
    setPersistedPositions([]);
    setPendingPositions([]);
    if (target === null || workspaceId === "") {
      return;
    }
    let disposed = false;
    void window.setta.workflow
      .readGraphViewLayout({ target, workspaceId })
      .then((layout) => {
        if (!disposed) {
          setPersistedPositions(layout.positions);
        }
      })
      .catch((error: unknown) => {
        if (!disposed) {
          setWorkflowEditorError(workflowGraphViewLayoutErrorMessage(error));
        }
      });
    return () => {
      disposed = true;
    };
  }, [setWorkflowEditorError, target, targetKey, workspaceId]);

  const positions = useMemo(
    () => workflowGraphViewLayoutPositionsWithPending(persistedPositions, pendingPositions),
    [pendingPositions, persistedPositions],
  );

  const preparePendingWorkflowViewLayout = useCallback(
    (
      graphForLayout: WorkflowGraphGraph | null,
      rendererPositions: WorkflowLayoutPosition[],
      saveSequence: number,
    ) => {
      const inputs = workflowViewLayoutPositionsForGraph({
        graph: graphForLayout,
        positions: rendererPositions,
        saveSequence,
      });
      if (inputs.length > 0) {
        setPendingPositions((current) =>
          pendingWorkflowLayoutPositionsWithInputs({ current, inputs }),
        );
      }
      return inputs;
    },
    [],
  );

  const settleWorkflowViewLayoutSave = useCallback(
    (inputs: readonly PendingWorkflowLayoutPosition[], saveSequence: number) => {
      setPendingPositions((current) =>
        pendingWorkflowLayoutPositionsAfterSaveSettlement({
          current,
          inputs,
          saveSequence,
        }),
      );
    },
    [],
  );

  return {
    preparePendingWorkflowViewLayout,
    replaceWorkflowGraphViewLayoutPositions: setPersistedPositions,
    settleWorkflowViewLayoutSave,
    target,
    targetKey,
    viewLayoutPositions: positions,
  };
}

export function workflowGraphViewLayoutTargetForProjection(
  projection: WorkflowGraphProjection | null,
): WorkflowGraphViewLayoutTarget | null {
  if (projection === null || projection.editable) {
    return null;
  }
  switch (projection.viewMode) {
    case "draft":
      return null;
    case "version":
      return workflowGraphDefinitionVersionViewLayoutTarget(projection);
    case "run":
      return workflowGraphExecutionViewLayoutTarget(projection);
    default:
      return assertNever(projection.viewMode);
  }
}

function workflowGraphDefinitionVersionViewLayoutTarget(
  projection: WorkflowGraphProjection,
): WorkflowGraphViewLayoutTarget | null {
  if (projection.definitionId === "" || projection.definitionVersionId === "") {
    return null;
  }
  return {
    definitionVersion: {
      definitionId: projection.definitionId,
      versionId: projection.definitionVersionId,
    },
    kind: "definition_version",
    workflowExecution: null,
  };
}

function workflowGraphExecutionViewLayoutTarget(
  projection: WorkflowGraphProjection,
): WorkflowGraphViewLayoutTarget | null {
  if (
    projection.definitionId === "" ||
    projection.definitionVersionId === "" ||
    projection.executionId === ""
  ) {
    return null;
  }
  return {
    definitionVersion: null,
    kind: "workflow_execution",
    workflowExecution: {
      definitionId: projection.definitionId,
      executionId: projection.executionId,
      versionId: projection.definitionVersionId,
    },
  };
}

export function workflowRendererGraphWithViewLayoutPositions(
  graph: WorkflowGraphGraph | undefined,
  positions: readonly WorkflowGraphNodeLayout[],
): WorkflowGraphGraph | undefined {
  if (graph === undefined || positions.length === 0) {
    return graph;
  }
  const positionByNodeId = new Map(positions.map((position) => [position.nodeId, position]));
  let changed = false;
  const nodes = graph.nodes.map((node) => {
    if (node.layer !== "workflow" || node.movementOwner?.kind !== "workflow_view_layout") {
      return node;
    }
    const position = positionByNodeId.get(node.id);
    if (!position || (node.x === position.x && node.y === position.y)) {
      return node;
    }
    changed = true;
    return {
      ...node,
      x: position.x,
      y: position.y,
    };
  });
  if (!changed) {
    return graph;
  }
  return {
    ...graph,
    nodes,
  };
}

export function workflowViewLayoutPositionsForGraph({
  graph,
  positions,
  saveSequence,
}: {
  graph: WorkflowGraphGraph | null;
  positions: readonly WorkflowLayoutPosition[];
  saveSequence: number;
}): PendingWorkflowLayoutPosition[] {
  if (graph === null) {
    return [];
  }
  const viewLayoutNodeIds = new Set(
    graph.nodes
      .filter(
        (node) => node.layer === "workflow" && node.movementOwner?.kind === "workflow_view_layout",
      )
      .map((node) => node.id),
  );
  if (viewLayoutNodeIds.size === 0) {
    return [];
  }
  return positions
    .filter((position) => position.moved && viewLayoutNodeIds.has(position.nodeId))
    .map((position) => ({
      moved: true,
      nodeId: position.nodeId,
      saveSequence,
      x: Math.round(position.x),
      y: Math.round(position.y),
    }));
}

function workflowGraphViewLayoutTargetKey(
  workspaceId: string,
  target: WorkflowGraphViewLayoutTarget | null,
) {
  if (workspaceId === "" || target === null) {
    return "";
  }
  switch (target.kind) {
    case "definition_version":
      if (target.definitionVersion === null) {
        throw new Error("definition_version workflow graph view layout target is missing details");
      }
      return [
        workspaceId,
        target.kind,
        target.definitionVersion.definitionId,
        target.definitionVersion.versionId,
      ].join(":");
    case "workflow_execution":
      if (target.workflowExecution === null) {
        throw new Error("workflow_execution workflow graph view layout target is missing details");
      }
      return [
        workspaceId,
        target.kind,
        target.workflowExecution.definitionId,
        target.workflowExecution.versionId,
        target.workflowExecution.executionId,
      ].join(":");
    default:
      return assertNever(target.kind);
  }
}

function workflowGraphViewLayoutPositionsWithPending(
  persistedPositions: readonly WorkflowGraphNodeLayout[],
  pendingPositions: readonly PendingWorkflowLayoutPosition[],
): WorkflowGraphNodeLayout[] {
  const byNodeId = new Map<string, WorkflowGraphNodeLayout>();
  for (const position of persistedPositions) {
    byNodeId.set(position.nodeId, {
      nodeId: position.nodeId,
      x: position.x,
      y: position.y,
    });
  }
  for (const position of pendingPositions) {
    byNodeId.set(position.nodeId, {
      nodeId: position.nodeId,
      x: position.x,
      y: position.y,
    });
  }
  return [...byNodeId.values()];
}

function workflowGraphViewLayoutErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Workflow graph view layout load failed";
}

function assertNever(value: never): never {
  throw new Error(`Unsupported workflow graph view layout target kind: ${String(value)}`);
}
