import type { WorkflowGraphProjection } from "@generated/backend";
import type { RefObject } from "react";
import { useEffect, useMemo, useRef } from "react";

import type { WorkflowNodeDetailsTarget } from "../../stores/workflow-editor-store";
import type { WorkflowGraphRenderer } from "./pixi-renderer";
import type { SyntheticWorkflowGraphOptions } from "./workflow-graph-camera-scope";
import type { WorkflowGraphRendererGraph } from "./workflow-graph-surface-helpers";
import { workflowNodeDetailsTarget } from "./workflow-graph-targets";
import {
  createWorkspaceTrajectoryStore,
  workspaceTrajectoryRunBindingsFromExecution,
  type WorkspaceTrajectoryStore,
} from "./workspace-trajectory-store";

const workspaceTrajectoryRuntimeLimit = 80;

interface UseWorkspaceTrajectoryRuntimeRequest {
  pendingWorkflowGraphRef: RefObject<WorkflowGraphRendererGraph | null>;
  selectedWorkflowNodeId: string | null;
  setSelectedNodeTarget: (target: WorkflowNodeDetailsTarget | null) => void;
  syntheticGraph: SyntheticWorkflowGraphOptions | null;
  workflowProjection: WorkflowGraphProjection | null;
  workflowRendererRef: RefObject<WorkflowGraphRenderer | null>;
  workflowWorkspaceId: string;
}

export function useWorkspaceTrajectoryRuntime({
  pendingWorkflowGraphRef,
  selectedWorkflowNodeId,
  setSelectedNodeTarget,
  syntheticGraph,
  workflowProjection,
  workflowRendererRef,
  workflowWorkspaceId,
}: UseWorkspaceTrajectoryRuntimeRequest): {
  trajectoryStore: WorkspaceTrajectoryStore | null;
  trajectoryStoreRef: RefObject<WorkspaceTrajectoryStore | null>;
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
  const trajectoryStoreRef = useRef<WorkspaceTrajectoryStore | null>(trajectoryStore);
  trajectoryStoreRef.current = trajectoryStore;

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
    const syncTrajectoryFrame = () => {
      workflowRendererRef.current?.updateTrajectoryRuntime(trajectoryStore.getFrameSnapshot());
    };
    syncTrajectoryFrame();
    return trajectoryStore.subscribe(syncTrajectoryFrame);
  }, [trajectoryStore, workflowRendererRef]);

  useEffect(() => {
    if (
      trajectoryStore === null ||
      selectedWorkflowNodeId === null ||
      workflowProjection === null
    ) {
      return;
    }
    const syncSelectedNodeTrajectory = () => {
      const runtime =
        pendingWorkflowGraphRef.current?.nodes.find((node) => node.id === selectedWorkflowNodeId)
          ?.runtime ?? null;
      setSelectedNodeTarget(
        workflowNodeDetailsTarget(
          workflowProjection,
          selectedWorkflowNodeId,
          runtime,
          trajectoryStore.getNodeDetails(selectedWorkflowNodeId),
        ),
      );
    };
    syncSelectedNodeTrajectory();
    return trajectoryStore.subscribe(syncSelectedNodeTrajectory);
  }, [
    pendingWorkflowGraphRef,
    selectedWorkflowNodeId,
    setSelectedNodeTarget,
    trajectoryStore,
    workflowProjection,
  ]);

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

  return { trajectoryStore, trajectoryStoreRef };
}
