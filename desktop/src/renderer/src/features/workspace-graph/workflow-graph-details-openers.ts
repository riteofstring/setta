import type { WorkflowGraphProjection } from "@generated/backend";
import { useCallback, useState, type MutableRefObject } from "react";

import { useSemanticGraphStore } from "../../stores/semantic-graph-store";
import type { WorkflowNodeDetailsTarget } from "../../stores/workflow-editor-store";
import { requestWorkspacePaneOpen } from "../../workspace-layout/open-pane-events";
import { semanticNodeIdFromRendererNodeId } from "./semantic-graph-projection";
import type { SemanticGraphState } from "./semantic-graph-state";
import type { WorkflowGraphActivitySpriteTarget } from "./pixi-renderer";
import type { WorkflowGraphRendererGraph } from "./workflow-graph-surface-helpers";
import { workflowNodeDetailsTarget } from "./workflow-graph-targets";
import type { WorkspaceTrajectoryStore } from "./workspace-trajectory-store";

interface UseWorkflowGraphDetailsOpenersRequest {
  currentSceneGraphRef: MutableRefObject<WorkflowGraphRendererGraph | null>;
  semanticGraphState: SemanticGraphState;
  setSelectedNodeTarget: (target: WorkflowNodeDetailsTarget | null) => void;
  syncSceneFrameToRenderer: (force: boolean) => WorkflowGraphRendererGraph | null | undefined;
  trajectoryStore: WorkspaceTrajectoryStore | null;
  workflowProjection: WorkflowGraphProjection | null;
}

export function useWorkflowGraphDetailsOpeners({
  currentSceneGraphRef,
  semanticGraphState,
  setSelectedNodeTarget,
  syncSceneFrameToRenderer,
  trajectoryStore,
  workflowProjection,
}: UseWorkflowGraphDetailsOpenersRequest) {
  const setSelectedSemanticNodeTarget = useSemanticGraphStore(
    (state) => state.setSelectedNodeTarget,
  );
  const [activitySpritePopoverTarget, setActivitySpritePopoverTarget] =
    useState<WorkflowGraphActivitySpriteTarget | null>(null);

  const openSemanticNodeDetails = useCallback(
    (semanticNodeId: string) => {
      const node = semanticGraphState.graph?.nodes.find(
        (candidate) => candidate.id === semanticNodeId,
      );
      if (semanticGraphState.workspaceId === "" || node === undefined) {
        return;
      }
      setSelectedSemanticNodeTarget({
        nodeId: node.id,
        nodeKind: node.kind,
        nodeLabel: node.label,
        workspaceId: semanticGraphState.workspaceId,
      });
      requestWorkspacePaneOpen({
        surfaceKind: "semantic-node-details",
        subtitle: "semantic node details",
        title: "Semantic Node",
        tone: "orange",
        widthSpec: { unit: "px", value: 420 },
      });
    },
    [semanticGraphState.graph, semanticGraphState.workspaceId, setSelectedSemanticNodeTarget],
  );

  const openWorkflowNodeDetails = useCallback(
    (nodeId: string | null, options: { focusedRunItemId?: string } = {}) => {
      const target = workflowNodeDetailsTargetForSurface({
        currentSceneGraphRef,
        focusedRunItemId: options.focusedRunItemId ?? "",
        nodeId,
        syncSceneFrameToRenderer,
        trajectoryStore,
        workflowProjection,
      });
      if (target === null) {
        return;
      }
      setSelectedNodeTarget(target);
      requestWorkspacePaneOpen({
        surfaceKind: "workflow-node-details",
        subtitle: "workflow node details",
        title: "Workflow Node",
        tone: "cyan",
        widthSpec: { unit: "px", value: 380 },
      });
    },
    [
      currentSceneGraphRef,
      setSelectedNodeTarget,
      syncSceneFrameToRenderer,
      trajectoryStore,
      workflowProjection,
    ],
  );

  const openGraphNodeDetails = useCallback(
    (rendererNodeId: string | null) => {
      if (rendererNodeId === null) {
        return;
      }
      const semanticNodeId = semanticNodeIdFromRendererNodeId(rendererNodeId);
      if (semanticNodeId !== null) {
        openSemanticNodeDetails(semanticNodeId);
        return;
      }
      openWorkflowNodeDetails(rendererNodeId);
    },
    [openSemanticNodeDetails, openWorkflowNodeDetails],
  );

  const handleGraphActivitySpriteClick = useCallback(
    (target: WorkflowGraphActivitySpriteTarget) => {
      setActivitySpritePopoverTarget(target);
    },
    [],
  );

  const openActivitySpriteDetails = useCallback(
    (target: WorkflowGraphActivitySpriteTarget) => {
      openWorkflowNodeDetails(target.workflowNodeId, { focusedRunItemId: target.runItemId });
      setActivitySpritePopoverTarget(null);
    },
    [openWorkflowNodeDetails],
  );

  return {
    activitySpritePopoverTarget,
    dismissActivitySpritePopover: () => setActivitySpritePopoverTarget(null),
    handleGraphActivitySpriteClick,
    openActivitySpriteDetails,
    openGraphNodeDetails,
    openWorkflowNodeDetails,
  };
}

function workflowNodeDetailsTargetForSurface({
  currentSceneGraphRef,
  focusedRunItemId,
  nodeId,
  syncSceneFrameToRenderer,
  trajectoryStore,
  workflowProjection,
}: {
  currentSceneGraphRef: MutableRefObject<WorkflowGraphRendererGraph | null>;
  focusedRunItemId: string;
  nodeId: string | null;
  syncSceneFrameToRenderer: (force: boolean) => WorkflowGraphRendererGraph | null | undefined;
  trajectoryStore: WorkspaceTrajectoryStore | null;
  workflowProjection: WorkflowGraphProjection | null;
}): WorkflowNodeDetailsTarget | null {
  if (workflowProjection === null || nodeId === null) {
    return null;
  }
  const graphForDetails = syncSceneFrameToRenderer(true) ?? currentSceneGraphRef.current;
  const runtime = graphForDetails?.nodes.find((node) => node.id === nodeId)?.runtime ?? null;
  const trajectory = trajectoryStore?.getNodeDetails(nodeId) ?? null;
  return workflowNodeDetailsTarget(
    workflowProjection,
    nodeId,
    runtime,
    trajectory,
    focusedRunItemId,
  );
}
