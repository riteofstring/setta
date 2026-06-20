import type {
  SemanticContextSourceRefs,
  SemanticGraph,
  SemanticRuntimeSnapshot,
  SemanticWorkingSet,
} from "@generated/backend";
import { describe, expect, test, vi } from "vitest";

import type { WorkflowGraphGraph } from "./pixi-renderer";
import {
  createWorkspaceGraphSceneStore,
  materializeWorkspaceGraphSceneGraph,
} from "./workspace-graph-scene-store";
import type { SemanticRuntimeFrameSnapshot, SemanticRuntimeStore } from "./semantic-runtime-store";
import type {
  WorkspaceTrajectoryFrameSnapshot,
  WorkspaceTrajectoryNodeDetails,
  WorkspaceTrajectoryStore,
} from "./workspace-trajectory-store";

describe("workspace graph scene store", () => {
  test("coalesces semantic and trajectory runtime frames before publishing a scene frame", () => {
    const scheduler = manualScheduler();
    const semanticRuntime = fakeSemanticRuntimeStore(semanticRuntimeFrame({ revision: 1 }));
    const trajectory = fakeTrajectoryStore(trajectoryFrame({ version: 1 }));
    const store = createWorkspaceGraphSceneStore({ scheduleFrame: scheduler.scheduleFrame });
    const listener = vi.fn();

    store.updateInputs(
      sceneInputs({ semanticRuntimeStore: semanticRuntime, trajectoryStore: trajectory }),
    );
    store.subscribe(listener);
    scheduler.flushFrame();

    const initial = store.getFrameSnapshot();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(initial.graphVersion).toBe(1);
    expect(initial.graph?.workflowRuntimeByNodeId?.reviewer).toMatchObject({
      status: "running",
      sourceCount: 1,
    });
    expect(initial.trajectory?.version).toBe(1);

    listener.mockClear();
    semanticRuntime.emit(semanticRuntimeFrame({ revision: 2, status: "queued" }));
    trajectory.emit(trajectoryFrame({ version: 2, totalSpriteCount: 3 }));

    expect(listener).not.toHaveBeenCalled();
    scheduler.flushFrame();

    const next = store.getFrameSnapshot();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(next.graphVersion).toBe(2);
    expect(next.graph?.workflowRuntimeByNodeId?.reviewer?.status).toBe("queued");
    expect(next.trajectory).toMatchObject({ totalSpriteCount: 3, version: 2 });
  });

  test("keeps trajectory-only frames from rebuilding graph arrays", () => {
    const scheduler = manualScheduler();
    const semanticRuntime = fakeSemanticRuntimeStore(semanticRuntimeFrame({ revision: 1 }));
    const trajectory = fakeTrajectoryStore(trajectoryFrame({ version: 1 }));
    const store = createWorkspaceGraphSceneStore({ scheduleFrame: scheduler.scheduleFrame });

    store.updateInputs(
      sceneInputs({ semanticRuntimeStore: semanticRuntime, trajectoryStore: trajectory }),
    );
    scheduler.flushFrame();
    const initial = store.getFrameSnapshot();

    trajectory.emit(trajectoryFrame({ totalSpriteCount: 2, version: 2 }));
    scheduler.flushFrame();

    const next = store.getFrameSnapshot();
    expect(next.graph).toBe(initial.graph);
    expect(next.graphVersion).toBe(initial.graphVersion);
    expect(next.trajectoryVersion).toBe(2);
  });

  test("camera movement only notifies local scene runtime state", () => {
    const scheduler = manualScheduler();
    const semanticRuntime = fakeSemanticRuntimeStore(semanticRuntimeFrame({ revision: 1 }));
    const store = createWorkspaceGraphSceneStore({ scheduleFrame: scheduler.scheduleFrame });
    const listener = vi.fn();

    store.updateInputs(sceneInputs({ semanticRuntimeStore: semanticRuntime }));
    store.subscribe(listener);
    scheduler.flushFrame();
    listener.mockClear();

    store.noteCameraMovement();
    store.noteCameraMovement();

    expect(semanticRuntime.noteCameraMovement).toHaveBeenCalledTimes(2);
    expect(listener).not.toHaveBeenCalled();
    expect(scheduler.pendingFrameCount()).toBe(0);
  });

  test("materializes a complete graph scene without a runtime store", () => {
    const graph = materializeWorkspaceGraphSceneGraph(sceneInputs());

    expect(graph?.nodes.map((node) => node.id)).toEqual([
      "reviewer",
      "semantic:semantic_node_review",
    ]);
    expect(graph?.workflowRuntimeByNodeId).toEqual({});
  });
});

