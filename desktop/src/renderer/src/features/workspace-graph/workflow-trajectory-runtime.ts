import type { WorkflowGraphProjection } from "@generated/backend";
import { useEffect, useMemo } from "react";

import type { SyntheticWorkflowGraphOptions } from "./workflow-graph-camera-scope";
import {
  createWorkspaceTrajectoryStore,
  workspaceTrajectoryRunBindingsFromExecution,
  type WorkspaceTrajectoryStore,
} from "./workspace-trajectory-store";

const workspaceTrajectoryRuntimeLimit = 80;

interface UseWorkspaceTrajectoryRuntimeRequest {
  syntheticGraph: SyntheticWorkflowGraphOptions | null;
  workflowProjection: WorkflowGraphProjection | null;
  workflowWorkspaceId: string;
}

export function useWorkspaceTrajectoryRuntime({
  syntheticGraph,
  workflowProjection,
  workflowWorkspaceId,
}: UseWorkspaceTrajectoryRuntimeRequest): {
  trajectoryStore: WorkspaceTrajectoryStore | null;
} {
  const trajectoryWorkflowExecutionId = workflowProjection?.executionId ?? "";
  const trajectoryStore = useMemo<WorkspaceTrajectoryStore | null>(
    () =>
      syntheticGraph !== null || workflowWorkspaceId === ""
        ? null
        : createWorkspaceTrajectoryStore({
            loadSnapshot: () =>
              window.setta.workspaceTrajectory.readRuntimeSnapshot({
                chatRunId: "",
                limit: workspaceTrajectoryRuntimeLimit,
                workflowExecutionId: trajectoryWorkflowExecutionId,
                workspaceId: workflowWorkspaceId,
              }),
            subscribeEvents: (listener) =>
              window.setta.workspaceTrajectory.onRuntimeEvent(listener),
            workflowExecutionId: trajectoryWorkflowExecutionId,
            workspaceId: workflowWorkspaceId,
          }),
    [syntheticGraph, trajectoryWorkflowExecutionId, workflowWorkspaceId],
  );
  useEffect(() => {
    if (trajectoryStore === null) {
      return;
    }
    trajectoryStore.start();
    return () => {
      trajectoryStore.destroy();
    };
  }, [trajectoryStore]);

  useEffect(() => {
    if (trajectoryStore === null) {
      return;
    }
    const workflowNodeIds = workflowProjection?.nodes.map((node) => node.id) ?? [];
    trajectoryStore.updateAnchors({ bindings: [], workflowNodeIds });
    if (
      workflowProjection === null ||
      workflowProjection.workspaceId === "" ||
      workflowProjection.executionId === ""
    ) {
      return;
    }
    let disposed = false;
    void window.setta.workflow
      .readExecution(workflowProjection.workspaceId, workflowProjection.executionId)
      .then((execution) => {
        if (!disposed) {
          trajectoryStore.updateAnchors({
            bindings: workspaceTrajectoryRunBindingsFromExecution(execution),
            workflowNodeIds,
          });
        }
      })
      .catch((error: unknown) => {
        if (!disposed) {
          console.error("Failed to load workflow runner refs for trajectory anchors", error);
        }
      });
    return () => {
      disposed = true;
    };
  }, [
    trajectoryStore,
    workflowProjection?.executionId,
    workflowProjection?.lastEventOrdinal,
    workflowProjection?.nodes,
    workflowProjection?.workspaceId,
  ]);

  return { trajectoryStore };
}
