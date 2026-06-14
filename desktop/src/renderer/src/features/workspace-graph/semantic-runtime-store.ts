import type {
  SemanticGraphChangeEvent,
  SemanticRuntimeDelta,
  SemanticRuntimeSnapshot,
  SemanticWorkingSet,
  SemanticWorkingSetStatus,
} from "@generated/backend";

import { semanticWorkingSetFromRuntimeSnapshot } from "./semantic-runtime-working-set";

export interface SemanticRuntimeFrameSnapshot {
  cameraMoving: boolean;
  error: string;
  loading: boolean;
  ready: boolean;
  revision: number;
  version: number;
  workingSet: SemanticWorkingSet | null;
  workspaceId: string;
}

export interface SemanticRuntimeStore {
  destroy: () => void;
  getFrameSnapshot: () => SemanticRuntimeFrameSnapshot;
  getSnapshot: () => SemanticRuntimeSnapshot | null;
  handleEvent: (event: SemanticGraphChangeEvent) => void;
  noteCameraMovement: () => void;
  start: () => void;
  subscribe: (listener: () => void) => () => void;
}

interface CreateSemanticRuntimeStoreRequest {
  cameraSettleDelayMs?: number;
  loadSnapshot: () => Promise<SemanticRuntimeSnapshot>;
  scheduleDelay?: (callback: () => void, delayMs: number) => () => void;
  scheduleFrame?: (callback: () => void) => () => void;
  subscribeEvents: (listener: (event: SemanticGraphChangeEvent) => void) => () => void;
  workspaceId: string;
}

interface PendingRuntimeDelta {
  aggregateSourceUpdates: Map<string, SemanticRuntimeDelta["aggregateSourceUpdates"][number]>;
  cartographerRunUpdates: Map<string, SemanticRuntimeDelta["cartographerRunUpdates"][number]>;
  cartographerWindowUpdates: Map<string, SemanticRuntimeDelta["cartographerWindowUpdates"][number]>;
  changedAreas: Set<SemanticRuntimeDelta["changedAreas"][number]>;
  fromRevision: number;
  generatedAt: string;
  patchPreviewUpdates: Map<string, SemanticRuntimeDelta["patchPreviewUpdates"][number]>;
  removals: {
    aggregateSourceIds: Set<string>;
    cartographerRunIds: Set<string>;
    cartographerWindowIds: Set<string>;
    patchPreviewIds: Set<string>;
    runItemIds: Set<string>;
    semanticNodeActivityIds: Set<string>;
    workflowNodeIds: Set<string>;
  };
  runItemUpdates: Map<string, SemanticRuntimeDelta["runItemUpdates"][number]>;
  semanticChangeUpdates: Map<string, SemanticRuntimeDelta["semanticChangeUpdates"][number]>;
  semanticNodeActivityUpdates: Map<
    string,
    SemanticRuntimeDelta["semanticNodeActivityUpdates"][number]
  >;
  toRevision: number;
  workflowNodeUpdates: Map<string, SemanticRuntimeDelta["workflowNodeUpdates"][number]>;
  workspaceId: string;
}

const defaultCameraSettleDelayMs = 120;

export const emptySemanticRuntimeFrameSnapshot: SemanticRuntimeFrameSnapshot = {
  cameraMoving: false,
  error: "",
  loading: false,
  ready: true,
  revision: 0,
  version: 0,
  workingSet: null,
  workspaceId: "",
};

