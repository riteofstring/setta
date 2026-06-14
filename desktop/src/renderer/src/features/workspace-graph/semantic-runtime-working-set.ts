import type {
  SemanticActivityInterval,
  SemanticRuntimeSnapshot,
  SemanticWorkingSet,
  SemanticWorkingSetStatus,
} from "@generated/backend";

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

function uniqueSortedStrings(values: readonly string[]) {
  return uniqueValues(values.filter((value) => value !== "")).sort();
}

function uniqueValues<T extends string>(values: readonly T[]) {
  return [...new Set(values.filter((value) => value !== ""))];
}
