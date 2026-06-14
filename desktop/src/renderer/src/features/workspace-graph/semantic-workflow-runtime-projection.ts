import type {
  SemanticContextSourceRefs,
  SemanticWorkingSet,
  SemanticWorkingSetStatus,
} from "@generated/backend";

import type { WorkflowGraphRuntimeIndicator } from "./pixi-renderer";

const workflowRuntimeDetailLimit = 6;
const semanticWorkingSetStatusPriority = {
  failed: 120,
  applying: 110,
  pending_review: 100,
  proposing: 90,
  running: 80,
  queued: 70,
  window_open: 60,
  observing: 50,
  rejected: 40,
  noop: 30,
  superseded: 20,
  applied: 10,
} as const satisfies Record<SemanticWorkingSetStatus, number>;

interface WorkflowRuntimeAccumulator {
  hiddenSourceCount: number;
  patchIds: Set<string>;
  pulseById: Map<string, WorkflowGraphRuntimeIndicator["recentPulses"][number]>;
  runIds: Set<string>;
  sourceCount: number;
  sourceRefsByKey: Map<string, SemanticContextSourceRefs>;
  statusByValue: Map<SemanticWorkingSetStatus, number>;
  windowIds: Set<string>;
}

interface WorkflowRuntimeContext {
  byWorkflowNodeId: Map<string, WorkflowRuntimeAccumulator>;
  workflowNodeIds: ReadonlySet<string>;
}

interface WorkflowRuntimeSourceRecord {
  patchId: string;
  runId: string;
  sourceRefs: SemanticContextSourceRefs;
  status: SemanticWorkingSetStatus;
  windowId: string;
}

export function semanticWorkflowRuntimeByNodeId({
  semanticWorkingSet,
  workflowNodeIds,
}: {
  semanticWorkingSet: SemanticWorkingSet | null | undefined;
  workflowNodeIds: ReadonlySet<string>;
}): Record<string, WorkflowGraphRuntimeIndicator> {
  if (!semanticWorkingSet || workflowNodeIds.size === 0) {
    return {};
  }
  const context: WorkflowRuntimeContext = {
    byWorkflowNodeId: new Map(),
    workflowNodeIds,
  };
  recordLiveSourceRuntime(context, semanticWorkingSet);
  recordCartographerRunRuntime(context, semanticWorkingSet);
  recordCartographerWindowRuntime(context, semanticWorkingSet);
  recordPatchPreviewRuntime(context, semanticWorkingSet);
  recordCandidateTargetRuntime(context, semanticWorkingSet);
  recordPulseRuntime(context, semanticWorkingSet);
  return workflowRuntimeIndicatorsFromAccumulators(context.byWorkflowNodeId);
}

function recordLiveSourceRuntime(
  context: WorkflowRuntimeContext,
  semanticWorkingSet: SemanticWorkingSet,
) {
  for (const source of semanticWorkingSet.liveSourceRefs) {
    recordWorkflowRuntimeSourceForRefs(context, {
      patchId: source.patchId,
      runId: source.runId,
      sourceRefs: source.sourceRefs,
      status: source.status,
      windowId: source.windowId,
    });
  }
}

function recordCartographerRunRuntime(
  context: WorkflowRuntimeContext,
  semanticWorkingSet: SemanticWorkingSet,
) {
  for (const run of semanticWorkingSet.activeCartographerRuns) {
    recordWorkflowRuntimeSourceForRefs(context, {
      patchId: "",
      runId: run.id,
      sourceRefs: run.sourceRefs,
      status: run.status,
      windowId: run.windowId,
    });
  }
}

function recordCartographerWindowRuntime(
  context: WorkflowRuntimeContext,
  semanticWorkingSet: SemanticWorkingSet,
) {
  for (const window of semanticWorkingSet.activeCartographerWindows) {
    recordWorkflowRuntimeSourceForRefs(context, {
      patchId: "",
      runId: window.runId,
      sourceRefs: window.sourceRefs,
      status: window.status,
      windowId: window.id,
    });
  }
}

