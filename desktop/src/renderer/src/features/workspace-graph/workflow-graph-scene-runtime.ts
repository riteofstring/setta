import type { WorkflowGraphProjection } from "@generated/backend";
import { useCallback, useEffect, useMemo, useRef, type RefObject } from "react";

import type { WorkflowNodeDetailsTarget } from "../../stores/workflow-editor-store";
import type { SemanticActivityByNodeId } from "./semantic-graph-projection";
import type { SemanticRuntimeStore } from "./semantic-runtime-store";
import type { SyntheticWorkflowGraphOptions } from "./workflow-graph-camera-scope";
import type { WorkflowGraphRendererGraph } from "./workflow-graph-surface-helpers";
import { workflowNodeDetailsTarget } from "./workflow-graph-targets";
import {
  createWorkspaceGraphSceneStore,
  type WorkspaceGraphSceneStore,
} from "./workspace-graph-scene-store";
import type {
  WorkspaceTrajectoryFrameSnapshot,
  WorkspaceTrajectoryStore,
} from "./workspace-trajectory-store";

interface WorkflowGraphRendererUpdateTarget {
  updateGraph: (graph: WorkflowGraphRendererGraph) => void;
  updateTrajectoryRuntime: (frame: WorkspaceTrajectoryFrameSnapshot) => void;
}

interface UseWorkflowGraphSceneRuntimeRequest {
  currentSceneGraphRef: RefObject<WorkflowGraphRendererGraph | null>;
  selectedWorkflowNodeId: string | null;
  semanticActivities: SemanticActivityByNodeId;
  semanticGraph: Parameters<WorkspaceGraphSceneStore["updateInputs"]>[0]["semanticGraph"];
  semanticRuntimeStore: SemanticRuntimeStore | null;
  setSelectedNodeTarget: (target: WorkflowNodeDetailsTarget | null) => void;
  syntheticGraph: SyntheticWorkflowGraphOptions;
  trajectoryStore: WorkspaceTrajectoryStore | null;
  workflowGraph: WorkflowGraphRendererGraph | undefined;
  workflowProjection: WorkflowGraphProjection | null;
  workflowProjectionReady: boolean;
  workflowRendererRef: RefObject<WorkflowGraphRendererUpdateTarget | null>;
  workflowWorkspaceId: string;
}

export function useWorkflowGraphSceneRuntime({
  currentSceneGraphRef,
  selectedWorkflowNodeId,
  semanticActivities,
  semanticGraph,
  semanticRuntimeStore,
  setSelectedNodeTarget,
  syntheticGraph,
  trajectoryStore,
  workflowGraph,
  workflowProjection,
  workflowProjectionReady,
  workflowRendererRef,
  workflowWorkspaceId,
}: UseWorkflowGraphSceneRuntimeRequest): {
  graphSceneStore: WorkspaceGraphSceneStore;
  syncSceneFrameToRenderer: (force?: boolean) => WorkflowGraphRendererGraph | undefined;
} {
  const graphSceneStore = useMemo(() => createWorkspaceGraphSceneStore(), []);
  const lastSceneGraphVersionRef = useRef(0);
  const lastTrajectoryFrameRef = useRef<object | null>(null);

  useEffect(() => {
    graphSceneStore.updateInputs({
      semanticActivities,
      semanticGraph,
      semanticRuntimeStore,
      syntheticGraph,
      trajectoryStore,
      workflowGraph,
      workflowProjectionReady,
      workflowWorkspaceId,
    });
  }, [
    graphSceneStore,
    semanticActivities,
    semanticGraph,
    semanticRuntimeStore,
    syntheticGraph,
    trajectoryStore,
    workflowGraph,
    workflowProjectionReady,
    workflowWorkspaceId,
  ]);

  useEffect(() => {
    return () => {
      graphSceneStore.destroy();
    };
  }, [graphSceneStore]);

  const syncSceneFrameToRenderer = useCallback(
    (force = false) => {
      const frame = graphSceneStore.getFrameSnapshot();
      const renderer = workflowRendererRef.current;
      syncSceneGraphFrame({
        currentSceneGraphRef,
        force,
        frame,
        lastSceneGraphVersionRef,
        renderer,
      });
      syncTrajectoryFrame({
        force,
        frame,
        lastTrajectoryFrameRef,
        renderer,
      });
      return frame.graph;
    },
    [currentSceneGraphRef, graphSceneStore, workflowRendererRef],
  );

  useEffect(() => {
    syncSceneFrameToRenderer();
    return graphSceneStore.subscribe(syncSceneFrameToRenderer);
  }, [graphSceneStore, syncSceneFrameToRenderer]);

  const syncSelectedWorkflowNodeTarget = useCallback(() => {
    if (workflowProjection === null || selectedWorkflowNodeId === null) {
      return;
    }
    const runtime =
      currentSceneGraphRef.current?.nodes.find((node) => node.id === selectedWorkflowNodeId)
        ?.runtime ?? null;
    const trajectory = trajectoryStore?.getNodeDetails(selectedWorkflowNodeId) ?? null;
    setSelectedNodeTarget(
      workflowNodeDetailsTarget(workflowProjection, selectedWorkflowNodeId, runtime, trajectory),
    );
  }, [
    currentSceneGraphRef,
    selectedWorkflowNodeId,
    setSelectedNodeTarget,
    trajectoryStore,
    workflowProjection,
  ]);

  useEffect(() => {
    if (selectedWorkflowNodeId === null || workflowProjection === null) {
      return;
    }
    syncSelectedWorkflowNodeTarget();
    return graphSceneStore.subscribe(syncSelectedWorkflowNodeTarget);
  }, [graphSceneStore, selectedWorkflowNodeId, syncSelectedWorkflowNodeTarget, workflowProjection]);

  return { graphSceneStore, syncSceneFrameToRenderer };
}

type WorkspaceGraphSceneFrameSnapshot = ReturnType<WorkspaceGraphSceneStore["getFrameSnapshot"]>;

function syncSceneGraphFrame({
  currentSceneGraphRef,
  force,
  frame,
  lastSceneGraphVersionRef,
  renderer,
}: {
  currentSceneGraphRef: RefObject<WorkflowGraphRendererGraph | null>;
  force: boolean;
  frame: WorkspaceGraphSceneFrameSnapshot;
  lastSceneGraphVersionRef: { current: number };
  renderer: WorkflowGraphRendererUpdateTarget | null;
}) {
  if (frame.graph === undefined) {
    currentSceneGraphRef.current = null;
    return;
  }
  currentSceneGraphRef.current = frame.graph;
  if (renderer === null || (!force && lastSceneGraphVersionRef.current === frame.graphVersion)) {
    return;
  }
  lastSceneGraphVersionRef.current = frame.graphVersion;
  renderer.updateGraph(frame.graph);
}

function syncTrajectoryFrame({
  force,
  frame,
  lastTrajectoryFrameRef,
  renderer,
}: {
  force: boolean;
  frame: WorkspaceGraphSceneFrameSnapshot;
  lastTrajectoryFrameRef: { current: object | null };
  renderer: WorkflowGraphRendererUpdateTarget | null;
}) {
  if (
    frame.trajectory === null ||
    renderer === null ||
    (!force && lastTrajectoryFrameRef.current === frame.trajectory)
  ) {
    return;
  }
  lastTrajectoryFrameRef.current = frame.trajectory;
  renderer.updateTrajectoryRuntime(frame.trajectory);
}
