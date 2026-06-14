import type {
  SemanticGraphChangeEvent,
  SemanticRuntimeDelta,
  SemanticRuntimeRunItem,
  SemanticRuntimeSnapshot,
  SemanticRuntimeSourceAggregate,
  SemanticRuntimeWorkflowNode,
} from "@generated/backend";
import { describe, expect, test, vi } from "vitest";

import { createSemanticRuntimeStore } from "./semantic-runtime-store";

describe("semantic runtime store", () => {
  test("coalesces runtime delta bursts by animation frame and entity id", async () => {
    const scheduler = manualScheduler();
    const loadSnapshot = vi.fn(async () => runtimeSnapshot({ revision: 1 }));
    const events = eventSource();
    const store = createSemanticRuntimeStore({
      loadSnapshot,
      scheduleDelay: scheduler.scheduleDelay,
      scheduleFrame: scheduler.scheduleFrame,
      subscribeEvents: events.subscribe,
      workspaceId: "workspace_graph",
    });

    store.start();
    await flushPromises();
    const listener = vi.fn();
    store.subscribe(listener);

    events.emit(
      semanticRuntimeEvent({
        delta: runtimeDelta({
          aggregateSourceUpdates: [
            aggregateSource({ runIds: ["cartographer_run_a"], status: "queued" }),
          ],
          fromRevision: 1,
          toRevision: 2,
        }),
      }),
    );
    events.emit(
      semanticRuntimeEvent({
        delta: runtimeDelta({
          aggregateSourceUpdates: [
            aggregateSource({ runIds: ["cartographer_run_b"], status: "running" }),
          ],
          fromRevision: 2,
          toRevision: 3,
        }),
      }),
    );

    expect(listener).not.toHaveBeenCalled();
    expect(store.getFrameSnapshot().revision).toBe(1);

    scheduler.flushFrame();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(loadSnapshot).toHaveBeenCalledTimes(1);
    expect(store.getFrameSnapshot().revision).toBe(3);
    expect(store.getFrameSnapshot().workingSet?.liveSourceRefs).toMatchObject([
      { runId: "cartographer_run_b", status: "running" },
    ]);
  });

  test("removes workflow and run-item runtime entries by source id when removal is latest", async () => {
    const scheduler = manualScheduler();
    const loadSnapshot = vi.fn(async () =>
      runtimeSnapshot({
        revision: 1,
        runItemUpdates: [runtimeRunItem({ runItemId: "run_item_review" })],
        workflowNodeUpdates: [runtimeWorkflowNode({ workflowNodeId: "reviewer" })],
      }),
    );
    const events = eventSource();
    const store = createSemanticRuntimeStore({
      loadSnapshot,
      scheduleDelay: scheduler.scheduleDelay,
      scheduleFrame: scheduler.scheduleFrame,
      subscribeEvents: events.subscribe,
      workspaceId: "workspace_graph",
    });

    store.start();
    await flushPromises();

    events.emit(
      semanticRuntimeEvent({
        delta: runtimeDelta({
          fromRevision: 1,
          runItemUpdates: [runtimeRunItem({ runItemId: "run_item_review" })],
          toRevision: 2,
          workflowNodeUpdates: [runtimeWorkflowNode({ workflowNodeId: "reviewer" })],
        }),
      }),
    );
    events.emit(
      semanticRuntimeEvent({
        delta: runtimeDelta({
          fromRevision: 2,
          removals: {
            runItemIds: ["run_item_review"],
            workflowNodeIds: ["reviewer"],
          },
          toRevision: 3,
        }),
      }),
    );
    scheduler.flushFrame();

    expect(store.getSnapshot()?.workflow.workflowNodeUpdates).toEqual([]);
    expect(store.getSnapshot()?.workflow.runItemUpdates).toEqual([]);
    expect(store.getFrameSnapshot().workingSet?.activeWorkflowNodeIds).toEqual([]);
    expect(store.getFrameSnapshot().workingSet?.activeRunItemIds).toEqual([]);
  });

  test("keeps workflow and run-item runtime updates by source id when update is latest", async () => {
    const scheduler = manualScheduler();
    const loadSnapshot = vi.fn(async () => runtimeSnapshot({ revision: 1 }));
    const events = eventSource();
    const store = createSemanticRuntimeStore({
      loadSnapshot,
      scheduleDelay: scheduler.scheduleDelay,
      scheduleFrame: scheduler.scheduleFrame,
      subscribeEvents: events.subscribe,
      workspaceId: "workspace_graph",
    });

    store.start();
    await flushPromises();

    events.emit(
      semanticRuntimeEvent({
        delta: runtimeDelta({
          fromRevision: 1,
          removals: {
            runItemIds: ["run_item_review"],
            workflowNodeIds: ["reviewer"],
          },
          toRevision: 2,
        }),
      }),
    );
    events.emit(
      semanticRuntimeEvent({
        delta: runtimeDelta({
          fromRevision: 2,
          runItemUpdates: [runtimeRunItem({ runItemId: "run_item_review" })],
          toRevision: 3,
          workflowNodeUpdates: [runtimeWorkflowNode({ workflowNodeId: "reviewer" })],
        }),
      }),
    );
    scheduler.flushFrame();

    expect(store.getSnapshot()?.workflow.activeWorkflowNodeIds).toEqual(["reviewer"]);
    expect(store.getSnapshot()?.workflow.activeRunItemIds).toEqual(["run_item_review"]);
    expect(store.getFrameSnapshot().workingSet?.activeWorkflowNodeIds).toEqual(["reviewer"]);
    expect(store.getFrameSnapshot().workingSet?.activeRunItemIds).toEqual(["run_item_review"]);
  });

  test("drops stale deltas without notifying or reloading", async () => {
    const scheduler = manualScheduler();
    const loadSnapshot = vi.fn(async () => runtimeSnapshot({ revision: 3 }));
    const events = eventSource();
    const store = createSemanticRuntimeStore({
      loadSnapshot,
      scheduleDelay: scheduler.scheduleDelay,
      scheduleFrame: scheduler.scheduleFrame,
      subscribeEvents: events.subscribe,
      workspaceId: "workspace_graph",
    });

    store.start();
    await flushPromises();
    const listener = vi.fn();
    store.subscribe(listener);

    events.emit(
      semanticRuntimeEvent({
        delta: runtimeDelta({
          aggregateSourceUpdates: [
            aggregateSource({ runIds: ["cartographer_run_stale"], status: "running" }),
          ],
          fromRevision: 2,
          toRevision: 3,
        }),
      }),
    );
    scheduler.flushFrame();

    expect(listener).not.toHaveBeenCalled();
    expect(loadSnapshot).toHaveBeenCalledTimes(1);
    expect(store.getFrameSnapshot().revision).toBe(3);
    expect(store.getFrameSnapshot().workingSet?.liveSourceRefs).toEqual([]);
  });

  test("recovers revision gaps with a single in-flight snapshot reload", async () => {
    const scheduler = manualScheduler();
    const events = eventSource();
    const reload = deferred<SemanticRuntimeSnapshot>();
    const loadSnapshot = vi
      .fn<() => Promise<SemanticRuntimeSnapshot>>()
      .mockResolvedValueOnce(runtimeSnapshot({ revision: 1 }))
      .mockImplementationOnce(() => reload.promise);
    const store = createSemanticRuntimeStore({
      loadSnapshot,
      scheduleDelay: scheduler.scheduleDelay,
      scheduleFrame: scheduler.scheduleFrame,
      subscribeEvents: events.subscribe,
      workspaceId: "workspace_graph",
    });

    store.start();
    await flushPromises();
    const listener = vi.fn();
    store.subscribe(listener);

    events.emit(
      semanticRuntimeEvent({
        delta: runtimeDelta({
          aggregateSourceUpdates: [
            aggregateSource({ runIds: ["cartographer_run_gap"], status: "running" }),
          ],
          fromRevision: 3,
          toRevision: 4,
        }),
      }),
    );
    events.emit(
      semanticRuntimeEvent({
        revision: 5,
        snapshotRequired: true,
      }),
    );

    expect(loadSnapshot).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenCalledTimes(1);
    listener.mockClear();
    reload.resolve(
      runtimeSnapshot({
        aggregateSources: [
          aggregateSource({ runIds: ["cartographer_run_reloaded"], status: "running" }),
        ],
        revision: 5,
      }),
    );
    await flushPromises();

    expect(loadSnapshot).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getFrameSnapshot().revision).toBe(5);
    expect(store.getFrameSnapshot().workingSet?.liveSourceRefs).toMatchObject([
      { runId: "cartographer_run_reloaded", status: "running" },
    ]);
  });

  test("defers visual notifications while camera movement is settling", async () => {
    const scheduler = manualScheduler();
    const events = eventSource();
    const loadSnapshot = vi.fn(async () => runtimeSnapshot({ revision: 1 }));
    const store = createSemanticRuntimeStore({
      cameraSettleDelayMs: 80,
      loadSnapshot,
      scheduleDelay: scheduler.scheduleDelay,
      scheduleFrame: scheduler.scheduleFrame,
      subscribeEvents: events.subscribe,
      workspaceId: "workspace_graph",
    });

    store.start();
    await flushPromises();
    const listener = vi.fn();
    store.subscribe(listener);
    store.noteCameraMovement();

    events.emit(
      semanticRuntimeEvent({
        delta: runtimeDelta({
          aggregateSourceUpdates: [
            aggregateSource({ runIds: ["cartographer_run_camera"], status: "running" }),
          ],
          fromRevision: 1,
          toRevision: 2,
        }),
      }),
    );
    scheduler.flushFrame();

    expect(listener).not.toHaveBeenCalled();
    expect(store.getSnapshot()?.revision).toBe(2);
    expect(store.getFrameSnapshot().revision).toBe(1);

    scheduler.flushDelay();
    scheduler.flushFrame();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getFrameSnapshot().revision).toBe(2);
  });
});

