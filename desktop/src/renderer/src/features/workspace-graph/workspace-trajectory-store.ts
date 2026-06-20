import type {
  WorkspaceTrajectoryRuntimeDelta,
  WorkspaceTrajectoryRuntimeEvent,
  WorkspaceTrajectoryRuntimeSnapshot,
  WorkspaceTrajectorySprite,
  WorkspaceTrajectorySpriteSeverity,
  WorkspaceTrajectoryTimelineItem,
  WorkspaceTrajectoryWorkflowNodeAggregate,
  WorkspaceTrajectoryDetailRef,
  WorkflowExecution,
} from "@generated/backend";

import {
  displayItemSeverity,
  displayItemSourceSpriteIds,
  displayItemsForCanvas,
  displayItemsForDetails,
  newestDisplayItemUpdatedAt,
  sortDisplayItems,
  type WorkspaceTrajectoryDisplayItem,
} from "./workspace-trajectory-display-items";
import {
  emptyWorkspaceTrajectoryAnchorIndex,
  updateWorkspaceTrajectoryAnchorIndex,
  workspaceTrajectoryAnchorForSprite,
  type WorkspaceTrajectoryAnchorState,
  type WorkspaceTrajectoryWorkflowRunBinding,
} from "./workspace-trajectory-anchors";

interface WorkspaceTrajectoryDisplayGroup {
  hiddenCount: number;
  highestSeverity: WorkspaceTrajectorySpriteSeverity;
  items: WorkspaceTrajectoryDisplayItem[];
  totalCount: number;
  updatedAt: string;
  workflowNodeId: string;
}

export interface WorkspaceTrajectoryFrameSnapshot {
  anchoredSpriteCount: number;
  error: string;
  groups: WorkspaceTrajectoryDisplayGroup[];
  loading: boolean;
  ready: boolean;
  recentLane: WorkspaceTrajectoryDisplayItem[];
  revision: number;
  totalSpriteCount: number;
  version: number;
  workflowExecutionId: string;
  workspaceId: string;
}

export interface WorkspaceTrajectoryNodeDetails {
  hiddenCount: number;
  items: WorkspaceTrajectoryDisplayItem[];
  revision: number;
  timeline: WorkspaceTrajectoryTimelineItem[];
  totalCount: number;
  workflowNodeId: string;
}

export interface WorkspaceTrajectoryStore {
  destroy: () => void;
  getFrameSnapshot: () => WorkspaceTrajectoryFrameSnapshot;
  getNodeDetails: (workflowNodeId: string) => WorkspaceTrajectoryNodeDetails;
  handleEvent: (event: WorkspaceTrajectoryRuntimeEvent) => void;
  start: () => void;
  subscribe: (listener: () => void) => () => void;
  updateAnchors: (anchors: WorkspaceTrajectoryAnchorState) => void;
}

interface CreateWorkspaceTrajectoryStoreRequest {
  loadSnapshot: () => Promise<WorkspaceTrajectoryRuntimeSnapshot>;
  scheduleDelay?: (callback: () => void, delayMs: number) => () => void;
  scheduleFrame?: (callback: () => void) => () => void;
  subscribeEvents: (listener: (event: WorkspaceTrajectoryRuntimeEvent) => void) => () => void;
  workflowExecutionId: string;
  workspaceId: string;
}

interface RuntimeState {
  aggregatesById: Map<string, WorkspaceTrajectoryWorkflowNodeAggregate>;
  detailRefsById: Map<string, WorkspaceTrajectoryDetailRef>;
  generatedAt: string;
  limits: WorkspaceTrajectoryRuntimeSnapshot["limits"] | null;
  payloadBudget: WorkspaceTrajectoryRuntimeSnapshot["payloadBudget"] | null;
  revision: number;
  spritesById: Map<string, WorkspaceTrajectorySprite>;
  timelineById: Map<string, WorkspaceTrajectoryTimelineItem>;
  workspaceId: string;
}

