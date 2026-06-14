import type {
  SemanticActivityInterval,
  SemanticActivitySummary,
  SemanticGraph,
  SemanticGraphChangeEvent,
  SemanticLayoutPosition,
  SemanticRuntimeDelta,
  SemanticRuntimeSnapshot,
  SemanticWorkingSet,
  SemanticWorkingSetStatus,
} from "@generated/backend";
import { useCallback, useEffect, useState } from "react";

import { useWorkspaceStore } from "../../stores/workspace-store";

interface SemanticGraphState {
  activitiesByNodeId: Map<string, SemanticActivityInterval[]>;
  error: string;
  graph: SemanticGraph | null;
  loading: boolean;
  noWorkspace: boolean;
  ready: boolean;
  workingSet: SemanticWorkingSet | null;
  workspaceId: string;
}

export interface SemanticGraphRefreshRequest {
  activity: boolean;
  graph: boolean;
  workingSet: boolean;
}

const semanticGraphActivityLimit = 3;
const semanticWorkingSetLimit = 40;
const emptyRefreshRequest: SemanticGraphRefreshRequest = {
  activity: false,
  graph: false,
  workingSet: false,
};
const fullRefreshRequest: SemanticGraphRefreshRequest = {
  activity: true,
  graph: true,
  workingSet: true,
};