export function createSemanticRuntimeStore({
  cameraSettleDelayMs = defaultCameraSettleDelayMs,
  loadSnapshot,
  scheduleDelay = defaultScheduleDelay,
  scheduleFrame = defaultScheduleFrame,
  subscribeEvents,
  workspaceId,
}: CreateSemanticRuntimeStoreRequest): SemanticRuntimeStore {
  let cameraMoving = false;
  let destroyed = false;
  let error = "";
  let frameSnapshot: SemanticRuntimeFrameSnapshot = {
    ...emptySemanticRuntimeFrameSnapshot,
    ready: false,
    workspaceId,
  };
  let loading = false;
  let pendingDelta: PendingRuntimeDelta | null = null;
  let reloadRequested = false;
  let reloadRunning = false;
  let reloadTargetRevision = 0;
  let snapshot: SemanticRuntimeSnapshot | null = null;
  let started = false;
  let unsubscribeEvents: (() => void) | null = null;
  let visualPublishPending = false;
  let workingSet: SemanticWorkingSet | null = null;
  const listeners = new Set<() => void>();
  let cancelCameraSettle: (() => void) | null = null;
  let cancelFrame: (() => void) | null = null;

  const store: SemanticRuntimeStore = {
    destroy,
    getFrameSnapshot: () => frameSnapshot,
    getSnapshot: () => snapshot,
    handleEvent,
    noteCameraMovement,
    start,
    subscribe,
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
    cancelCameraSettle?.();
    cancelCameraSettle = null;
    cancelFrame?.();
    cancelFrame = null;
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

  function handleEvent(event: SemanticGraphChangeEvent) {
    if (
      destroyed ||
      event.workspaceId !== workspaceId ||
      !semanticGraphChangeHasRuntimeUpdate(event)
    ) {
      return;
    }
    const delta = event.semanticRuntimeDelta;
    if (delta === null) {
      if (
        event.semanticRuntimeSnapshotRequired ||
        snapshot === null ||
        event.semanticRuntimeRevision > currentRuntimeRevision()
      ) {
        requestSnapshotReload(event.semanticRuntimeRevision);
      }
      return;
    }
    queueDelta(delta);
  }

  function noteCameraMovement() {
    if (destroyed) {
      return;
    }
    cameraMoving = true;
    cancelCameraSettle?.();
    cancelCameraSettle = scheduleDelay(() => {
      cancelCameraSettle = null;
      cameraMoving = false;
      if (pendingDelta !== null || visualPublishPending) {
        scheduleRuntimeFrame();
      }
    }, cameraSettleDelayMs);
  }

  function queueDelta(delta: SemanticRuntimeDelta) {
    if (delta.workspaceId !== workspaceId) {
      return;
    }
    if (reloadRunning) {
      requestSnapshotReload(delta.toRevision);
      return;
    }
    if (snapshot === null) {
      requestSnapshotReload(delta.toRevision);
      return;
    }
    const expectedRevision = pendingDelta?.toRevision ?? snapshot.revision;
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

  function mergePendingDelta(delta: SemanticRuntimeDelta) {
    if (pendingDelta === null) {
      pendingDelta = emptyPendingRuntimeDelta(delta);
    }
    pendingDelta.toRevision = delta.toRevision;
    pendingDelta.generatedAt = delta.generatedAt;
    for (const area of delta.changedAreas) {
      pendingDelta.changedAreas.add(area);
    }
    mergeRuntimeEntityUpdates(
      pendingDelta.workflowNodeUpdates,
      pendingDelta.removals.workflowNodeIds,
      delta.workflowNodeUpdates,
      delta.removals.workflowNodeIds,
    );
    mergeRuntimeEntityUpdates(
      pendingDelta.runItemUpdates,
      pendingDelta.removals.runItemIds,
      delta.runItemUpdates,
      delta.removals.runItemIds,
    );
    mergeRuntimeEntityUpdates(
      pendingDelta.cartographerRunUpdates,
      pendingDelta.removals.cartographerRunIds,
      delta.cartographerRunUpdates,
      delta.removals.cartographerRunIds,
    );
    mergeRuntimeEntityUpdates(
      pendingDelta.cartographerWindowUpdates,
      pendingDelta.removals.cartographerWindowIds,
      delta.cartographerWindowUpdates,
      delta.removals.cartographerWindowIds,
    );
    mergeRuntimeEntityUpdates(
      pendingDelta.patchPreviewUpdates,
      pendingDelta.removals.patchPreviewIds,
      delta.patchPreviewUpdates,
      delta.removals.patchPreviewIds,
    );
    mergeRuntimeEntityUpdates(
      pendingDelta.aggregateSourceUpdates,
      pendingDelta.removals.aggregateSourceIds,
      delta.aggregateSourceUpdates,
      delta.removals.aggregateSourceIds,
    );
    mergeRuntimeEntityUpdates(
      pendingDelta.semanticNodeActivityUpdates,
      pendingDelta.removals.semanticNodeActivityIds,
      delta.semanticNodeActivityUpdates,
      delta.removals.semanticNodeActivityIds,
    );
    mergeRuntimeEntityUpdates(
      pendingDelta.semanticChangeUpdates,
      new Set<string>(),
      delta.semanticChangeUpdates,
      [],
    );
  }

  function scheduleRuntimeFrame() {
    if (cancelFrame !== null || (pendingDelta === null && !visualPublishPending)) {
      return;
    }
    cancelFrame = scheduleFrame(flushRuntimeFrame);
  }

  function flushRuntimeFrame() {
    cancelFrame = null;
    if (destroyed) {
      return;
    }
    if (pendingDelta === null) {
      if (!cameraMoving && visualPublishPending) {
        publishRuntimeSnapshot();
      }
      return;
    }
    if (cameraMoving) {
      if (applyPendingDeltaToStore()) {
        visualPublishPending = true;
      }
      return;
    }
    if (applyPendingDeltaToStore()) {
      publishRuntimeSnapshot();
    }
  }

  function applyPendingDeltaToStore() {
    if (pendingDelta === null) {
      return false;
    }
    const delta = materializePendingRuntimeDelta(pendingDelta);
    pendingDelta = null;
    const nextSnapshot = applySemanticRuntimeDelta(snapshot, delta);
    if (nextSnapshot === null) {
      requestSnapshotReload(delta.toRevision);
      return false;
    }
    snapshot = nextSnapshot;
    error = "";
    loading = false;
    reloadTargetRevision = Math.max(reloadTargetRevision, nextSnapshot.revision);
    return true;
  }

  function requestSnapshotReload(targetRevision: number) {
    reloadTargetRevision = Math.max(reloadTargetRevision, targetRevision);
    clearPendingRuntimeDelta();
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
      commitSnapshot(validateSnapshotWorkspace(nextSnapshot));
    } while (snapshotReloadShouldContinue());
  }

  function validateSnapshotWorkspace(nextSnapshot: SemanticRuntimeSnapshot) {
    if (nextSnapshot.workspaceId !== workspaceId) {
      throw new Error(
        `Semantic runtime snapshot workspace mismatch: expected ${workspaceId}, received ${nextSnapshot.workspaceId}`,
      );
    }
    return nextSnapshot;
  }

  function snapshotReloadShouldContinue() {
    return reloadRequested && snapshot !== null && snapshot.revision < reloadTargetRevision;
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
    }
  }

  function clearPendingRuntimeDelta() {
    pendingDelta = null;
    cancelFrame?.();
    cancelFrame = null;
  }

  function commitSnapshot(nextSnapshot: SemanticRuntimeSnapshot) {
    snapshot = nextSnapshot;
    publishRuntimeSnapshot();
  }

  function publishRuntimeSnapshot() {
    if (snapshot === null) {
      return;
    }
    workingSet = semanticWorkingSetFromRuntimeSnapshot(snapshot);
    error = "";
    loading = false;
    reloadTargetRevision = Math.max(reloadTargetRevision, snapshot.revision);
    visualPublishPending = false;
    publishFrame();
  }

  function setLoading(nextLoading: boolean) {
    if (loading === nextLoading) {
      return;
    }
    loading = nextLoading;
    publishFrame();
  }

  function publishFrame() {
    if (destroyed) {
      return;
    }
    frameSnapshot = {
      cameraMoving,
      error,
      loading,
      ready: snapshot !== null && error === "",
      revision: snapshot?.revision ?? 0,
      version: frameSnapshot.version + 1,
      workingSet,
      workspaceId,
    };
    for (const listener of listeners) {
      listener();
    }
  }

  function currentRuntimeRevision() {
    return pendingDelta?.toRevision ?? snapshot?.revision ?? 0;
  }
}

