import type {
  WorkspaceTrajectoryRuntimeDelta,
  WorkspaceTrajectoryRuntimeEvent,
  WorkspaceTrajectoryRuntimeSnapshot,
  WorkspaceTrajectorySourceRef,
  WorkspaceTrajectorySprite,
  WorkspaceTrajectoryTimelineItem,
  WorkspaceTrajectoryWorkflowNodeAggregate,
  WorkflowExecution,
  WorkflowNodeExecution,
} from "@generated/backend";
import { describe, expect, test, vi } from "vitest";

import {
  createWorkspaceTrajectoryStore,
  workspaceTrajectoryRunBindingsFromExecution,
} from "./workspace-trajectory-store";

describe("workspace trajectory store", () => {
  test("coalesces runtime delta bursts by animation frame and sprite id", async () => {
    const scheduler = manualScheduler();
    const loadSnapshot = vi.fn(async () => runtimeSnapshot({ revision: 1 }));
    const events = eventSource();
    const store = createWorkspaceTrajectoryStore({
      loadSnapshot,
      scheduleDelay: scheduler.scheduleDelay,
      scheduleFrame: scheduler.scheduleFrame,
      subscribeEvents: events.subscribe,
      workflowExecutionId: "workflow_execution_review",
      workspaceId: "workspace_graph",
    });

    store.updateAnchors({ bindings: [], workflowNodeIds: ["reviewer"] });
    store.start();
    await flushPromises();
    const listener = vi.fn();
    store.subscribe(listener);

    events.emit(
      trajectoryRuntimeEvent({
        delta: runtimeDelta({
          fromRevision: 1,
          spriteUpdates: [
            runtimeSprite({
              id: "sprite_review",
              status: "pending",
              title: "Queued review",
              updatedAt: timestamp(2),
            }),
          ],
          toRevision: 2,
        }),
      }),
    );
    events.emit(
      trajectoryRuntimeEvent({
        delta: runtimeDelta({
          fromRevision: 2,
          spriteUpdates: [
            runtimeSprite({
              id: "sprite_review",
              severity: "success",
              status: "completed",
              title: "Completed review",
              updatedAt: timestamp(3),
            }),
          ],
          toRevision: 3,
        }),
      }),
    );

    expect(listener).not.toHaveBeenCalled();
    expect(store.getFrameSnapshot().revision).toBe(1);

    scheduler.flushFrame();

    const frame = store.getFrameSnapshot();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(loadSnapshot).toHaveBeenCalledTimes(1);
    expect(frame.revision).toBe(3);
    expect(frame.groups).toHaveLength(1);
    expect(frame.groups[0]?.workflowNodeId).toBe("reviewer");
    expect(frame.groups[0]?.items[0]).toMatchObject({
      type: "sprite",
      sprite: {
        id: "sprite_review",
        severity: "success",
        status: "completed",
        title: "Completed review",
      },
    });
  });

  test("buffers deltas until the initial snapshot is applied", async () => {
    const scheduler = manualScheduler();
    const initialSnapshot = deferred<WorkspaceTrajectoryRuntimeSnapshot>();
    const loadSnapshot = vi.fn(() => initialSnapshot.promise);
    const events = eventSource();
    const store = createWorkspaceTrajectoryStore({
      loadSnapshot,
      scheduleDelay: scheduler.scheduleDelay,
      scheduleFrame: scheduler.scheduleFrame,
      subscribeEvents: events.subscribe,
      workflowExecutionId: "workflow_execution_review",
      workspaceId: "workspace_graph",
    });

    store.updateAnchors({ bindings: [], workflowNodeIds: ["reviewer"] });
    store.start();
    events.emit(
      trajectoryRuntimeEvent({
        delta: runtimeDelta({
          fromRevision: 1,
          spriteUpdates: [runtimeSprite({ id: "sprite_buffered", title: "Buffered" })],
          toRevision: 2,
        }),
      }),
    );

    expect(store.getFrameSnapshot()).toMatchObject({ loading: true, ready: false, revision: 0 });
    initialSnapshot.resolve(runtimeSnapshot({ revision: 1 }));
    await flushPromises();
    scheduler.flushFrame();

    expect(loadSnapshot).toHaveBeenCalledTimes(1);
    expect(store.getFrameSnapshot()).toMatchObject({
      anchoredSpriteCount: 1,
      ready: true,
      revision: 2,
      totalSpriteCount: 1,
    });
    expect(store.getFrameSnapshot().groups[0]?.items[0]).toMatchObject({
      sprite: { id: "sprite_buffered" },
      type: "sprite",
    });
  });

  test("recovers snapshot-required events with one in-flight snapshot reload", async () => {
    const scheduler = manualScheduler();
    const events = eventSource();
    const reload = deferred<WorkspaceTrajectoryRuntimeSnapshot>();
    const loadSnapshot = vi
      .fn<() => Promise<WorkspaceTrajectoryRuntimeSnapshot>>()
      .mockResolvedValueOnce(runtimeSnapshot({ revision: 1 }))
      .mockImplementationOnce(() => reload.promise);
    const store = createWorkspaceTrajectoryStore({
      loadSnapshot,
      scheduleDelay: scheduler.scheduleDelay,
      scheduleFrame: scheduler.scheduleFrame,
      subscribeEvents: events.subscribe,
      workflowExecutionId: "workflow_execution_review",
      workspaceId: "workspace_graph",
    });

    store.start();
    await flushPromises();

    events.emit(
      trajectoryRuntimeEvent({
        delta: runtimeDelta({
          fromRevision: 3,
          spriteUpdates: [runtimeSprite({ id: "sprite_gap" })],
          toRevision: 4,
        }),
      }),
    );
    events.emit(
      trajectoryRuntimeEvent({
        revision: 5,
        snapshotRequired: true,
      }),
    );

    expect(loadSnapshot).toHaveBeenCalledTimes(2);
    reload.resolve(
      runtimeSnapshot({
        revision: 5,
        sprites: [runtimeSprite({ id: "sprite_reloaded", title: "Reloaded" })],
      }),
    );
    await flushPromises();

    expect(loadSnapshot).toHaveBeenCalledTimes(2);
    expect(store.getFrameSnapshot()).toMatchObject({
      revision: 5,
      totalSpriteCount: 1,
    });
    expect(store.getFrameSnapshot().groups[0]?.items[0]).toMatchObject({
      sprite: { id: "sprite_reloaded" },
      type: "sprite",
    });
  });

  test("ignores snapshot-required events from other workspaces", async () => {
    const scheduler = manualScheduler();
    const events = eventSource();
    const loadSnapshot = vi.fn(async () => runtimeSnapshot({ revision: 1 }));
    const store = createWorkspaceTrajectoryStore({
      loadSnapshot,
      scheduleDelay: scheduler.scheduleDelay,
      scheduleFrame: scheduler.scheduleFrame,
      subscribeEvents: events.subscribe,
      workflowExecutionId: "workflow_execution_review",
      workspaceId: "workspace_graph",
    });

    store.start();
    await flushPromises();
    events.emit(
      trajectoryRuntimeEvent({
        revision: 2,
        snapshotRequired: true,
        workspaceId: "workspace_other",
      }),
    );

    expect(loadSnapshot).toHaveBeenCalledTimes(1);
    expect(store.getFrameSnapshot().revision).toBe(1);
  });

  test("anchors sprites by runner refs and preserves anchors when later deltas omit refs", async () => {
    const scheduler = manualScheduler();
    const loadSnapshot = vi.fn(async () =>
      runtimeSnapshot({
        revision: 1,
        sprites: [
          runtimeSprite({
            chatRunId: "chat_run_review",
            id: "sprite_bound",
            sourceRefs: sourceRefs({ chatRunId: "chat_run_review" }),
            workflowNodeId: "",
          }),
        ],
        timeline: [
          timelineItem({
            spriteId: "sprite_bound",
            summary: "Assistant answered",
          }),
        ],
      }),
    );
    const events = eventSource();
    const store = createWorkspaceTrajectoryStore({
      loadSnapshot,
      scheduleDelay: scheduler.scheduleDelay,
      scheduleFrame: scheduler.scheduleFrame,
      subscribeEvents: events.subscribe,
      workflowExecutionId: "workflow_execution_review",
      workspaceId: "workspace_graph",
    });

    store.updateAnchors({
      bindings: [
        {
          chatRunId: "chat_run_review",
          workflowExecutionId: "workflow_execution_review",
          workflowNodeExecutionId: "workflow_node_execution_review",
          workflowNodeId: "reviewer",
        },
      ],
      workflowNodeIds: ["reviewer"],
    });
    store.start();
    await flushPromises();

    expect(store.getFrameSnapshot().groups[0]?.workflowNodeId).toBe("reviewer");
    events.emit(
      trajectoryRuntimeEvent({
        delta: runtimeDelta({
          fromRevision: 1,
          spriteUpdates: [
            runtimeSprite({
              chatRunId: "",
              id: "sprite_bound",
              sourceRefs: [],
              title: "Updated without refs",
              updatedAt: timestamp(2),
              workflowNodeId: "",
            }),
          ],
          timelineUpdates: [
            timelineItem({
              occurredAt: timestamp(2),
              spriteId: "sprite_bound",
              summary: "Updated without refs",
            }),
          ],
          toRevision: 2,
        }),
      }),
    );
    scheduler.flushFrame();

    const frame = store.getFrameSnapshot();
    const details = store.getNodeDetails("reviewer");
    expect(frame.groups[0]?.workflowNodeId).toBe("reviewer");
    expect(frame.groups[0]?.items[0]).toMatchObject({
      sprite: { title: "Updated without refs" },
      type: "sprite",
    });
    expect(details).toMatchObject({ revision: 2, totalCount: 1, workflowNodeId: "reviewer" });
    expect(details.timeline[0]?.summary).toBe("Updated without refs");
    expect(details.timeline.map((item) => item.summary)).toContain("Assistant answered");
  });

  test("keeps unanchored sprites in the bounded recent lane", async () => {
    const scheduler = manualScheduler();
    const sprites = Array.from({ length: 10 }, (_, index) =>
      runtimeSprite({
        id: `sprite_recent_${index}`,
        sourceRefs: [],
        title: `Recent ${index}`,
        updatedAt: timestamp(index + 1),
        workflowNodeId: "",
      }),
    );
    const loadSnapshot = vi.fn(async () => runtimeSnapshot({ revision: 1, sprites }));
    const events = eventSource();
    const store = createWorkspaceTrajectoryStore({
      loadSnapshot,
      scheduleDelay: scheduler.scheduleDelay,
      scheduleFrame: scheduler.scheduleFrame,
      subscribeEvents: events.subscribe,
      workflowExecutionId: "workflow_execution_review",
      workspaceId: "workspace_graph",
    });

    store.updateAnchors({ bindings: [], workflowNodeIds: ["reviewer"] });
    store.start();
    await flushPromises();

    const frame = store.getFrameSnapshot();
    expect(frame.groups).toEqual([]);
    expect(frame.recentLane).toHaveLength(8);
    expect(frame.recentLane[0]).toMatchObject({
      sprite: { id: "sprite_recent_9" },
      type: "sprite",
    });
    expect(frame.totalSpriteCount).toBe(10);
  });

  test("keeps a single queued cartographer lifecycle item in details only", async () => {
    const scheduler = manualScheduler();
    const loadSnapshot = vi.fn(async () =>
      runtimeSnapshot({
        revision: 1,
        sprites: [cartographerRunSprite(1)],
      }),
    );
    const events = eventSource();
    const store = createWorkspaceTrajectoryStore({
      loadSnapshot,
      scheduleDelay: scheduler.scheduleDelay,
      scheduleFrame: scheduler.scheduleFrame,
      subscribeEvents: events.subscribe,
      workflowExecutionId: "workflow_execution_review",
      workspaceId: "workspace_graph",
    });

    store.updateAnchors({ bindings: [], workflowNodeIds: ["reviewer"] });
    store.start();
    await flushPromises();

    const frame = store.getFrameSnapshot();
    const details = store.getNodeDetails("reviewer");
    expect(frame.groups).toEqual([]);
    expect(frame.totalSpriteCount).toBe(1);
    expect(details.totalCount).toBe(1);
    expect(details.items[0]).toMatchObject({
      aggregate: {
        count: 1,
        kind: "cartographer_status",
        label: "Cartographer queued",
        sourceSpriteIds: ["cartographer-run:cartographer_run_1"],
        status: "pending",
      },
      type: "aggregate",
    });
  });

  test("aggregates queued cartographers before visible caps and keeps commands first", async () => {
    const scheduler = manualScheduler();
    const queuedCartographers = Array.from({ length: 10 }, (_, index) =>
      cartographerRunSprite(index + 1, { updatedAt: timestamp(20 + index) }),
    );
    const command = runtimeSprite({
      command: {
        command: 'rg "workspace trajectory" desktop/src',
        cwd: "",
        durationMs: 0,
        exitCode: 0,
      },
      id: "sprite_command",
      kind: "command",
      status: "completed",
      subtitle: "command_execution",
      title: "Command",
      updatedAt: timestamp(2),
    });
    const loadSnapshot = vi.fn(async () =>
      runtimeSnapshot({ revision: 1, sprites: [...queuedCartographers, command] }),
    );
    const events = eventSource();
    const store = createWorkspaceTrajectoryStore({
      loadSnapshot,
      scheduleDelay: scheduler.scheduleDelay,
      scheduleFrame: scheduler.scheduleFrame,
      subscribeEvents: events.subscribe,
      workflowExecutionId: "workflow_execution_review",
      workspaceId: "workspace_graph",
    });

    store.updateAnchors({ bindings: [], workflowNodeIds: ["reviewer"] });
    store.start();
    await flushPromises();

    const group = store.getFrameSnapshot().groups[0];
    expect(group).toMatchObject({ hiddenCount: 0, totalCount: 2, workflowNodeId: "reviewer" });
    expect(group?.items).toHaveLength(2);
    expect(group?.items[0]).toMatchObject({ sprite: { id: "sprite_command" }, type: "sprite" });
    expect(group?.items[1]).toMatchObject({
      aggregate: {
        count: 10,
        kind: "cartographer_status",
        label: "10 cartographers queued",
        status: "pending",
      },
      type: "aggregate",
    });
    expect(store.getFrameSnapshot().totalSpriteCount).toBe(11);
  });

  test("counts hidden display items after cartographer aggregation", async () => {
    const scheduler = manualScheduler();
    const commands = Array.from({ length: 5 }, (_, index) =>
      runtimeSprite({
        id: `sprite_command_${index}`,
        kind: "command",
        status: "completed",
        title: "Command",
        updatedAt: timestamp(index + 1),
      }),
    );
    const queuedCartographers = Array.from({ length: 10 }, (_, index) =>
      cartographerRunSprite(index + 1, { updatedAt: timestamp(20 + index) }),
    );
    const loadSnapshot = vi.fn(async () =>
      runtimeSnapshot({ revision: 1, sprites: [...commands, ...queuedCartographers] }),
    );
    const events = eventSource();
    const store = createWorkspaceTrajectoryStore({
      loadSnapshot,
      scheduleDelay: scheduler.scheduleDelay,
      scheduleFrame: scheduler.scheduleFrame,
      subscribeEvents: events.subscribe,
      workflowExecutionId: "workflow_execution_review",
      workspaceId: "workspace_graph",
    });

    store.updateAnchors({ bindings: [], workflowNodeIds: ["reviewer"] });
    store.start();
    await flushPromises();

    const group = store.getFrameSnapshot().groups[0];
    expect(group).toMatchObject({ hiddenCount: 2, totalCount: 6 });
    expect(group?.items).toHaveLength(4);
    expect(group?.items.every((item) => item.type === "sprite")).toBe(true);
  });

  test("aggregates repeated failed cartographer activity into one visible item", async () => {
    const scheduler = manualScheduler();
    const loadSnapshot = vi.fn(async () =>
      runtimeSnapshot({
        revision: 1,
        sprites: [
          cartographerRunSprite(1, { severity: "error", status: "failed" }),
          cartographerRunSprite(2, { severity: "error", status: "failed" }),
        ],
      }),
    );
    const events = eventSource();
    const store = createWorkspaceTrajectoryStore({
      loadSnapshot,
      scheduleDelay: scheduler.scheduleDelay,
      scheduleFrame: scheduler.scheduleFrame,
      subscribeEvents: events.subscribe,
      workflowExecutionId: "workflow_execution_review",
      workspaceId: "workspace_graph",
    });

    store.updateAnchors({ bindings: [], workflowNodeIds: ["reviewer"] });
    store.start();
    await flushPromises();

    expect(store.getFrameSnapshot().groups[0]?.items[0]).toMatchObject({
      aggregate: {
        count: 2,
        kind: "cartographer_status",
        label: "2 cartographers failed",
        severity: "error",
        status: "failed",
      },
      type: "aggregate",
    });
  });

  test("routes typed pending cartographer patches to memory suggestions outside the canvas", async () => {
    const scheduler = manualScheduler();
    const loadSnapshot = vi.fn(async () =>
      runtimeSnapshot({
        revision: 1,
        sprites: [
          runtimeSprite({
            cartographerPatchId: "cartographer_patch_memory",
            id: "cartographer-patch:cartographer_patch_memory",
            kind: "cartographer_status",
            severity: "blocking",
            status: "approval_required",
            subtitle: "Background maintenance",
            title: "Runtime update",
          }),
        ],
      }),
    );
    const events = eventSource();
    const store = createWorkspaceTrajectoryStore({
      loadSnapshot,
      scheduleDelay: scheduler.scheduleDelay,
      scheduleFrame: scheduler.scheduleFrame,
      subscribeEvents: events.subscribe,
      workflowExecutionId: "workflow_execution_review",
      workspaceId: "workspace_graph",
    });

    store.updateAnchors({ bindings: [], workflowNodeIds: ["reviewer"] });
    store.start();
    await flushPromises();

    expect(store.getFrameSnapshot().groups).toEqual([]);
    expect(store.getNodeDetails("reviewer").items[0]).toMatchObject({
      aggregate: {
        count: 1,
        kind: "memory_suggestion",
        label: "Memory suggestion",
        sourceSpriteIds: ["cartographer-patch:cartographer_patch_memory"],
        status: "approval_required",
      },
      type: "aggregate",
    });
  });

  test("derives chat run anchor bindings from workflow node runner refs", () => {
    const execution = workflowExecution([
      nodeExecution("node_execution_review", "reviewer", [
        { id: "chat_run_review", kind: "chat.run" },
      ]),
      nodeExecution("node_execution_other", "other", [{ id: "terminal_a", kind: "terminal" }]),
    ]);

    expect(workspaceTrajectoryRunBindingsFromExecution(execution)).toEqual([
      {
        chatRunId: "chat_run_review",
        workflowExecutionId: "workflow_execution_review",
        workflowNodeExecutionId: "node_execution_review",
        workflowNodeId: "reviewer",
      },
    ]);
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
  let listener: ((event: WorkspaceTrajectoryRuntimeEvent) => void) | null = null;
  return {
    emit: (event: WorkspaceTrajectoryRuntimeEvent) => {
      listener?.(event);
    },
    subscribe: (nextListener: (event: WorkspaceTrajectoryRuntimeEvent) => void) => {
      listener = nextListener;
      return () => {
        if (listener === nextListener) {
          listener = null;
        }
      };
    },
  };
}

function trajectoryRuntimeEvent({
  delta = null,
  revision = delta?.toRevision ?? 1,
  snapshotRequired = false,
  workspaceId = "workspace_graph",
}: {
  delta?: WorkspaceTrajectoryRuntimeDelta | null;
  revision?: number;
  snapshotRequired?: boolean;
  workspaceId?: string;
} = {}): WorkspaceTrajectoryRuntimeEvent {
  return {
    delta,
    eventId: `workspace_trajectory_runtime:${revision}`,
    occurredAt: timestamp(revision),
    revision,
    schemaVersion: 1,
    sequence: revision,
    snapshotRequired,
    streamId: "workspace_trajectory_runtime",
    type: "workspace_trajectory.runtime.changed",
    workspaceId,
  };
}

function runtimeDelta({
  aggregateUpdates = [],
  detailRefs = [],
  fromRevision,
  removals = {},
  spriteUpdates = [],
  timelineUpdates = [],
  toRevision,
}: {
  aggregateUpdates?: WorkspaceTrajectoryWorkflowNodeAggregate[];
  detailRefs?: WorkspaceTrajectoryRuntimeDelta["detailRefs"];
  fromRevision: number;
  removals?: Partial<WorkspaceTrajectoryRuntimeDelta["removals"]>;
  spriteUpdates?: WorkspaceTrajectorySprite[];
  timelineUpdates?: WorkspaceTrajectoryTimelineItem[];
  toRevision: number;
}): WorkspaceTrajectoryRuntimeDelta {
  return {
    aggregateUpdates,
    changedAreas: ["run_items"],
    detailRefs,
    fromRevision,
    generatedAt: timestamp(toRevision),
    payloadBudget: runtimePayloadBudget(),
    removals: runtimeRemovals(removals),
    schemaVersion: 1,
    spriteUpdates,
    timelineUpdates,
    toRevision,
    workspaceId: "workspace_graph",
  };
}

function runtimeSnapshot({
  aggregateByWorkflowNode = [],
  detailRefs = [],
  revision,
  sprites = [],
  timeline = [],
}: {
  aggregateByWorkflowNode?: WorkspaceTrajectoryWorkflowNodeAggregate[];
  detailRefs?: WorkspaceTrajectoryRuntimeSnapshot["detailRefs"];
  revision: number;
  sprites?: WorkspaceTrajectorySprite[];
  timeline?: WorkspaceTrajectoryTimelineItem[];
}): WorkspaceTrajectoryRuntimeSnapshot {
  return {
    activeRunItemIds: sprites.map((sprite) => sprite.runItemId).filter(Boolean),
    activeWorkflowNodeIds: sprites.map((sprite) => sprite.workflowNodeId).filter(Boolean),
    aggregateByWorkflowNode,
    chatRunId: "",
    detailRefs,
    generatedAt: timestamp(revision),
    limits: runtimeLimits(),
    payloadBudget: runtimePayloadBudget(),
    removals: runtimeRemovals(),
    revision,
    schemaVersion: 1,
    sprites,
    timeline,
    workflowExecutionId: "workflow_execution_review",
    workspaceId: "workspace_graph",
  };
}

function runtimeSprite(
  overrides: Partial<WorkspaceTrajectorySprite> = {},
): WorkspaceTrajectorySprite {
  const id = overrides.id ?? "sprite_review";
  return {
    cartographerPatchId: "",
    cartographerRunId: "",
    cartographerWindowId: "",
    chatConversationId: "conversation_review",
    chatMessageId: "message_review",
    chatRunId: "chat_run_review",
    command: {
      command: "",
      cwd: "",
      durationMs: 0,
      exitCode: 0,
    },
    createdAt: timestamp(1),
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
    id,
    kind: "assistant_message",
    providerItemId: "provider_item_review",
    resultSummary: "",
    runItemId: "run_item_review",
    schemaVersion: 1,
    severity: "info",
    sourceRefs: sourceRefs(),
    status: "running",
    subtitle: "Assistant output",
    title: "Review",
    tool: {
      namespace: "",
      requestId: "",
      serverName: "",
      toolName: "",
    },
    ttlMs: 0,
    updatedAt: timestamp(1),
    workflowExecutionId: "workflow_execution_review",
    workflowNodeExecutionId: "workflow_node_execution_review",
    workflowNodeId: "reviewer",
    workspaceId: "workspace_graph",
    ...overrides,
  };
}

function cartographerRunSprite(
  index: number,
  overrides: Partial<WorkspaceTrajectorySprite> = {},
): WorkspaceTrajectorySprite {
  const runId = `cartographer_run_${index}`;
  return runtimeSprite({
    cartographerRunId: runId,
    chatMessageId: "",
    id: `cartographer-run:${runId}`,
    kind: "cartographer_status",
    providerItemId: "",
    resultSummary: "Cartographer lifecycle update.",
    runItemId: "",
    severity: "info",
    status: "pending",
    subtitle: "Cartographer lifecycle update",
    title: "Cartographer queued",
    updatedAt: timestamp(index),
    ...overrides,
  });
}

function timelineItem(
  overrides: Partial<WorkspaceTrajectoryTimelineItem> = {},
): WorkspaceTrajectoryTimelineItem {
  return {
    chatRunId: "chat_run_review",
    id: `timeline_${overrides.spriteId ?? "sprite_review"}_${overrides.occurredAt ?? "1"}`,
    kind: "assistant_message",
    occurredAt: timestamp(1),
    runItemId: "run_item_review",
    schemaVersion: 1,
    severity: "info",
    sourceRefs: sourceRefs(),
    spriteId: "sprite_review",
    status: "running",
    summary: "Assistant answered",
    workflowExecutionId: "workflow_execution_review",
    workflowNodeExecutionId: "workflow_node_execution_review",
    workflowNodeId: "reviewer",
    workspaceId: "workspace_graph",
    ...overrides,
  };
}

function sourceRefs({
  chatRunId = "chat_run_review",
  workflowNodeExecutionId = "workflow_node_execution_review",
  workflowNodeId = "reviewer",
}: {
  chatRunId?: string;
  workflowNodeExecutionId?: string;
  workflowNodeId?: string;
} = {}): WorkspaceTrajectorySourceRef[] {
  const refs: WorkspaceTrajectorySourceRef[] = [
    { id: chatRunId, kind: "chat_run" },
    { id: workflowNodeExecutionId, kind: "workflow_node_execution" },
    { id: workflowNodeId, kind: "workflow_node" },
  ];
  return refs.filter((ref) => ref.id !== "");
}

function runtimeLimits(): WorkspaceTrajectoryRuntimeSnapshot["limits"] {
  return {
    maxAggregates: 80,
    maxChangedAreas: 20,
    maxDeltaPayloadBytes: 32768,
    maxDetailRefs: 80,
    maxFileRefsPerSprite: 20,
    maxSnapshotPayloadBytes: 98304,
    maxSourceRefsPerSprite: 20,
    maxSpriteErrorBytes: 160,
    maxSpriteResultBytes: 160,
    maxSpriteSubtitleBytes: 160,
    maxSpriteTitleBytes: 160,
    maxSprites: 80,
    maxTimelineItems: 80,
  };
}

function runtimePayloadBudget(): WorkspaceTrajectoryRuntimeSnapshot["payloadBudget"] {
  return {
    byteSize: 0,
    maxByteSize: 0,
    omittedSpriteCount: 0,
    truncatedStringCount: 0,
  };
}

function runtimeRemovals(
  removals: Partial<WorkspaceTrajectoryRuntimeDelta["removals"]> = {},
): WorkspaceTrajectoryRuntimeDelta["removals"] {
  return {
    aggregateIds: [],
    detailRefIds: [],
    spriteIds: [],
    timelineIds: [],
    ...removals,
  };
}

function workflowExecution(nodeExecutions: WorkflowNodeExecution[]): WorkflowExecution {
  return {
    activeNodeExecutionIds: [],
    completedAt: "",
    createdAt: timestamp(1),
    definitionId: "workflow_definition_review",
    definitionVersionId: "workflow_definition_version_review",
    error: "",
    id: "workflow_execution_review",
    lastEventOrdinal: 0,
    loopIterations: [],
    nodeExecutions,
    recoveryOutcome: null,
    schemaVersion: 1,
    startedAt: timestamp(1),
    status: "running",
    terminalReason: null,
    tokens: [],
    updatedAt: timestamp(1),
    workspaceId: "workspace_graph",
  };
}

function nodeExecution(
  id: string,
  nodeId: string,
  runnerRefs: WorkflowNodeExecution["runnerRefs"],
): WorkflowNodeExecution {
  return {
    actionKind: null,
    actionPolicy: null,
    activityRefs: [],
    attempt: 1,
    completedAt: "",
    error: "",
    executionId: "workflow_execution_review",
    id,
    idempotencyKey: `${id}/idempotency`,
    input: {},
    inputHash: "",
    iteration: 1,
    nodeId,
    recoveryMessage: "",
    recoveryOutcome: null,
    result: null,
    runnerCapabilities: null,
    runnerKind: null,
    runnerRefs,
    runnerState: null,
    scheduledAt: timestamp(1),
    schemaVersion: 1,
    sideEffectPolicy: null,
    startedAt: timestamp(1),
    status: "running",
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