export function useSemanticGraphState() {
  const selectedWorkspaceId = useWorkspaceStore(
    (state) => state.session?.selectedWorkspaceId ?? "",
  );
  const [state, setState] = useState<SemanticGraphState>(() => semanticGraphNoWorkspaceState(""));

  useEffect(() => {
    let disposed = false;
    let refreshQueued = false;
    let refreshRunning = false;
    let refreshRequested = false;
    let scheduledRefresh = emptyRefreshRequest;
    let runtimeReloadRunning = false;
    let runtimeReloadRequested = false;
    let runtimeSnapshot: SemanticRuntimeSnapshot | null = null;

    if (selectedWorkspaceId === "") {
      setState(semanticGraphNoWorkspaceState(""));
      return;
    }

    setState(semanticGraphLoadingState(selectedWorkspaceId));

    const refresh = async (
      reason: "initial" | "notification",
      request: SemanticGraphRefreshRequest,
    ) => {
      if (refreshRunning) {
        scheduledRefresh = mergeSemanticGraphRefreshRequests(scheduledRefresh, request);
        refreshRequested = true;
        return;
      }
      refreshRunning = true;
      let nextRequest = request;
      try {
        do {
          refreshRequested = false;
          try {
            const snapshot = await loadSemanticGraphSnapshot(selectedWorkspaceId, nextRequest);
            if (disposed) {
              continue;
            }
            if (snapshot.runtimeSnapshot !== undefined) {
              runtimeSnapshot = snapshot.runtimeSnapshot;
            }
            setState((current) => ({
              activitiesByNodeId: snapshot.activitiesByNodeId ?? current.activitiesByNodeId,
              error: "",
              graph: snapshot.graph ?? current.graph,
              loading: false,
              noWorkspace: false,
              ready: true,
              workingSet: snapshot.workingSet ?? current.workingSet,
              workspaceId: selectedWorkspaceId,
            }));
          } catch (error: unknown) {
            console.error(
              reason === "initial"
                ? "Failed to load semantic graph"
                : "Failed to refresh semantic graph",
              error,
            );
            if (!disposed) {
              setState((current) =>
                current.workspaceId === selectedWorkspaceId
                  ? {
                      ...current,
                      error: errorMessage(error),
                      loading: false,
                      noWorkspace: false,
                      ready: false,
                      workspaceId: selectedWorkspaceId,
                    }
                  : current,
              );
            }
          }
          nextRequest = scheduledRefresh;
          scheduledRefresh = emptyRefreshRequest;
        } while (refreshRequested && !disposed);
      } finally {
        refreshRunning = false;
      }
    };

    const reloadRuntimeSnapshot = async () => {
      if (runtimeReloadRunning) {
        runtimeReloadRequested = true;
        return;
      }
      runtimeReloadRunning = true;
      try {
        do {
          runtimeReloadRequested = false;
          try {
            const snapshot = await loadSemanticRuntimeSnapshot(selectedWorkspaceId);
            if (!disposed) {
              runtimeSnapshot = snapshot;
              setState((current) =>
                current.workspaceId === selectedWorkspaceId
                  ? {
                      ...current,
                      error: "",
                      loading: false,
                      ready: true,
                      workingSet: semanticWorkingSetFromRuntimeSnapshot(snapshot),
                    }
                  : current,
              );
            }
          } catch (error) {
            console.error("Failed to reload semantic runtime snapshot", error);
            if (!disposed) {
              setState((current) =>
                current.workspaceId === selectedWorkspaceId
                  ? {
                      ...current,
                      error: errorMessage(error),
                      ready: false,
                    }
                  : current,
              );
            }
          }
        } while (runtimeReloadRequested && !disposed);
      } finally {
        runtimeReloadRunning = false;
      }
    };

    const applyRuntimeEvent = (event: SemanticGraphChangeEvent) => {
      if (
        event.workspaceId !== selectedWorkspaceId ||
        !semanticGraphChangeHasRuntimeUpdate(event)
      ) {
        return;
      }
      const delta = event.semanticRuntimeDelta;
      if (delta === null) {
        if (
          event.semanticRuntimeSnapshotRequired ||
          runtimeSnapshot === null ||
          event.semanticRuntimeRevision > runtimeSnapshot.revision
        ) {
          void reloadRuntimeSnapshot();
        }
        return;
      }
      const nextRuntimeSnapshot = applySemanticRuntimeDelta(runtimeSnapshot, delta);
      if (nextRuntimeSnapshot === null) {
        void reloadRuntimeSnapshot();
        return;
      }
      runtimeSnapshot = nextRuntimeSnapshot;
      setState((current) =>
        current.workspaceId === selectedWorkspaceId
          ? {
              ...current,
              workingSet: semanticWorkingSetFromRuntimeSnapshot(nextRuntimeSnapshot),
            }
          : current,
      );
    };

    const scheduleRefresh = (request: SemanticGraphRefreshRequest) => {
      scheduledRefresh = mergeSemanticGraphRefreshRequests(scheduledRefresh, request);
      if (refreshRunning) {
        refreshRequested = true;
        return;
      }
      if (refreshQueued) {
        return;
      }
      refreshQueued = true;
      queueMicrotask(() => {
        refreshQueued = false;
        const request = scheduledRefresh;
        scheduledRefresh = emptyRefreshRequest;
        if (semanticGraphRefreshRequestIsEmpty(request)) {
          return;
        }
        void refresh("notification", request);
      });
    };

    void refresh("initial", fullRefreshRequest);
    const unsubscribe = window.setta.semanticGraph.onEvent((event) => {
      applyRuntimeEvent(event);
      const request = semanticGraphRefreshRequestForChange(event, selectedWorkspaceId);
      if (request !== null) {
        scheduleRefresh(request);
      }
    });

    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [selectedWorkspaceId]);

  const replaceSemanticLayoutPositions = useCallback((positions: SemanticLayoutPosition[]) => {
    setState((current) =>
      current.graph === null
        ? current
        : {
            ...current,
            graph: {
              ...current.graph,
              layoutPositions: positions,
            },
          },
    );
  }, []);

  return {
    ...state,
    replaceSemanticLayoutPositions,
  };
}

export function semanticGraphActivitySummaryMap(summary: SemanticActivitySummary) {
  const entries = summary.targets.map((target): [string, SemanticActivityInterval[]] => [
    target.targetEntityId,
    dedupeSemanticActivity([...target.currentActivity, ...target.recentActivity]),
  ]);
  return new Map(entries);
}

export function semanticGraphRefreshRequestForChange(
  event: SemanticGraphChangeEvent,
  workspaceId: string,
): SemanticGraphRefreshRequest | null {
  if (event.workspaceId !== workspaceId) {
    return null;
  }
  const graph = event.changedAreas.some((area) => area === "graph" || area === "layout");
  const activity = graph || event.changedAreas.includes("activity");
  const workingSet = graph || activity;
  if (!graph && !activity && !workingSet) {
    return null;
  }
  return { activity, graph, workingSet };
}

export function semanticGraphChangeAffectsWorkspaceGraphState(
  event: SemanticGraphChangeEvent,
  workspaceId: string,
) {
  return (
    semanticGraphRefreshRequestForChange(event, workspaceId) !== null ||
    (event.workspaceId === workspaceId && semanticGraphChangeHasRuntimeUpdate(event))
  );
}

async function loadSemanticGraphSnapshot(
  workspaceId: string,
  request: SemanticGraphRefreshRequest,
) {
  if (request.graph) {
    const [graph, activitySummary, runtimeSnapshot] = await Promise.all([
      window.setta.semanticGraph.read({ workspaceId }),
      window.setta.semanticGraph.readActivitySummary({
        recentLimit: semanticGraphActivityLimit,
        workspaceId,
      }),
      loadSemanticRuntimeSnapshot(workspaceId),
    ]);
    return {
      activitiesByNodeId: semanticGraphActivitySummaryMap(activitySummary),
      graph,
      runtimeSnapshot,
      workingSet: semanticWorkingSetFromRuntimeSnapshot(runtimeSnapshot),
    };
  }
  const [activitySummary, runtimeSnapshot] = await Promise.all([
    request.activity
      ? window.setta.semanticGraph.readActivitySummary({
          recentLimit: semanticGraphActivityLimit,
          workspaceId,
        })
      : Promise.resolve(null),
    request.workingSet ? loadSemanticRuntimeSnapshot(workspaceId) : Promise.resolve(null),
  ]);
  if (activitySummary !== null || runtimeSnapshot !== null) {
    return {
      activitiesByNodeId:
        activitySummary === null ? undefined : semanticGraphActivitySummaryMap(activitySummary),
      runtimeSnapshot: runtimeSnapshot === null ? undefined : runtimeSnapshot,
      workingSet:
        runtimeSnapshot === null
          ? undefined
          : semanticWorkingSetFromRuntimeSnapshot(runtimeSnapshot),
    };
  }
  return {};
}

function loadSemanticRuntimeSnapshot(workspaceId: string) {
  return window.setta.semanticGraph.readRuntimeSnapshot({
    chatRunId: "",
    limit: semanticWorkingSetLimit,
    workflowExecutionId: "",
    workspaceId,
  });
}

function semanticGraphChangeHasRuntimeUpdate(event: SemanticGraphChangeEvent) {
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

export function semanticWorkingSetFromRuntimeSnapshot(
  snapshot: SemanticRuntimeSnapshot,
): SemanticWorkingSet {
  const liveSourceRefs = snapshot.displayHints.aggregateSources.map((source) => ({
    changedSemanticEdgeIds: [],
    changedSemanticNodeIds: [],
    diagnostics: [],
    id: source.id,
    patchId: source.patchIds[0] ?? "",
    patchOperationNames: [],
    publicSummary: "",
    runId: source.runIds[0] ?? "",
    sourceRefs: source.sourceRefs,
    status: source.status,
    targetEntityId: source.targetEntityId,
    triggerKind: "manual" as const,
    updatedAt: source.updatedAt,
    windowId: source.windowIds[0] ?? "",
  }));
  const candidateTargets = semanticWorkingSetCandidateTargetsFromRuntime(snapshot);
  const recentSemanticChanges = snapshot.semanticActivity.recentSemanticChanges.map((change) => ({
    changedSemanticEdgeIds: change.changedSemanticEdgeIds,
    changedSemanticNodeIds: change.changedSemanticNodeIds,
    createdSemanticEventIds: change.createdSemanticEventIds,
    diagnostics: [],
    id: change.id,
    patchId: change.patchId,
    patchOperationNames: change.patchOperationNames,
    publicSummary: change.publicSummary,
    runId: change.runId,
    sourceRefs: change.sourceRefs,
    status: change.status,
    targetEntityId: change.targetEntityId,
    triggerKind: change.triggerKind,
    windowId: change.windowId,
    occurredAt: change.occurredAt,
  }));
  return {
    activeCartographerRuns: snapshot.cartographer.activeRuns.map((run) => ({
      changedSemanticEdgeIds: run.changedSemanticEdgeIds,
      changedSemanticNodeIds: run.changedSemanticNodeIds,
      completedAt: run.completedAt,
      createdAt: run.createdAt,
      createdSemanticEventIds: run.createdSemanticEventIds,
      diagnostics: [],
      id: run.id,
      inputItemCounts: run.inputItemCounts,
      patchOperationNames: run.patchOperationNames,
      publicSummary: run.publicSummary,
      sourceRefs: run.sourceRefs,
      startedAt: run.startedAt,
      status: run.status,
      targetEntityId: run.targetEntityId,
      triggerKind: run.triggerKind,
      updatedAt: run.updatedAt,
      windowId: run.windowId,
    })),
    activeCartographerWindows: snapshot.cartographer.activeWindows.map((window) => ({
      changedSemanticEdgeIds: window.changedSemanticEdgeIds,
      changedSemanticNodeIds: window.changedSemanticNodeIds,
      closedAt: window.closedAt,
      diagnostics: [],
      id: window.id,
      inputItemCounts: window.inputItemCounts,
      openedAt: window.openedAt,
      patchOperationNames: window.patchOperationNames,
      publicSummary: window.publicSummary,
      runId: window.runId,
      sourceRefs: window.sourceRefs,
      status: window.status,
      targetEntityId: window.targetEntityId,
      triggerKind: window.triggerKind,
      updatedAt: window.updatedAt,
    })),
    activeRunItemIds: snapshot.workflow.activeRunItemIds,
    activeWorkflowNodeIds: snapshot.workflow.activeWorkflowNodeIds,
    candidateTargets,
    chatRunId: snapshot.chatRunId,
    lastUpdatedAt: semanticRuntimeLastUpdatedAt(snapshot),
    liveSourceRefs,
    pendingPatchPreviews: snapshot.patches.map((preview) => ({
      changedSemanticEdgeIds: preview.changedSemanticEdgeIds,
      changedSemanticNodeIds: preview.changedSemanticNodeIds,
      createdAt: preview.createdAt,
      diagnostics: [],
      id: preview.id,
      newNodes: preview.newNodes,
      operation: preview.operation,
      patchId: preview.patchId,
      patchOperationNames: preview.patchOperationNames,
      publicSummary: preview.publicSummary,
      runId: preview.runId,
      sourceRefs: preview.sourceRefs,
      status: preview.status,
      targetEntityId: preview.targetEntityId,
      triggerKind: preview.triggerKind,
      updatedAt: preview.updatedAt,
      windowId: preview.windowId,
    })),
    pulses: semanticWorkingSetPulsesFromRuntime(snapshot),
    recentCartographerRuns: [],
    recentSemanticChanges,
    workspaceId: snapshot.workspaceId,
    workflowExecutionId: snapshot.workflowExecutionId,
  };
}

function semanticWorkingSetCandidateTargetsFromRuntime(snapshot: SemanticRuntimeSnapshot) {
  const byTarget = new Map<string, SemanticRuntimeCandidateTarget>();
  for (const change of snapshot.semanticActivity.recentSemanticChanges) {
    recordSemanticRuntimeChangeCandidate(byTarget, change);
  }
  for (const source of snapshot.displayHints.aggregateSources) {
    recordSemanticRuntimeAggregateCandidate(byTarget, source);
  }
  return [...byTarget.values()].map((target) => ({
    ...target,
    changedSemanticEdgeIds: uniqueSortedStrings(target.changedSemanticEdgeIds),
    changedSemanticNodeIds: uniqueSortedStrings(target.changedSemanticNodeIds),
    patchIds: uniqueSortedStrings(target.patchIds),
    patchOperationNames: uniqueValues(target.patchOperationNames),
    publicSummaries: uniqueSortedStrings(target.publicSummaries),
    runIds: uniqueSortedStrings(target.runIds),
    windowIds: uniqueSortedStrings(target.windowIds),
  }));
}

type SemanticRuntimeCandidateTarget = SemanticWorkingSet["candidateTargets"][number];
type SemanticRuntimeRecentChange =
  SemanticRuntimeSnapshot["semanticActivity"]["recentSemanticChanges"][number];
type SemanticRuntimeAggregateSource =
  SemanticRuntimeSnapshot["displayHints"]["aggregateSources"][number];

function recordSemanticRuntimeChangeCandidate(
  byTarget: Map<string, SemanticRuntimeCandidateTarget>,
  change: SemanticRuntimeRecentChange,
) {
  if (change.targetEntityId === "") {
    return;
  }
  const target = byTarget.get(change.targetEntityId) ?? semanticRuntimeCandidateFromChange(change);
  target.changedSemanticEdgeIds.push(...change.changedSemanticEdgeIds);
  target.changedSemanticNodeIds.push(...change.changedSemanticNodeIds);
  target.patchIds.push(change.patchId);
  target.patchOperationNames.push(...change.patchOperationNames);
  target.publicSummaries.push(change.publicSummary);
  target.runIds.push(change.runId);
  target.windowIds.push(change.windowId);
  promoteRuntimeCandidateTarget(target, change.status, change.sourceRefs, change.triggerKind);
  if (change.occurredAt > target.updatedAt) {
    target.updatedAt = change.occurredAt;
  }
  byTarget.set(change.targetEntityId, target);
}

function recordSemanticRuntimeAggregateCandidate(
  byTarget: Map<string, SemanticRuntimeCandidateTarget>,
  source: SemanticRuntimeAggregateSource,
) {
  if (source.targetEntityId === "") {
    return;
  }
  const target = byTarget.get(source.targetEntityId) ?? semanticRuntimeCandidateFromSource(source);
  target.runIds.push(...source.runIds);
  target.windowIds.push(...source.windowIds);
  target.patchIds.push(...source.patchIds);
  promoteRuntimeCandidateTarget(target, source.status, source.sourceRefs);
  if (source.updatedAt > target.updatedAt) {
    target.updatedAt = source.updatedAt;
  }
  byTarget.set(source.targetEntityId, target);
}

function semanticRuntimeCandidateFromChange(
  change: SemanticRuntimeRecentChange,
): SemanticRuntimeCandidateTarget {
  return {
    changedSemanticEdgeIds: [],
    changedSemanticNodeIds: [],
    diagnostics: [],
    patchIds: [],
    patchOperationNames: [],
    publicSummaries: [],
    runIds: [],
    sourceRefs: change.sourceRefs,
    status: change.status,
    targetEntityId: change.targetEntityId,
    triggerKind: change.triggerKind,
    updatedAt: change.occurredAt,
    windowIds: [],
  };
}

function semanticRuntimeCandidateFromSource(
  source: SemanticRuntimeAggregateSource,
): SemanticRuntimeCandidateTarget {
  return {
    changedSemanticEdgeIds: [],
    changedSemanticNodeIds: [],
    diagnostics: [],
    patchIds: [],
    patchOperationNames: [],
    publicSummaries: [],
    runIds: [],
    sourceRefs: source.sourceRefs,
    status: source.status,
    targetEntityId: source.targetEntityId,
    triggerKind: "manual" as const,
    updatedAt: source.updatedAt,
    windowIds: [],
  };
}

function promoteRuntimeCandidateTarget(
  target: SemanticRuntimeCandidateTarget,
  status: SemanticWorkingSetStatus,
  sourceRefs: SemanticRuntimeCandidateTarget["sourceRefs"],
  triggerKind?: SemanticRuntimeCandidateTarget["triggerKind"],
) {
  if (semanticWorkingSetStatusRank(status) <= semanticWorkingSetStatusRank(target.status)) {
    return;
  }
  target.status = status;
  target.sourceRefs = sourceRefs;
  if (triggerKind !== undefined) {
    target.triggerKind = triggerKind;
  }
}

function semanticWorkingSetPulsesFromRuntime(
  snapshot: SemanticRuntimeSnapshot,
): SemanticWorkingSet["pulses"] {
  const activeSourcePulses = snapshot.displayHints.aggregateSources.map((source) => ({
    activityKind: semanticGraphActivityKindForWorkingSetStatus(source.status),
    diagnostics: [],
    evidenceAnchorIds: [],
    id: `semantic-runtime-pulse:active:${source.id}`,
    kind: "active_workflow_source" as const,
    patchId: source.patchIds[0] ?? "",
    patchOperationNames: [],
    publicSummary: "",
    runId: source.runIds[0] ?? "",
    semanticEdgeIds: [],
    semanticNodeIds: source.targetEntityId === "" ? [] : [source.targetEntityId],
    sourceRefs: source.sourceRefs,
    status: source.status,
    targetEntityId: source.targetEntityId,
    triggerKind: "manual" as const,
    occurredAt: source.updatedAt,
    updatedAt: source.updatedAt,
    windowId: source.windowIds[0] ?? "",
  }));
  const patchPulses = snapshot.patches.map((patch) => ({
    activityKind: semanticGraphActivityKindForWorkingSetStatus(patch.status),
    diagnostics: [],
    evidenceAnchorIds: [],
    id: `semantic-runtime-pulse:patch:${patch.patchId}`,
    kind: "patch_proposed" as const,
    patchId: patch.patchId,
    patchOperationNames: patch.patchOperationNames,
    publicSummary: patch.publicSummary,
    runId: patch.runId,
    semanticEdgeIds: patch.changedSemanticEdgeIds,
    semanticNodeIds: patch.changedSemanticNodeIds,
    sourceRefs: patch.sourceRefs,
    status: patch.status,
    targetEntityId: patch.targetEntityId,
    triggerKind: patch.triggerKind,
    occurredAt: patch.createdAt,
    updatedAt: patch.updatedAt,
    windowId: patch.windowId,
  }));
  return [...activeSourcePulses, ...patchPulses];
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

function semanticRuntimeLastUpdatedAt(snapshot: SemanticRuntimeSnapshot) {
  return (
    [
      snapshot.generatedAt,
      snapshot.cartographer.updatedAt,
      ...snapshot.cartographer.activeRuns.map((run) => run.updatedAt),
      ...snapshot.cartographer.activeWindows.map((window) => window.updatedAt),
      ...snapshot.patches.map((patch) => patch.updatedAt),
      ...snapshot.semanticActivity.recentSemanticChanges.map((change) => change.occurredAt),
    ].sort((left, right) => right.localeCompare(left))[0] ?? snapshot.generatedAt
  );
}

function semanticGraphActivityKindForWorkingSetStatus(
  status: SemanticWorkingSetStatus,
): SemanticActivityInterval["kind"] {
  switch (status) {
    case "failed":
      return "blocked";
    case "rejected":
    case "superseded":
      return "debugging";
    case "proposing":
    case "applying":
    case "pending_review":
      return "editing";
    case "applied":
    case "noop":
      return "validating";
    default:
      return "exploring";
  }
}

const semanticWorkingSetStatusRanks: Partial<Record<SemanticWorkingSetStatus, number>> = {
  applied: 10,
  applying: 80,
  failed: 90,
  noop: 10,
  observing: 20,
  pending_review: 70,
  proposing: 60,
  queued: 40,
  rejected: 10,
  running: 50,
  superseded: 10,
  window_open: 30,
};

function semanticWorkingSetStatusRank(status: SemanticWorkingSetStatus) {
  return semanticWorkingSetStatusRanks[status] ?? 0;
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

function mergeSemanticGraphRefreshRequests(
  left: SemanticGraphRefreshRequest,
  right: SemanticGraphRefreshRequest,
): SemanticGraphRefreshRequest {
  return {
    activity: left.activity || right.activity,
    graph: left.graph || right.graph,
    workingSet: left.workingSet || right.workingSet,
  };
}

function semanticGraphRefreshRequestIsEmpty(request: SemanticGraphRefreshRequest) {
  return !request.activity && !request.graph && !request.workingSet;
}

function dedupeSemanticActivity(activity: SemanticActivityInterval[]) {
  const seen = new Set<string>();
  const result: SemanticActivityInterval[] = [];
  for (const interval of activity) {
    if (seen.has(interval.id)) {
      continue;
    }
    seen.add(interval.id);
    result.push(interval);
  }
  return result;
}

function semanticGraphLoadingState(workspaceId: string): SemanticGraphState {
  return {
    activitiesByNodeId: new Map(),
    error: "",
    graph: null,
    loading: true,
    noWorkspace: false,
    ready: false,
    workingSet: null,
    workspaceId,
  };
}

function semanticGraphNoWorkspaceState(workspaceId: string): SemanticGraphState {
  return {
    activitiesByNodeId: new Map(),
    error: "",
    graph: null,
    loading: false,
    noWorkspace: workspaceId === "",
    ready: true,
    workingSet: null,
    workspaceId,
  };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Semantic graph load failed";
}