export function semanticGraphChangeHasRuntimeUpdate(event: SemanticGraphChangeEvent) {
  return (
    event.semanticRuntimeDelta !== null ||
    event.semanticRuntimeSnapshotRequired ||
    event.changedAreas.some((area) => area === "working_set" || area === "cartographer_audit")
  );
}

function applySemanticRuntimeDelta(
  snapshot: SemanticRuntimeSnapshot | null,
  delta: SemanticRuntimeDelta,
): SemanticRuntimeSnapshot | null {
  if (
    snapshot === null ||
    snapshot.workspaceId !== delta.workspaceId ||
    snapshot.revision !== delta.fromRevision
  ) {
    return null;
  }
  const activeRuns = replaceRuntimeItems(
    snapshot.cartographer.activeRuns,
    delta.cartographerRunUpdates.filter((run) => semanticWorkingSetStatusIsActive(run.status)),
    delta.removals.cartographerRunIds,
    snapshot.limits.maxCartographerRuns,
    runtimeItemTimestamp,
  );
  const activeWindows = replaceRuntimeItems(
    snapshot.cartographer.activeWindows,
    delta.cartographerWindowUpdates.filter((window) => window.status === "window_open"),
    delta.removals.cartographerWindowIds,
    snapshot.limits.maxCartographerWindows,
    runtimeItemTimestamp,
  );
  const patches = replaceRuntimeItems(
    snapshot.patches,
    delta.patchPreviewUpdates,
    delta.removals.patchPreviewIds,
    snapshot.limits.maxPatchPreviews,
    runtimeItemTimestamp,
  );
  const recentSemanticChanges = replaceRuntimeItems(
    snapshot.semanticActivity.recentSemanticChanges,
    delta.semanticChangeUpdates,
    [],
    snapshot.limits.maxSemanticChanges,
    (item) => item.occurredAt,
  );
  const nodeActivity = replaceRuntimeItems(
    snapshot.semanticActivity.nodeActivity,
    delta.semanticNodeActivityUpdates,
    delta.removals.semanticNodeActivityIds,
    snapshot.limits.maxSemanticChanges,
    runtimeItemTimestamp,
  );
  const aggregateSources = replaceRuntimeItems(
    snapshot.displayHints.aggregateSources,
    delta.aggregateSourceUpdates,
    delta.removals.aggregateSourceIds,
    snapshot.limits.maxAggregateSources,
    runtimeItemTimestamp,
  );
  const workflowNodeUpdates = replaceRuntimeItems(
    snapshot.workflow.workflowNodeUpdates,
    delta.workflowNodeUpdates,
    delta.removals.workflowNodeIds,
    snapshot.limits.maxAggregateSources,
    runtimeItemTimestamp,
  );
  const runItemUpdates = replaceRuntimeItems(
    snapshot.workflow.runItemUpdates,
    delta.runItemUpdates,
    delta.removals.runItemIds,
    snapshot.limits.maxAggregateSources,
    runtimeItemTimestamp,
  );
  return {
    ...snapshot,
    revision: delta.toRevision,
    generatedAt: delta.generatedAt,
    workflow: {
      ...snapshot.workflow,
      activeRunItemIds: uniqueSortedStrings(runItemUpdates.map((item) => item.runItemId)),
      activeWorkflowNodeIds: uniqueSortedStrings(
        workflowNodeUpdates.map((item) => item.workflowNodeId),
      ),
      runItemUpdates,
      workflowNodeUpdates,
    },
    cartographer: {
      ...snapshot.cartographer,
      activeRuns,
      activeWindows,
      updatedAt: delta.generatedAt,
    },
    patches,
    semanticActivity: {
      ...snapshot.semanticActivity,
      nodeActivity,
      recentSemanticChanges,
    },
    displayHints: {
      ...snapshot.displayHints,
      aggregateSources,
    },
  };
}