function sceneInputs({
  semanticRuntimeStore = null,
  trajectoryStore = null,
}: {
  semanticRuntimeStore?: SemanticRuntimeStore | null;
  trajectoryStore?: WorkspaceTrajectoryStore | null;
} = {}) {
  return {
    semanticActivities: new Map(),
    semanticGraph: semanticGraph(),
    semanticRuntimeStore,
    syntheticGraph: null,
    trajectoryStore,
    workflowGraph: workflowGraph(),
    workflowProjectionReady: true,
    workflowWorkspaceId: "workspace_graph",
  };
}

function workflowGraph(): WorkflowGraphGraph {
  return {
    edges: [],
    nodes: [
      {
        color: 0x67e8f9,
        height: 88,
        id: "reviewer",
        label: "Reviewer",
        layer: "workflow",
        width: 180,
        x: 0,
        y: 0,
      },
    ],
    workflow: {
      definitionId: "workflow_definition_review",
      definitionName: "Review",
      definitionVersionId: "workflow_version_review",
      definitionVersionNumber: 1,
      draftRevision: "draft_revision_review",
      editable: false,
      executionId: "workflow_execution_review",
      executionStatus: "running",
      versionMismatch: false,
      viewMode: "run",
      workspaceId: "workspace_graph",
    },
  };
}

function semanticGraph(): SemanticGraph {
  return {
    edges: [],
    layoutPositions: [],
    nodes: [
      {
        createdAt: timestamp(1),
        createdByEventId: "semantic_event_created",
        dismissed: false,
        futureUse: "Use this finding when reviewing workflow runtime ownership.",
        id: "semantic_node_review",
        kind: "finding",
        label: "Runtime ownership",
        mergedIntoNodeId: "",
        promoted: true,
        splitFromNodeId: "",
        splitIntoNodeIds: [],
        summary: "Runtime state is owned outside React graph arrays.",
        updatedAt: timestamp(1),
        updatedByEventId: "semantic_event_updated",
        whyItExists: "It records the durable runtime ownership decision.",
        workspaceId: "workspace_graph",
      },
    ],
    sourceLinks: [],
    workspaceId: "workspace_graph",
  };
}

function semanticRuntimeFrame({
  revision,
  status = "running",
}: {
  revision: number;
  status?: SemanticWorkingSet["liveSourceRefs"][number]["status"];
}): SemanticRuntimeFrameSnapshot {
  return {
    cameraMoving: false,
    error: "",
    loading: false,
    ready: true,
    revision,
    version: revision,
    workingSet: semanticWorkingSet({ status }),
    workspaceId: "workspace_graph",
  };
}

