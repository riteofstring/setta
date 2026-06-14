import type {
  SemanticGraphChangeEvent,
  SemanticRuntimeDelta,
  SemanticRuntimeSnapshot,
  SemanticRuntimeSourceAggregate,
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
  toRevision,
}: {
  aggregateSourceUpdates?: SemanticRuntimeSourceAggregate[];
  fromRevision: number;
  toRevision: number;
}): SemanticRuntimeDelta {
  return {
    aggregateSourceUpdates,
    cartographerRunUpdates: [],
    cartographerWindowUpdates: [],
    changedAreas: ["aggregate_sources"],
    fromRevision,
    generatedAt: timestamp(toRevision),
    patchPreviewUpdates: [],
    removals: {
      aggregateSourceIds: [],
      cartographerRunIds: [],
      cartographerWindowIds: [],
      patchPreviewIds: [],
      runItemIds: [],
      semanticNodeActivityIds: [],
      workflowNodeIds: [],
    },
    runItemUpdates: [],
    semanticChangeUpdates: [],
    semanticNodeActivityUpdates: [],
    toRevision,
    workflowNodeUpdates: [],
    workspaceId: "workspace_graph",
  };
}

function runtimeSnapshot({
  aggregateSources = [],
  revision,
}: {
  aggregateSources?: SemanticRuntimeSourceAggregate[];
  revision: number;
}): SemanticRuntimeSnapshot {
  return {
    cartographer: {
      activeRuns: [],
      activeWindows: [],
      hiddenPatchPreviewCount: 0,
      hiddenRunCount: 0,
      hiddenWindowCount: 0,
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
      maxPatchOperationsPerItem: 20,
      maxPatchPreviewNodes: 20,
      maxPatchPreviews: 20,
      maxSemanticChanges: 20,
    },
    patches: [],
    revision,
    semanticActivity: {
      hiddenRecentChanges: 0,
      nodeActivity: [],
      recentSemanticChanges: [],
    },
    workflow: {
      activeRunItemIds: [],
      activeWorkflowNodeIds: [],
      hiddenActiveRunItems: 0,
      hiddenActiveWorkflowNodes: 0,
      runItemUpdates: [],
      workflowNodeUpdates: [],
    },
    workflowExecutionId: "",
    workspaceId: "workspace_graph",
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

function sourceRefs() {
  return {
    chatConversationId: "",
    chatMessageId: "",
    chatRunId: "",
    runItemId: "run_item_review",
    workflowDefinitionId: "workflow_definition_review",
    workflowExecutionId: "workflow_execution_review",
    workflowNodeExecutionId: "workflow_node_execution_review",
    workflowNodeId: "reviewer",
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