function emptyPendingRuntimeDelta(delta: SemanticRuntimeDelta): PendingRuntimeDelta {
  return {
    aggregateSourceUpdates: new Map(),
    cartographerRunUpdates: new Map(),
    cartographerWindowUpdates: new Map(),
    changedAreas: new Set(),
    fromRevision: delta.fromRevision,
    generatedAt: delta.generatedAt,
    patchPreviewUpdates: new Map(),
    removals: {
      aggregateSourceIds: new Set(),
      cartographerRunIds: new Set(),
      cartographerWindowIds: new Set(),
      patchPreviewIds: new Set(),
      runItemIds: new Set(),
      semanticNodeActivityIds: new Set(),
      workflowNodeIds: new Set(),
    },
    runItemUpdates: new Map(),
    semanticChangeUpdates: new Map(),
    semanticNodeActivityUpdates: new Map(),
    toRevision: delta.fromRevision,
    workflowNodeUpdates: new Map(),
    workspaceId: delta.workspaceId,
  };
}

function mergeRuntimeEntityUpdates<T extends { id: string }>(
  updatesById: Map<string, T>,
  removalIds: Set<string>,
  updates: readonly T[],
  removals: readonly string[],
) {
  for (const id of removals) {
    updatesById.delete(id);
    removalIds.add(id);
  }
  for (const update of updates) {
    removalIds.delete(update.id);
    updatesById.set(update.id, update);
  }
}