function recordPatchPreviewRuntime(
  context: WorkflowRuntimeContext,
  semanticWorkingSet: SemanticWorkingSet,
) {
  for (const preview of semanticWorkingSet.pendingPatchPreviews) {
    recordWorkflowRuntimeSourceForRefs(context, {
      patchId: preview.patchId,
      runId: preview.runId,
      sourceRefs: preview.sourceRefs,
      status: preview.status,
      windowId: preview.windowId,
    });
  }
}

function recordCandidateTargetRuntime(
  context: WorkflowRuntimeContext,
  semanticWorkingSet: SemanticWorkingSet,
) {
  for (const target of semanticWorkingSet.candidateTargets) {
    const accumulator = workflowRuntimeAccumulatorForSourceRefs(context, target.sourceRefs);
    if (!accumulator) {
      continue;
    }
    recordWorkflowRuntimeSource(accumulator, {
      patchId: target.patchIds[0] ?? "",
      runId: target.runIds[0] ?? "",
      sourceRefs: target.sourceRefs,
      status: target.status,
      windowId: target.windowIds[0] ?? "",
    });
    recordNonEmptyStrings(accumulator.runIds, target.runIds);
    recordNonEmptyStrings(accumulator.windowIds, target.windowIds);
    recordNonEmptyStrings(accumulator.patchIds, target.patchIds);
  }
}

function recordPulseRuntime(
  context: WorkflowRuntimeContext,
  semanticWorkingSet: SemanticWorkingSet,
) {
  for (const pulse of semanticWorkingSet.pulses) {
    const accumulator = workflowRuntimeAccumulatorForSourceRefs(context, pulse.sourceRefs);
    if (!accumulator) {
      continue;
    }
    recordWorkflowRuntimeStatus(accumulator, pulse.status);
    recordNonEmptyString(accumulator.runIds, pulse.runId);
    recordNonEmptyString(accumulator.windowIds, pulse.windowId);
    recordNonEmptyString(accumulator.patchIds, pulse.patchId);
    accumulator.pulseById.set(pulse.id, {
      id: pulse.id,
      kind: pulse.kind,
      patchId: pulse.patchId,
      publicSummary: pulse.publicSummary,
      runId: pulse.runId,
      sourceRefs: pulse.sourceRefs,
      status: pulse.status,
      targetEntityId: pulse.targetEntityId,
      windowId: pulse.windowId,
    });
  }
}

function workflowRuntimeIndicatorsFromAccumulators(
  byWorkflowNodeId: ReadonlyMap<string, WorkflowRuntimeAccumulator>,
) {
  return Object.fromEntries(
    [...byWorkflowNodeId.entries()]
      .filter(([, accumulator]) => accumulator.sourceCount > 0 || accumulator.pulseById.size > 0)
      .map(([workflowNodeId, accumulator]) => [
        workflowNodeId,
        workflowRuntimeIndicatorFromAccumulator(accumulator),
      ]),
  );
}

function recordWorkflowRuntimeSourceForRefs(
  context: WorkflowRuntimeContext,
  source: WorkflowRuntimeSourceRecord,
) {
  const accumulator = workflowRuntimeAccumulatorForSourceRefs(context, source.sourceRefs);
  if (!accumulator) {
    return;
  }
  recordWorkflowRuntimeSource(accumulator, source);
}

function workflowRuntimeAccumulatorForSourceRefs(
  context: WorkflowRuntimeContext,
  sourceRefs: SemanticContextSourceRefs,
) {
  const workflowNodeId = workflowRuntimeWorkflowNodeId(sourceRefs, context.workflowNodeIds);
  return workflowNodeId === ""
    ? null
    : workflowRuntimeAccumulatorFor(context.byWorkflowNodeId, workflowNodeId);
}