function manualScheduler() {
  const frames: Array<() => void> = [];
  const delays: Array<() => void> = [];
  return {
    flushDelay: () => {
      const callback = delays.shift();
      callback?.();
    },
    flushFrame: () => {
      const callback = frames.shift();
      callback?.();
    },
    scheduleDelay: (callback: () => void) => {
      delays.push(callback);
      return () => removeCallback(delays, callback);
    },
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

function eventSource() {
  let listener: ((event: SemanticGraphChangeEvent) => void) | null = null;
  return {
    emit: (event: SemanticGraphChangeEvent) => {
      listener?.(event);
    },
    subscribe: (nextListener: (event: SemanticGraphChangeEvent) => void) => {
      listener = nextListener;
      return () => {
        if (listener === nextListener) {
          listener = null;
        }
      };
    },
  };
}

function semanticRuntimeEvent({
  delta = null,
  revision = delta?.toRevision ?? 1,
  snapshotRequired = false,
}: {
  delta?: SemanticRuntimeDelta | null;
  revision?: number;
  snapshotRequired?: boolean;
} = {}): SemanticGraphChangeEvent {
  return {
    cartographerPatchIds: [],
    cartographerRunIds: [],
    cartographerWindowIds: [],
    changedAreas: ["cartographer_audit", "working_set"],
    createdSemanticEventIds: [],
    eventId: `semantic_graph_changes:${revision}`,
    occurredAt: timestamp(revision),
    schemaVersion: 1,
    semanticEdgeIds: [],
    semanticNodeIds: [],
    semanticRuntimeDelta: delta,
    semanticRuntimeRevision: revision,
    semanticRuntimeSnapshotRequired: snapshotRequired,
    sequence: revision,
    streamId: "semantic_graph_changes",
    targetEntityIds: [],
    type: "semantic_graph.changed",
    workspaceId: "workspace_graph",
  };
}

function runtimeDelta({
  aggregateSourceUpdates = [],
  fromRevision,
  removals = {},
  runItemUpdates = [],
  toRevision,
  workflowNodeUpdates = [],
}: {
  aggregateSourceUpdates?: SemanticRuntimeSourceAggregate[];
  fromRevision: number;
  removals?: Partial<SemanticRuntimeDelta["removals"]>;
  runItemUpdates?: SemanticRuntimeRunItem[];
  toRevision: number;
  workflowNodeUpdates?: SemanticRuntimeWorkflowNode[];
}): SemanticRuntimeDelta {
  return {
    aggregateSourceUpdates,
    cartographerRunUpdates: [],
    cartographerWindowUpdates: [],
    changedAreas: ["aggregate_sources"],
    fromRevision,
    generatedAt: timestamp(toRevision),
    payloadBudget: runtimePayloadBudget(),
    patchPreviewUpdates: [],
    removals: runtimeRemovals(removals),
    runItemUpdates,
    semanticChangeUpdates: [],
    semanticNodeActivityUpdates: [],
    toRevision,
    workflowNodeUpdates,
    workspaceId: "workspace_graph",
  };
}

function runtimeSnapshot({
  aggregateSources = [],
  revision,
  runItemUpdates = [],
  workflowNodeUpdates = [],
}: {
  aggregateSources?: SemanticRuntimeSourceAggregate[];
  revision: number;
  runItemUpdates?: SemanticRuntimeRunItem[];
  workflowNodeUpdates?: SemanticRuntimeWorkflowNode[];
}): SemanticRuntimeSnapshot {
  return {
    cartographer: {
      activeRuns: [],
      activeWindows: [],
      hiddenPatchPreviewCount: 0,
      hiddenRunCount: 0,
      hiddenWindowCount: 0,
      omittedRecentPatchDetailCount: 0,
      omittedRecentRunDetailCount: 0,
      omittedRecentWindowDetailCount: 0,
      recentPatchRecordCount: 0,
      recentRunCount: 0,
      recentWindowCount: 0,
      statusCounts: [],
      updatedAt: timestamp(revision),
    },
    chatRunId: "",
    displayHints: {
      aggregateSources,
      collapsedSourceCount: 0,
      hiddenLiveSourceCount: 0,
      statusCounts: [],
    },
    generatedAt: timestamp(revision),
    limits: {
      maxAggregateEntityRefs: 20,
      maxAggregateSources: 20,
      maxCartographerRuns: 20,
      maxCartographerWindows: 20,
      maxChangedIdsPerItem: 20,
      maxCreatedEventIdsPerItem: 20,
      maxDeltaPayloadBytes: 32768,
      maxLiveSources: 20,
      maxModelAuditErrorBytes: 240,
      maxModelAuditTextBytes: 160,
      maxPatchOperationsPerItem: 20,
      maxPatchPreviewNodes: 20,
      maxPatchPreviews: 20,
      maxPreviewNodeTextBytes: 160,
      maxPublicSummaryBytes: 320,
      maxPulses: 40,
      maxRunItems: 20,
      maxSemanticChanges: 20,
      maxSnapshotPayloadBytes: 98304,
      maxWorkflowNodes: 20,
    },
    payloadBudget: runtimePayloadBudget(),
    patches: [],
    revision,
    semanticActivity: {
      hiddenRecentChanges: 0,
      nodeActivity: [],
      recentSemanticChanges: [],
    },
    workflow: {
      activeRunItemIds: runItemUpdates.map((item) => item.runItemId),
      activeWorkflowNodeIds: workflowNodeUpdates.map((item) => item.workflowNodeId),
      hiddenActiveRunItems: 0,
      hiddenActiveWorkflowNodes: 0,
      runItemUpdates,
      workflowNodeUpdates,
    },
    workflowExecutionId: "",
    workspaceId: "workspace_graph",
  };
}

function runtimePayloadBudget() {
  return {
    byteSize: 0,
    maxByteSize: 0,
    truncatedStringCount: 0,
  };
}

function runtimeRemovals(
  removals: Partial<SemanticRuntimeDelta["removals"]> = {},
): SemanticRuntimeDelta["removals"] {
  return {
    aggregateSourceIds: [],
    cartographerRunIds: [],
    cartographerWindowIds: [],
    patchPreviewIds: [],
    runItemIds: [],
    semanticNodeActivityIds: [],
    workflowNodeIds: [],
    ...removals,
  };
}

function runtimeWorkflowNode({
  workflowNodeId,
}: {
  workflowNodeId: string;
}): SemanticRuntimeWorkflowNode {
  return {
    activeSourceCount: 1,
    id: `semantic-runtime-workflow-node:${workflowNodeId}`,
    patchIds: [],
    runIds: ["cartographer_run_review"],
    sourceRefs: sourceRefs({ workflowNodeId }),
    status: "running",
    updatedAt: timestamp(1),
    windowIds: [],
    workflowExecutionId: "workflow_execution_review",
    workflowNodeId,
  };
}

function runtimeRunItem({ runItemId }: { runItemId: string }): SemanticRuntimeRunItem {
  return {
    activeSourceCount: 1,
    id: `semantic-runtime-run-item:${runItemId}`,
    patchIds: [],
    runIds: ["cartographer_run_review"],
    runItemId,
    sourceRefs: sourceRefs({ runItemId }),
    status: "running",
    updatedAt: timestamp(1),
    windowIds: [],
  };
}

function aggregateSource({
  runIds,
  status,
}: {
  runIds: string[];
  status: SemanticRuntimeSourceAggregate["status"];
}): SemanticRuntimeSourceAggregate {
  return {
    hiddenCount: 0,
    id: "aggregate_source_review",
    modelAudit: null,
    patchIds: [],
    runIds,
    sourceRefs: sourceRefs(),
    status,
    statusCounts: [{ count: 1, status }],
    targetEntityId: "semantic_node_review",
    totalCount: 1,
    updatedAt: timestamp(1),
    visibleCount: 1,
    windowIds: [],
  };
}

function sourceRefs({
  runItemId = "run_item_review",
  workflowNodeId = "reviewer",
}: {
  runItemId?: string;
  workflowNodeId?: string;
} = {}) {
  return {
    chatConversationId: "",
    chatMessageId: "",
    chatRunId: "",
    runItemId,
    workflowDefinitionId: "workflow_definition_review",
    workflowExecutionId: "workflow_execution_review",
    workflowNodeExecutionId: "workflow_node_execution_review",
    workflowNodeId,
  };
}

function timestamp(sequence: number) {
  return `2026-06-17T12:00:${String(sequence).padStart(2, "0")}Z`;
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

function deferred<T>() {
  let resolvePromise: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve: resolvePromise,
  };
}
