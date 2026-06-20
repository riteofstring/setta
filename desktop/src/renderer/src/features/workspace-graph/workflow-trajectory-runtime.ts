import type {
  WorkflowGraphProjection,
  WorkspaceTrajectorySprite,
  WorkspaceTrajectorySpriteKind,
  WorkspaceTrajectorySpriteSeverity,
} from "@generated/backend";
import { useEffect, useMemo } from "react";

import type { SyntheticWorkflowGraphOptions } from "./workflow-graph-camera-scope";
import {
  createWorkspaceTrajectoryStore,
  workspaceTrajectoryRunBindingsFromExecution,
  type WorkspaceTrajectoryFrameSnapshot,
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
  const trajectoryStore = useMemo<WorkspaceTrajectoryStore | null>(() => {
    const syntheticStore = syntheticTrajectoryStoreForGraph(syntheticGraph);
    if (syntheticStore !== null) {
      return syntheticStore;
    }
    return workflowWorkspaceId === ""
      ? null
      : createWorkspaceTrajectoryStore({
          loadSnapshot: () =>
            window.setta.workspaceTrajectory.readRuntimeSnapshot({
              chatRunId: "",
              limit: workspaceTrajectoryRuntimeLimit,
              workflowExecutionId: trajectoryWorkflowExecutionId,
              workspaceId: workflowWorkspaceId,
            }),
          subscribeEvents: (listener) => window.setta.workspaceTrajectory.onRuntimeEvent(listener),
          workflowExecutionId: trajectoryWorkflowExecutionId,
          workspaceId: workflowWorkspaceId,
        });
  }, [syntheticGraph, trajectoryWorkflowExecutionId, workflowWorkspaceId]);
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

function syntheticTrajectoryStoreForGraph(
  syntheticGraph: SyntheticWorkflowGraphOptions | null,
): WorkspaceTrajectoryStore | null {
  if (syntheticGraph === null) {
    return null;
  }
  const scene = syntheticGraph.scene ?? "workflow";
  const spriteCount = phase0SyntheticTrajectorySpriteCount(scene, syntheticGraph.nodeCount);
  if (spriteCount === 0) {
    return null;
  }
  return createSyntheticTrajectoryStore({
    spriteCount,
    workflowNodeCount: phase0SyntheticWorkflowNodeCount(scene, syntheticGraph.nodeCount),
  });
}

function phase0SyntheticTrajectorySpriteCount(scene: string, nodeCount: number): number {
  switch (scene) {
    case "phase0-normal":
    case "phase0-scaling":
      return 200;
    case "phase0-dense":
      return 1000;
    case "phase0-stress":
      return 2000;
    default:
      return nodeCount === 0 ? 0 : 0;
  }
}

function phase0SyntheticWorkflowNodeCount(scene: string, nodeCount: number): number {
  switch (scene) {
    case "phase0-normal":
      return 100;
    case "phase0-dense":
      return 500;
    case "phase0-stress":
      return 1000;
    case "phase0-scaling":
      return nodeCount;
    default:
      return 0;
  }
}

function createSyntheticTrajectoryStore({
  spriteCount,
  workflowNodeCount,
}: {
  spriteCount: number;
  workflowNodeCount: number;
}): WorkspaceTrajectoryStore {
  const frame = syntheticTrajectoryFrame({ spriteCount, workflowNodeCount });
  const listeners = new Set<() => void>();
  return {
    destroy: () => {
      listeners.clear();
    },
    getFrameSnapshot: () => frame,
    getNodeDetails: (workflowNodeId) => ({
      hiddenCount: 0,
      items: frame.groups.find((group) => group.workflowNodeId === workflowNodeId)?.items ?? [],
      revision: frame.revision,
      timeline: [],
      totalCount:
        frame.groups.find((group) => group.workflowNodeId === workflowNodeId)?.totalCount ?? 0,
      workflowNodeId,
    }),
    handleEvent: () => undefined,
    start: () => {
      for (const listener of listeners) {
        listener();
      }
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    updateAnchors: () => undefined,
  };
}

function syntheticTrajectoryFrame({
  spriteCount,
  workflowNodeCount,
}: {
  spriteCount: number;
  workflowNodeCount: number;
}): WorkspaceTrajectoryFrameSnapshot {
  const updatedAt = "2026-06-18T00:00:00.000Z";
  const groups = [];
  const groupCount = Math.max(1, Math.min(workflowNodeCount, Math.ceil(spriteCount / 4)));
  let remaining = spriteCount;
  for (let index = 0; index < groupCount; index += 1) {
    const workflowNodeId = phase0WorkflowNodeId(index % Math.max(1, workflowNodeCount));
    const visibleCount = Math.min(4, remaining);
    const hiddenCount = Math.max(0, Math.min(remaining - visibleCount, 12));
    const items = Array.from({ length: visibleCount }, (_, ordinal) => {
      const sprite = syntheticTrajectorySprite({
        index: spriteCount - remaining + ordinal,
        updatedAt,
        workflowNodeId,
      });
      return {
        anchorNodeId: workflowNodeId,
        id: sprite.id,
        lane: "workflow_node" as const,
        sprite,
        type: "sprite" as const,
      };
    });
    groups.push({
      hiddenCount,
      highestSeverity: syntheticTrajectorySeverity(index),
      items,
      totalCount: visibleCount + hiddenCount,
      updatedAt,
      workflowNodeId,
    });
    remaining -= visibleCount + hiddenCount;
    if (remaining <= 0) {
      break;
    }
  }
  const recentLane = groups
    .flatMap((group) => group.items)
    .slice(0, 8)
    .map((display) => ({ ...display, lane: "recent" as const }));
  return {
    anchoredSpriteCount: spriteCount,
    error: "",
    groups,
    loading: false,
    ready: true,
    recentLane,
    revision: 1,
    totalSpriteCount: spriteCount,
    version: 1,
    workflowExecutionId: "phase0-synthetic-execution",
    workspaceId: "phase0-synthetic-workspace",
  };
}

function syntheticTrajectorySprite({
  index,
  updatedAt,
  workflowNodeId,
}: {
  index: number;
  updatedAt: string;
  workflowNodeId: string;
}): WorkspaceTrajectorySprite {
  const kind = syntheticTrajectoryKind(index);
  return {
    cartographerPatchId: "",
    cartographerRunId: "phase0-cartographer-run",
    cartographerWindowId: "",
    chatConversationId: "phase0-conversation",
    chatMessageId: "",
    chatRunId: "phase0-chat-run",
    command: {
      command: "",
      cwd: "",
      durationMs: 0,
      exitCode: 0,
    },
    createdAt: updatedAt,
    diffStats: {
      additions: 0,
      changedFiles: 0,
      deletions: 0,
      structured: false,
      summary: "",
    },
    errorSummary: "",
    expiresAt: "",
    fileRefs: [],
    id: `phase0-trajectory-sprite-${index.toString().padStart(5, "0")}`,
    kind,
    providerItemId: "",
    resultSummary: "",
    runItemId: `phase0-run-item-${index.toString().padStart(5, "0")}`,
    schemaVersion: 1,
    severity: syntheticTrajectorySeverity(index),
    sourceRefs: [],
    status: index % 5 === 0 ? "completed" : "running",
    subtitle: kind.replaceAll("_", " "),
    title: `Synthetic ${index.toString().padStart(4, "0")}`,
    tool: {
      namespace: "",
      requestId: "",
      serverName: "",
      toolName: "",
    },
    ttlMs: 0,
    updatedAt,
    workflowExecutionId: "phase0-synthetic-execution",
    workflowNodeExecutionId: `phase0-node-execution-${index.toString().padStart(5, "0")}`,
    workflowNodeId,
    workspaceId: "phase0-synthetic-workspace",
  };
}

function phase0WorkflowNodeId(index: number): string {
  return `phase0-workflow-node-${index.toString().padStart(5, "0")}`;
}

function syntheticTrajectoryKind(index: number): WorkspaceTrajectorySpriteKind {
  const kinds = [
    "assistant_message",
    "command",
    "tool_call",
    "reasoning_summary",
    "workflow_status",
  ] as const;
  return kinds[index % kinds.length] ?? "assistant_message";
}

function syntheticTrajectorySeverity(index: number): WorkspaceTrajectorySpriteSeverity {
  const severities = ["info", "success", "warning", "error", "blocking"] as const;
  return severities[index % severities.length] ?? "info";
}