function workflowRuntimeAccumulatorFor(
  byWorkflowNodeId: Map<string, WorkflowRuntimeAccumulator>,
  workflowNodeId: string,
) {
  const existing = byWorkflowNodeId.get(workflowNodeId);
  if (existing) {
    return existing;
  }
  const accumulator: WorkflowRuntimeAccumulator = {
    hiddenSourceCount: 0,
    patchIds: new Set(),
    pulseById: new Map(),
    runIds: new Set(),
    sourceCount: 0,
    sourceRefsByKey: new Map(),
    statusByValue: new Map(),
    windowIds: new Set(),
  };
  byWorkflowNodeId.set(workflowNodeId, accumulator);
  return accumulator;
}

function recordWorkflowRuntimeSource(
  accumulator: WorkflowRuntimeAccumulator,
  { patchId, runId, sourceRefs, status, windowId }: WorkflowRuntimeSourceRecord,
) {
  accumulator.sourceCount += 1;
  accumulator.sourceRefsByKey.set(workflowRuntimeSourceRefsKey(sourceRefs), sourceRefs);
  recordWorkflowRuntimeStatus(accumulator, status);
  recordNonEmptyString(accumulator.runIds, runId);
  recordNonEmptyString(accumulator.windowIds, windowId);
  recordNonEmptyString(accumulator.patchIds, patchId);
}

function recordWorkflowRuntimeStatus(
  accumulator: WorkflowRuntimeAccumulator,
  status: SemanticWorkingSetStatus,
) {
  accumulator.statusByValue.set(status, (accumulator.statusByValue.get(status) ?? 0) + 1);
}

function workflowRuntimeIndicatorFromAccumulator(
  accumulator: WorkflowRuntimeAccumulator,
): WorkflowGraphRuntimeIndicator {
  const statusCounts = [...accumulator.statusByValue.entries()]
    .map(([status, count]) => ({ count, status }))
    .sort(
      (left, right) =>
        semanticWorkingSetStatusRank(right.status) - semanticWorkingSetStatusRank(left.status),
    );
  const status = statusCounts[0]?.status ?? "observing";
  return {
    hiddenSourceCount: accumulator.hiddenSourceCount,
    patchIds: sortedLimitedStrings(accumulator.patchIds),
    pulseCount: accumulator.pulseById.size,
    recentPulses: [...accumulator.pulseById.values()]
      .sort(
        (left, right) =>
          semanticWorkingSetStatusRank(right.status) - semanticWorkingSetStatusRank(left.status),
      )
      .slice(0, workflowRuntimeDetailLimit),
    runIds: sortedLimitedStrings(accumulator.runIds),
    sourceCount: accumulator.sourceCount,
    sourceRefs: [...accumulator.sourceRefsByKey.values()].slice(0, workflowRuntimeDetailLimit),
    status,
    statusCounts: statusCounts.slice(0, workflowRuntimeDetailLimit),
    windowIds: sortedLimitedStrings(accumulator.windowIds),
  };
}

function workflowRuntimeWorkflowNodeId(
  sourceRefs: SemanticContextSourceRefs,
  workflowNodeIds: ReadonlySet<string>,
) {
  return sourceRefs.workflowNodeId !== "" && workflowNodeIds.has(sourceRefs.workflowNodeId)
    ? sourceRefs.workflowNodeId
    : "";
}

function workflowRuntimeSourceRefsKey(sourceRefs: SemanticContextSourceRefs) {
  return [
    sourceRefs.workflowDefinitionId,
    sourceRefs.workflowExecutionId,
    sourceRefs.workflowNodeId,
    sourceRefs.workflowNodeExecutionId,
    sourceRefs.chatConversationId,
    sourceRefs.chatRunId,
    sourceRefs.chatMessageId,
    sourceRefs.runItemId,
  ].join("\u0000");
}

function recordNonEmptyString(target: Set<string>, value: string) {
  if (value !== "") {
    target.add(value);
  }
}

function recordNonEmptyStrings(target: Set<string>, values: readonly string[]) {
  for (const value of values) {
    recordNonEmptyString(target, value);
  }
}

function sortedLimitedStrings(values: ReadonlySet<string>) {
  return [...values].sort().slice(0, workflowRuntimeDetailLimit);
}

function semanticWorkingSetStatusRank(status: SemanticWorkingSetStatus) {
  return semanticWorkingSetStatusPriority[status];
}