interface PendingTrajectoryDelta {
  aggregateUpdates: Map<string, WorkspaceTrajectoryWorkflowNodeAggregate>;
  detailRefs: Map<string, WorkspaceTrajectoryDetailRef>;
  fromRevision: number;
  generatedAt: string;
  removals: WorkspaceTrajectoryRuntimeDelta["removals"];
  spriteUpdates: Map<string, WorkspaceTrajectorySprite>;
  timelineUpdates: Map<string, WorkspaceTrajectoryTimelineItem>;
  toRevision: number;
  workspaceId: string;
}

const defaultTrajectoryLimit = 80;
const maxVisibleSpritesPerNode = 4;
const maxNodeDetailSprites = 12;
const maxBufferedEvents = 96;
const maxExpirationDelayMs = 60_000;

const emptyFrameSnapshot: WorkspaceTrajectoryFrameSnapshot = {
  anchoredSpriteCount: 0,
  error: "",
  groups: [],
  loading: false,
  ready: true,
  recentLane: [],
  revision: 0,
  totalSpriteCount: 0,
  version: 0,
  workflowExecutionId: "",
  workspaceId: "",
};

export function createWorkspaceTrajectoryStore({
  loadSnapshot,
  scheduleDelay = defaultScheduleDelay,
  scheduleFrame = defaultScheduleFrame,
  subscribeEvents,
  workflowExecutionId,
  workspaceId,
}: CreateWorkspaceTrajectoryStoreRequest): WorkspaceTrajectoryStore {
  let destroyed = false;
  let error = "";
  let frameSnapshot: WorkspaceTrajectoryFrameSnapshot = {
    ...emptyFrameSnapshot,
    ready: false,
    workflowExecutionId,
    workspaceId,
  };
  let loading = false;
  let pendingDelta: PendingTrajectoryDelta | null = null;
  let reloadRequested = false;
  let reloadRunning = false;
  let reloadTargetRevision = 0;
  let runtime: RuntimeState | null = null;
  let started = false;
  let unsubscribeEvents: (() => void) | null = null;
  const listeners = new Set<() => void>();
  const bufferedEvents: WorkspaceTrajectoryRuntimeEvent[] = [];
  const anchorBySpriteId = new Map<string, string>();
  let anchorIndex = emptyWorkspaceTrajectoryAnchorIndex();
  let cancelFrame: (() => void) | null = null;
  let cancelExpiration: (() => void) | null = null;

  const store: WorkspaceTrajectoryStore = {
    destroy,
    getFrameSnapshot: () => frameSnapshot,
    getNodeDetails,
    handleEvent,
    start,
    subscribe,
    updateAnchors,
  };
  return store;

  function start() {
    if (started || destroyed) {
      return;
    }
    started = true;
    unsubscribeEvents = subscribeEvents(handleEvent);
    requestSnapshotReload(0);
  }

  function destroy() {
    if (destroyed) {
      return;
    }
    destroyed = true;
    unsubscribeEvents?.();
    unsubscribeEvents = null;
    cancelFrame?.();
    cancelFrame = null;
    cancelExpiration?.();
    cancelExpiration = null;
    listeners.clear();
  }

  function subscribe(listener: () => void) {
    if (destroyed) {
      return () => undefined;
    }
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  function updateAnchors(anchors: WorkspaceTrajectoryAnchorState) {
    anchorIndex = updateWorkspaceTrajectoryAnchorIndex(anchorIndex, anchors);
    if (runtime !== null) {
      publishFrame();
    }
  }

  function handleEvent(event: WorkspaceTrajectoryRuntimeEvent) {
    if (destroyed) {
      return;
    }
    if (event.workspaceId !== workspaceId) {
      return;
    }
    if (event.snapshotRequired) {
      requestSnapshotReload(event.revision);
      return;
    }
    if (runtime === null) {
      bufferEvent(event);
      if (!reloadRunning) {
        requestSnapshotReload(event.revision);
      }
      return;
    }
    if (reloadRunning) {
      bufferEvent(event);
      return;
    }
    if (event.delta === null) {
      if (event.revision > currentRevision()) {
        requestSnapshotReload(event.revision);
      }
      return;
    }
    queueDelta(event.delta);
  }

  function queueDelta(delta: WorkspaceTrajectoryRuntimeDelta) {
    if (delta.workspaceId !== workspaceId) {
      return;
    }
    if (runtime === null || reloadRunning) {
      requestSnapshotReload(delta.toRevision);
      return;
    }
    const expectedRevision = pendingDelta?.toRevision ?? runtime.revision;
    if (delta.toRevision <= expectedRevision) {
      return;
    }
    if (delta.fromRevision !== expectedRevision) {
      requestSnapshotReload(delta.toRevision);
      return;
    }
    mergePendingDelta(delta);
    scheduleRuntimeFrame();
  }

  function mergePendingDelta(delta: WorkspaceTrajectoryRuntimeDelta) {
    if (pendingDelta === null) {
      pendingDelta = emptyPendingTrajectoryDelta(delta);
    }
    pendingDelta.toRevision = delta.toRevision;
    pendingDelta.generatedAt = delta.generatedAt;
    mergeRuntimeEntityUpdates(
      pendingDelta.spriteUpdates,
      pendingDelta.removals.spriteIds,
      delta.spriteUpdates,
      delta.removals.spriteIds,
      (item) => item.id,
    );
    mergeRuntimeEntityUpdates(
      pendingDelta.timelineUpdates,
      pendingDelta.removals.timelineIds,
      delta.timelineUpdates,
      delta.removals.timelineIds,
      (item) => item.id,
    );
    mergeRuntimeEntityUpdates(
      pendingDelta.aggregateUpdates,
      pendingDelta.removals.aggregateIds,
      delta.aggregateUpdates,
      delta.removals.aggregateIds,
      (item) => item.id,
    );
    mergeRuntimeEntityUpdates(
      pendingDelta.detailRefs,
      pendingDelta.removals.detailRefIds,
      delta.detailRefs,
      delta.removals.detailRefIds,
      (item) => item.id,
    );
  }

  function scheduleRuntimeFrame() {
    if (cancelFrame !== null || pendingDelta === null) {
      return;
    }
    cancelFrame = scheduleFrame(flushRuntimeFrame);
  }

  function flushRuntimeFrame() {
    cancelFrame = null;
    if (destroyed || pendingDelta === null) {
      return;
    }
    const delta = materializePendingDelta(pendingDelta);
    pendingDelta = null;
    const nextRuntime = applyTrajectoryDelta(runtime, delta);
    if (nextRuntime === null) {
      requestSnapshotReload(delta.toRevision);
      return;
    }
    runtime = nextRuntime;
    error = "";
    loading = false;
    reloadTargetRevision = Math.max(reloadTargetRevision, nextRuntime.revision);
    publishFrame();
  }

  function requestSnapshotReload(targetRevision: number) {
    reloadTargetRevision = Math.max(reloadTargetRevision, targetRevision);
    clearPendingDelta();
    if (reloadRunning) {
      reloadRequested = true;
      return;
    }
    void reloadSnapshot();
  }

  async function reloadSnapshot() {
    if (reloadRunning || destroyed) {
      return;
    }
    reloadRunning = true;
    setLoading(true);
    try {
      await runSnapshotReloadLoop();
    } catch (caught: unknown) {
      recordSnapshotReloadError(caught);
    } finally {
      finishSnapshotReload();
    }
  }

  async function runSnapshotReloadLoop() {
    do {
      reloadRequested = false;
      const nextSnapshot = await loadSnapshot();
      if (destroyed) {
        return;
      }
      commitSnapshot(validateSnapshot(nextSnapshot));
    } while (snapshotReloadShouldContinue());
  }

  function validateSnapshot(snapshot: WorkspaceTrajectoryRuntimeSnapshot) {
    if (snapshot.workspaceId !== workspaceId) {
      throw new Error(
        `Workspace trajectory snapshot workspace mismatch: expected ${workspaceId}, received ${snapshot.workspaceId}`,
      );
    }
    if (
      workflowExecutionId !== "" &&
      snapshot.workflowExecutionId !== "" &&
      snapshot.workflowExecutionId !== workflowExecutionId
    ) {
      throw new Error(
        `Workspace trajectory snapshot workflow execution mismatch: expected ${workflowExecutionId}, received ${snapshot.workflowExecutionId}`,
      );
    }
    return snapshot;
  }

  function snapshotReloadShouldContinue() {
    return reloadRequested && runtime !== null && runtime.revision < reloadTargetRevision;
  }

  function recordSnapshotReloadError(caught: unknown) {
    if (destroyed) {
      return;
    }
    error = errorMessage(caught);
    loading = false;
    publishFrame();
  }

  function finishSnapshotReload() {
    reloadRunning = false;
    if (!destroyed) {
      setLoading(false);
      replayBufferedEvents();
    }
  }

  function clearPendingDelta() {
    pendingDelta = null;
    cancelFrame?.();
    cancelFrame = null;
  }

  function commitSnapshot(snapshot: WorkspaceTrajectoryRuntimeSnapshot) {
    runtime = runtimeStateFromSnapshot(snapshot);
    publishFrame();
  }

  function replayBufferedEvents() {
    if (bufferedEvents.length === 0 || runtime === null) {
      return;
    }
    const events = bufferedEvents.splice(0).sort((left, right) => left.sequence - right.sequence);
    for (const event of events) {
      if (destroyed) {
        return;
      }
      handleEvent(event);
    }
  }

  function publishFrame() {
    if (destroyed || runtime === null) {
      return;
    }
    pruneExpiredSprites();
    const nextFrame = displayFrameFromRuntime(runtime);
    frameSnapshot = {
      ...nextFrame,
      error,
      loading,
      ready: error === "",
      version: frameSnapshot.version + 1,
      workflowExecutionId,
      workspaceId,
    };
    scheduleExpiration();
    for (const listener of listeners) {
      listener();
    }
  }

  function setLoading(nextLoading: boolean) {
    if (loading === nextLoading) {
      return;
    }
    loading = nextLoading;
    if (runtime === null) {
      frameSnapshot = {
        ...frameSnapshot,
        loading,
        ready: false,
        version: frameSnapshot.version + 1,
      };
      for (const listener of listeners) {
        listener();
      }
      return;
    }
    publishFrame();
  }

  function bufferEvent(event: WorkspaceTrajectoryRuntimeEvent) {
    bufferedEvents.push(event);
    if (bufferedEvents.length > maxBufferedEvents) {
      bufferedEvents.splice(0, bufferedEvents.length - maxBufferedEvents);
    }
  }

  function currentRevision() {
    return pendingDelta?.toRevision ?? runtime?.revision ?? 0;
  }

  function pruneExpiredSprites() {
    if (runtime === null) {
      return;
    }
    const now = Date.now();
    for (const [id, sprite] of runtime.spritesById) {
      if (spriteIsExpired(sprite, now)) {
        runtime.spritesById.delete(id);
        anchorBySpriteId.delete(id);
      }
    }
  }

  function scheduleExpiration() {
    cancelExpiration?.();
    cancelExpiration = null;
    if (runtime === null || runtime.spritesById.size === 0) {
      return;
    }
    const now = Date.now();
    const nextExpiration = [...runtime.spritesById.values()]
      .map((sprite) => Date.parse(sprite.expiresAt))
      .filter((value) => Number.isFinite(value) && value > now)
      .sort((left, right) => left - right)[0];
    if (nextExpiration === undefined) {
      return;
    }
    const delayMs = Math.min(Math.max(250, nextExpiration - now + 40), maxExpirationDelayMs);
    cancelExpiration = scheduleDelay(() => {
      cancelExpiration = null;
      if (runtime === null || destroyed) {
        return;
      }
      const before = runtime.spritesById.size;
      pruneExpiredSprites();
      if (runtime.spritesById.size !== before) {
        publishFrame();
      } else {
        scheduleExpiration();
      }
    }, delayMs);
  }

  function displayFrameFromRuntime(
    state: RuntimeState,
  ): Omit<
    WorkspaceTrajectoryFrameSnapshot,
    "error" | "loading" | "ready" | "version" | "workflowExecutionId" | "workspaceId"
  > {
    const byWorkflowNodeId = new Map<string, WorkspaceTrajectoryDisplayItem[]>();
    for (const sprite of sortedSprites([...state.spritesById.values()])) {
      const anchorNodeId = anchorForSprite(sprite);
      const display: WorkspaceTrajectoryDisplayItem = {
        anchorNodeId,
        id: sprite.id,
        lane: anchorNodeId === "" ? "recent" : "workflow_node",
        sprite,
        type: "sprite",
      };
      if (anchorNodeId === "") {
        continue;
      }
      const group = byWorkflowNodeId.get(anchorNodeId) ?? [];
      group.push(display);
      byWorkflowNodeId.set(anchorNodeId, group);
      anchorBySpriteId.set(sprite.id, anchorNodeId);
    }
    const groups = [...byWorkflowNodeId.entries()]
      .map(([workflowNodeId, items]) => displayGroupForNode(workflowNodeId, items))
      .filter((group) => group.totalCount > 0)
      .sort((left, right) => stringTimestamp(right.updatedAt) - stringTimestamp(left.updatedAt));
    return {
      anchoredSpriteCount: groups.reduce((sum, group) => sum + group.totalCount, 0),
      groups,
      recentLane: [],
      revision: state.revision,
      totalSpriteCount: state.spritesById.size,
    };
  }

  function displayGroupForNode(
    workflowNodeId: string,
    items: WorkspaceTrajectoryDisplayItem[],
  ): WorkspaceTrajectoryDisplayGroup {
    const sorted = sortDisplayItems(displayItemsForCanvas(items));
    return {
      hiddenCount: Math.max(0, sorted.length - maxVisibleSpritesPerNode),
      highestSeverity: highestSeverity(sorted.map(displayItemSeverity)),
      items: sorted.slice(0, maxVisibleSpritesPerNode),
      totalCount: sorted.length,
      updatedAt: newestDisplayItemUpdatedAt(sorted),
      workflowNodeId,
    };
  }

  function anchorForSprite(sprite: WorkspaceTrajectorySprite) {
    return workspaceTrajectoryAnchorForSprite({
      anchorIndex,
      preservedAnchor: anchorBySpriteId.get(sprite.id) ?? "",
      sprite,
      workflowExecutionId,
    });
  }

  function getNodeDetails(workflowNodeId: string): WorkspaceTrajectoryNodeDetails {
    if (runtime === null || workflowNodeId === "") {
      return {
        hiddenCount: 0,
        items: [],
        revision: runtime?.revision ?? 0,
        timeline: [],
        totalCount: 0,
        workflowNodeId,
      };
    }
    const items = sortDisplayItems(
      displayItemsForDetails(
        [...runtime.spritesById.values()].flatMap((sprite) => {
          const anchorNodeId = anchorForSprite(sprite);
          return anchorNodeId === workflowNodeId
            ? [
                {
                  anchorNodeId,
                  id: sprite.id,
                  lane: "workflow_node" as const,
                  sprite,
                  type: "sprite" as const,
                },
              ]
            : [];
        }),
      ),
    );
    const spriteIds = new Set(items.flatMap(displayItemSourceSpriteIds));
    const timeline = [...runtime.timelineById.values()]
      .filter((item) => spriteIds.has(item.spriteId))
      .sort((left, right) => stringTimestamp(right.occurredAt) - stringTimestamp(left.occurredAt))
      .slice(0, maxNodeDetailSprites);
    return {
      hiddenCount: Math.max(0, items.length - maxNodeDetailSprites),
      items: items.slice(0, maxNodeDetailSprites),
      revision: runtime.revision,
      timeline,
      totalCount: items.length,
      workflowNodeId,
    };
  }
}

export function workspaceTrajectoryRunBindingsFromExecution(
  execution: WorkflowExecution,
): WorkspaceTrajectoryWorkflowRunBinding[] {
  return execution.nodeExecutions.flatMap((nodeExecution) => {
    const chatRunId = runnerRefValue(nodeExecution.runnerRefs, "chat.run");
    if (chatRunId === "") {
      return [];
    }
    return [
      {
        chatRunId,
        workflowExecutionId: execution.id,
        workflowNodeExecutionId: nodeExecution.id,
        workflowNodeId: nodeExecution.nodeId,
      },
    ];
  });
}

function runtimeStateFromSnapshot(snapshot: WorkspaceTrajectoryRuntimeSnapshot): RuntimeState {
  return {
    aggregatesById: mapById(snapshot.aggregateByWorkflowNode, (item) => item.id),
    detailRefsById: mapById(snapshot.detailRefs, (item) => item.id),
    generatedAt: snapshot.generatedAt,
    limits: snapshot.limits,
    payloadBudget: snapshot.payloadBudget,
    revision: snapshot.revision,
    spritesById: mapById(snapshot.sprites, (item) => item.id),
    timelineById: mapById(snapshot.timeline, (item) => item.id),
    workspaceId: snapshot.workspaceId,
  };
}

function emptyPendingTrajectoryDelta(
  delta: WorkspaceTrajectoryRuntimeDelta,
): PendingTrajectoryDelta {
  return {
    aggregateUpdates: new Map(),
    detailRefs: new Map(),
    fromRevision: delta.fromRevision,
    generatedAt: delta.generatedAt,
    removals: {
      aggregateIds: [],
      detailRefIds: [],
      spriteIds: [],
      timelineIds: [],
    },
    spriteUpdates: new Map(),
    timelineUpdates: new Map(),
    toRevision: delta.toRevision,
    workspaceId: delta.workspaceId,
  };
}

function materializePendingDelta(pending: PendingTrajectoryDelta): WorkspaceTrajectoryRuntimeDelta {
  return {
    aggregateUpdates: [...pending.aggregateUpdates.values()],
    changedAreas: [],
    detailRefs: [...pending.detailRefs.values()],
    fromRevision: pending.fromRevision,
    generatedAt: pending.generatedAt,
    payloadBudget: {
      byteSize: 0,
      maxByteSize: 0,
      omittedSpriteCount: 0,
      truncatedStringCount: 0,
    },
    removals: {
      aggregateIds: uniqueStrings(pending.removals.aggregateIds),
      detailRefIds: uniqueStrings(pending.removals.detailRefIds),
      spriteIds: uniqueStrings(pending.removals.spriteIds),
      timelineIds: uniqueStrings(pending.removals.timelineIds),
    },
    schemaVersion: 1,
    spriteUpdates: [...pending.spriteUpdates.values()],
    timelineUpdates: [...pending.timelineUpdates.values()],
    toRevision: pending.toRevision,
    workspaceId: pending.workspaceId,
  };
}

function applyTrajectoryDelta(
  runtime: RuntimeState | null,
  delta: WorkspaceTrajectoryRuntimeDelta,
): RuntimeState | null {
  if (runtime === null || !trajectoryDeltaMatchesRuntime(runtime, delta)) {
    return null;
  }
  return {
    ...runtime,
    aggregatesById: replaceLimitedRuntimeItems(
      runtime,
      runtime.aggregatesById,
      delta.aggregateUpdates,
      delta.removals.aggregateIds,
      "maxAggregates",
    ),
    detailRefsById: replaceLimitedRuntimeItems(
      runtime,
      runtime.detailRefsById,
      delta.detailRefs,
      delta.removals.detailRefIds,
      "maxDetailRefs",
    ),
    generatedAt: delta.generatedAt,
    payloadBudget: delta.payloadBudget,
    revision: delta.toRevision,
    spritesById: replaceLimitedRuntimeItems(
      runtime,
      runtime.spritesById,
      delta.spriteUpdates,
      delta.removals.spriteIds,
      "maxSprites",
    ),
    timelineById: replaceLimitedRuntimeItems(
      runtime,
      runtime.timelineById,
      delta.timelineUpdates,
      delta.removals.timelineIds,
      "maxTimelineItems",
    ),
  };
}

function trajectoryDeltaMatchesRuntime(
  runtime: RuntimeState,
  delta: WorkspaceTrajectoryRuntimeDelta,
) {
  return runtime.revision === delta.fromRevision && delta.workspaceId === runtime.workspaceId;
}

function replaceLimitedRuntimeItems<T extends { id: string }>(
  runtime: RuntimeState,
  current: ReadonlyMap<string, T>,
  updates: readonly T[],
  removalIds: readonly string[],
  limitKey: keyof WorkspaceTrajectoryRuntimeSnapshot["limits"],
) {
  return replaceMapItems(
    current,
    updates,
    removalIds,
    (item) => item.id,
    runtime.limits?.[limitKey] ?? defaultTrajectoryLimit,
  );
}

function mergeRuntimeEntityUpdates<T>(
  pending: Map<string, T>,
  pendingRemovalIds: string[],
  updates: readonly T[],
  removalIds: readonly string[],
  itemKey: (item: T) => string,
) {
  for (const id of removalIds) {
    pending.delete(id);
    pendingRemovalIds.push(id);
  }
  for (const update of updates) {
    const id = itemKey(update);
    removeString(pendingRemovalIds, id);
    pending.set(id, update);
  }
}

function replaceMapItems<T>(
  current: ReadonlyMap<string, T>,
  updates: readonly T[],
  removalIds: readonly string[],
  itemKey: (item: T) => string,
  limit: number,
) {
  const next = new Map(current);
  for (const id of removalIds) {
    next.delete(id);
  }
  for (const update of updates) {
    next.set(itemKey(update), update);
  }
  return mapById(
    [...next.values()]
      .sort((left, right) => itemTimestamp(right) - itemTimestamp(left))
      .slice(0, Math.max(0, limit)),
    itemKey,
  );
}

function mapById<T>(items: readonly T[], itemKey: (item: T) => string) {
  const result = new Map<string, T>();
  for (const item of items) {
    result.set(itemKey(item), item);
  }
  return result;
}

function sortedSprites(sprites: WorkspaceTrajectorySprite[]) {
  return sprites.sort(
    (left, right) =>
      spriteStatusRank(right) - spriteStatusRank(left) ||
      severityRank(right.severity) - severityRank(left.severity) ||
      stringTimestamp(right.updatedAt || right.createdAt) -
        stringTimestamp(left.updatedAt || left.createdAt) ||
      left.id.localeCompare(right.id),
  );
}

function spriteStatusRank(sprite: WorkspaceTrajectorySprite) {
  switch (sprite.status) {
    case "approval_required":
      return 600;
    case "failed":
      return 500;
    case "running":
      return 400;
    case "pending":
      return 300;
    case "cancelled":
      return 200;
    case "completed":
      return 100;
    case "unknown":
      return 0;
    default:
      return assertNever(sprite.status);
  }
}

function highestSeverity(severities: WorkspaceTrajectorySpriteSeverity[]) {
  return severities.sort((left, right) => severityRank(right) - severityRank(left))[0] ?? "info";
}

function severityRank(severity: WorkspaceTrajectorySpriteSeverity) {
  switch (severity) {
    case "blocking":
      return 500;
    case "error":
      return 400;
    case "warning":
      return 300;
    case "success":
      return 200;
    case "info":
      return 100;
    default:
      return assertNever(severity);
  }
}

function itemTimestamp(item: unknown) {
  if (typeof item !== "object" || item === null) {
    return 0;
  }
  const record = item as Record<string, unknown>;
  for (const field of ["updatedAt", "occurredAt", "createdAt", "generatedAt"]) {
    const value = record[field];
    if (typeof value === "string") {
      return stringTimestamp(value);
    }
  }
  return 0;
}

function stringTimestamp(value: string) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function spriteIsExpired(sprite: WorkspaceTrajectorySprite, now: number) {
  if (sprite.status === "running" || sprite.status === "pending" || sprite.expiresAt === "") {
    return false;
  }
  const expiresAt = Date.parse(sprite.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt <= now;
}

function runnerRefValue(refs: readonly { id: string; kind: string }[], kind: string) {
  return refs.find((ref) => ref.kind === kind)?.id ?? "";
}

function uniqueStrings(values: readonly string[]) {
  return [...new Set(values.filter(Boolean))].sort();
}

function removeString(values: string[], value: string) {
  const index = values.indexOf(value);
  if (index >= 0) {
    values.splice(index, 1);
  }
}

function defaultScheduleFrame(callback: () => void) {
  const frame = window.requestAnimationFrame(callback);
  return () => window.cancelAnimationFrame(frame);
}

function defaultScheduleDelay(callback: () => void, delayMs: number) {
  const timeout = window.setTimeout(callback, delayMs);
  return () => window.clearTimeout(timeout);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function assertNever(value: never): never {
  throw new Error(`Unhandled workspace trajectory value: ${String(value)}`);
}