function semanticWorkingSet({
  status,
}: {
  status: SemanticWorkingSet["liveSourceRefs"][number]["status"];
}): SemanticWorkingSet {
  return {
    activeCartographerRuns: [],
    activeCartographerWindows: [],
    activeRunItemIds: [],
    activeWorkflowNodeIds: ["reviewer"],
    candidateTargets: [],
    chatRunId: "",
    lastUpdatedAt: timestamp(1),
    liveSourceRefs: [
      {
        changedSemanticEdgeIds: [],
        changedSemanticNodeIds: ["semantic_node_review"],
        diagnostics: [],
        id: "semantic_runtime_source_review",
        modelAudit: null,
        patchId: "",
        patchOperationNames: [],
        publicSummary: "",
        runId: "cartographer_run_review",
        sourceRefs: sourceRefs(),
        status,
        targetEntityId: "semantic_node_review",
        triggerKind: "manual",
        updatedAt: timestamp(1),
        windowId: "",
      },
    ],
    pendingPatchPreviews: [],
    pulses: [],
    recentCartographerRuns: [],
    recentSemanticChanges: [],
    workflowExecutionId: "workflow_execution_review",
    workspaceId: "workspace_graph",
  };
}

function sourceRefs(): SemanticContextSourceRefs {
  return {
    chatConversationId: "",
    chatMessageId: "",
    chatRunId: "",
    runItemId: "",
    workflowDefinitionId: "workflow_definition_review",
    workflowExecutionId: "workflow_execution_review",
    workflowNodeExecutionId: "workflow_node_execution_review",
    workflowNodeId: "reviewer",
  };
}

function trajectoryFrame({
  totalSpriteCount = 1,
  version,
}: {
  totalSpriteCount?: number;
  version: number;
}): WorkspaceTrajectoryFrameSnapshot {
  return {
    anchoredSpriteCount: totalSpriteCount,
    error: "",
    groups: [],
    loading: false,
    ready: true,
    recentLane: [],
    revision: version,
    totalSpriteCount,
    version,
    workflowExecutionId: "workflow_execution_review",
    workspaceId: "workspace_graph",
  };
}

function fakeSemanticRuntimeStore(initialFrame: SemanticRuntimeFrameSnapshot) {
  let frame = initialFrame;
  const listeners = new Set<() => void>();
  const store = {
    destroy: vi.fn(),
    emit: (nextFrame) => {
      frame = nextFrame;
      for (const listener of listeners) {
        listener();
      }
    },
    getFrameSnapshot: () => frame,
    getSnapshot: () => null as SemanticRuntimeSnapshot | null,
    handleEvent: vi.fn(),
    noteCameraMovement: vi.fn(),
    start: vi.fn(),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  } satisfies SemanticRuntimeStore & { emit: (nextFrame: SemanticRuntimeFrameSnapshot) => void };
  return store;
}

function fakeTrajectoryStore(initialFrame: WorkspaceTrajectoryFrameSnapshot) {
  let frame = initialFrame;
  const listeners = new Set<() => void>();
  const emptyDetails: WorkspaceTrajectoryNodeDetails = {
    hiddenCount: 0,
    revision: 0,
    sprites: [],
    timeline: [],
    totalCount: 0,
    workflowNodeId: "",
  };
  const store: WorkspaceTrajectoryStore & {
    emit: (nextFrame: WorkspaceTrajectoryFrameSnapshot) => void;
  } = {
    destroy: vi.fn(),
    emit: (nextFrame) => {
      frame = nextFrame;
      for (const listener of listeners) {
        listener();
      }
    },
    getFrameSnapshot: () => frame,
    getNodeDetails: () => emptyDetails,
    handleEvent: () => undefined,
    start: vi.fn(),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    updateAnchors: vi.fn(),
  };
  return store;
}

function manualScheduler() {
  const frames: Array<() => void> = [];
  return {
    flushFrame: () => {
      const callback = frames.shift();
      callback?.();
    },
    pendingFrameCount: () => frames.length,
    scheduleFrame: (callback: () => void) => {
      frames.push(callback);
      return () => removeCallback(frames, callback);
    },
  };
}

function removeCallback(callbacks: Array<() => void>, callback: () => void) {
  const index = callbacks.indexOf(callback);
  if (index >= 0) {
    callbacks.splice(index, 1);
  }
}

function timestamp(sequence: number) {
  return `2026-06-17T12:00:${String(sequence).padStart(2, "0")}Z`;
}