function materializePendingRuntimeDelta(pending: PendingRuntimeDelta): SemanticRuntimeDelta {
  return {
    aggregateSourceUpdates: [...pending.aggregateSourceUpdates.values()],
    cartographerRunUpdates: [...pending.cartographerRunUpdates.values()],
    cartographerWindowUpdates: [...pending.cartographerWindowUpdates.values()],
    changedAreas: [...pending.changedAreas],
    fromRevision: pending.fromRevision,
    generatedAt: pending.generatedAt,
    patchPreviewUpdates: [...pending.patchPreviewUpdates.values()],
    removals: {
      aggregateSourceIds: [...pending.removals.aggregateSourceIds],
      cartographerRunIds: [...pending.removals.cartographerRunIds],
      cartographerWindowIds: [...pending.removals.cartographerWindowIds],
      patchPreviewIds: [...pending.removals.patchPreviewIds],
      runItemIds: [...pending.removals.runItemIds],
      semanticNodeActivityIds: [...pending.removals.semanticNodeActivityIds],
      workflowNodeIds: [...pending.removals.workflowNodeIds],
    },
    runItemUpdates: [...pending.runItemUpdates.values()],
    semanticChangeUpdates: [...pending.semanticChangeUpdates.values()],
    semanticNodeActivityUpdates: [...pending.semanticNodeActivityUpdates.values()],
    toRevision: pending.toRevision,
    workflowNodeUpdates: [...pending.workflowNodeUpdates.values()],
    workspaceId: pending.workspaceId,
  };
}

function replaceRuntimeItems<T extends { id: string }>(
  current: readonly T[],
  updates: readonly T[],
  removalIds: readonly string[],
  limit: number,
  timestamp: (item: T) => string,
): T[] {
  const removals = new Set(removalIds);
  const byId = new Map<string, T>();
  for (const item of current) {
    if (!removals.has(item.id)) {
      byId.set(item.id, item);
    }
  }
  for (const item of updates) {
    if (!removals.has(item.id)) {
      byId.set(item.id, item);
    }
  }
  return [...byId.values()]
    .sort((left, right) => {
      const leftTime = timestamp(left);
      const rightTime = timestamp(right);
      if (leftTime !== rightTime) {
        return rightTime.localeCompare(leftTime);
      }
      return left.id.localeCompare(right.id);
    })
    .slice(0, limit);
}

function runtimeItemTimestamp(item: { updatedAt: string }) {
  return item.updatedAt;
}

function semanticWorkingSetStatusIsActive(status: SemanticWorkingSetStatus) {
  switch (status) {
    case "observing":
    case "window_open":
    case "queued":
    case "running":
    case "proposing":
    case "applying":
    case "pending_review":
      return true;
    default:
      return false;
  }
}

function uniqueSortedStrings(values: readonly string[]) {
  return uniqueValues(values.filter((value) => value !== "")).sort();
}

function uniqueValues<T extends string>(values: readonly T[]) {
  return [...new Set(values.filter((value) => value !== ""))];
}

function defaultScheduleFrame(callback: () => void) {
  if (
    typeof globalThis.requestAnimationFrame === "function" &&
    typeof globalThis.cancelAnimationFrame === "function"
  ) {
    const frameId = globalThis.requestAnimationFrame(() => callback());
    return () => globalThis.cancelAnimationFrame(frameId);
  }
  const timeoutId = globalThis.setTimeout(callback, 16);
  return () => globalThis.clearTimeout(timeoutId);
}

function defaultScheduleDelay(callback: () => void, delayMs: number) {
  const timeoutId = globalThis.setTimeout(callback, delayMs);
  return () => globalThis.clearTimeout(timeoutId);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Semantic runtime load failed";
}
