import type {
  CartographerDiagnostic,
  CartographerInputItemCounts,
  CartographerInputTruncation,
  CartographerProcessingFailure,
  CartographerProcessingRunAuditSummary,
  CartographerProcessingState,
  CartographerRun,
  CartographerRunStatus,
  CartographerRunTriggerKind,
  CartographerTaskProfile,
  CartographerWindowCloseReason,
  ReasoningEffort,
  SemanticCartographerModelSelection,
  SemanticCartographerProcessingConfig,
  SemanticCartographerSettingsRecord,
} from "@generated/backend";
import { recordingCartographerAuditSnapshotEventName } from "@shared/recording";

type CartographerFinalSynthesisBudgetOutcome =
  | "within_budget"
  | "compacted_to_fit"
  | "input_budget_exceeded"
  | "not_measured";

interface CartographerAuditRecordingSnapshot {
  capturedAt: string;
  currentSettings: SemanticCartographerSettingsRecord | null;
  processingState: CartographerProcessingState | null;
  recentFailedNoopAppliedRuns: {
    applied: CartographerRunAuditRecordingSummary[];
    failed: CartographerRunAuditRecordingSummary[];
    noop: CartographerRunAuditRecordingSummary[];
  };
  recentRuns: CartographerRunAuditRecordingSummary[];
  recentWorkflowDoneBudgetRuns: CartographerFinalSynthesisBudgetRecordingSummary[];
  runtimeSummary: CartographerRuntimeRecordingSummary | null;
  schemaVersion: 1;
  trigger: string;
  workspaceId: string;
}

interface CartographerRuntimeRecordingSummary {
  concurrencyGuidance: string;
  counts: {
    completedNoopRuns: number;
    failedRuns: number;
    pendingReviewPatches: number;
    supersededWindows: number;
  };
  createdSemanticEventIds: string[];
  durable: {
    queuedWindows: number;
    runningWindows: number;
    staleLeases: number;
  };
  effectiveProcessingConfig: SemanticCartographerProcessingConfig;
  enabled: boolean;
  lastApplied: {
    at: string;
    patchId: string;
  };
  lastFailure: CartographerProcessingFailure | null;
  lastFailureRunSummary: CartographerProcessingRunAuditRecordingSummary | null;
  lastNoop: {
    at: string;
    reason: string;
    runId: string;
  };
  lastProcessed: {
    at: string;
    runId: string;
    windowId: string;
    workspaceId: string;
  };
  lastProcessedRunSummary: CartographerProcessingRunAuditRecordingSummary | null;
  lastSuperseded: {
    at: string;
    windowId: string;
  };
  maxConcurrent: number;
  perSourceConcurrent: number;
  queue: {
    queuedWindows: number;
    runningWindows: number;
  };
  settingsHash: string;
  started: boolean;
}

interface CartographerProcessingRunAuditRecordingSummary {
  closeReason: CartographerWindowCloseReason;
  completedAt: string;
  effectiveModel: string;
  effectiveReasoningEffort: string;
  error: string;
  harnessDurationMs: number;
  inputBundleBytes: number;
  inputBundleCharacterCount: number;
  model: CartographerModelAuditRecordingSummary;
  reasoning: CartographerReasoningAuditRecordingSummary;
  reasoningEffortReported: boolean;
  reportedModel: string;
  reportedReasoningEffort: string;
  requestedModel: string;
  requestedModelSelection: SemanticCartographerModelSelection;
  requestedReasoningEffort: ReasoningEffort;
  runId: string;
  status: CartographerRunStatus;
  taskProfile: CartographerTaskProfile;
  totalDurationMs: number;
  windowId: string;
  workspaceId: string;
}

interface CartographerRunAuditRecordingSummary {
  applicationDurationMs: number;
  closeReason: CartographerWindowCloseReason;
  completedAt: string;
  createdAt: string;
  diagnostics: CartographerDiagnosticRecordingSummary[];
  effectiveModel: string;
  effectiveReasoningEffort: string;
  error: string;
  harnessDurationMs: number;
  inputBundleBytes: number;
  inputBundleCharacterCount: number;
  inputItemCounts: CartographerInputItemCounts;
  model: CartographerModelAuditRecordingSummary;
  queueWaitMs: number;
  rawHarnessResponseBytes: number;
  reasoning: CartographerReasoningAuditRecordingSummary;
  reasoningEffortReported: boolean;
  reportedModel: string;
  reportedReasoningEffort: string;
  requestId: string;
  requestedInputBudget: number;
  requestedModel: string;
  requestedModelSelection: SemanticCartographerModelSelection;
  requestedReasoningEffort: ReasoningEffort;
  responseId: string;
  runId: string;
  settingsHash: string;
  sourceEpochId: string;
  sourceKey: string;
  startedAt: string;
  status: CartographerRunStatus;
  taskProfile: CartographerTaskProfile;
  totalDurationMs: number;
  triggerKind: CartographerRunTriggerKind;
  truncation: CartographerInputTruncationRecordingSummary;
  updatedAt: string;
  validationDurationMs: number;
  windowId: string;
  workspaceId: string;
}

interface CartographerModelAuditRecordingSummary {
  display: string;
  effective: string;
  reported: string;
  requested: string;
  requestedSelection: SemanticCartographerModelSelection;
}

interface CartographerReasoningAuditRecordingSummary {
  display: string;
  effective: string;
  reported: string;
  reportedByProvider: boolean;
  requested: ReasoningEffort;
}

interface CartographerDiagnosticRecordingSummary {
  code: string;
  createdAt: string;
  id: string;
  message: string;
  patchId: string;
  path: string;
  severity: CartographerDiagnostic["severity"];
}

interface CartographerInputTruncationRecordingSummary {
  budgetExceeded: boolean;
  codexStructuredTaskCharacterLimit: number;
  deterministicSummary: string;
  droppedItemCounts: CartographerInputItemCounts;
  effectiveBudgetCharacters: number;
  foldedWindowCount: number;
  includedContentBytes: number;
  includedEventCount: number;
  includedItemCounts: CartographerInputItemCounts;
  originalContentBytes: number;
  originalEventCount: number;
  originalItemCounts: CartographerInputItemCounts;
  reasons: string[];
  segmentCount: number;
  segmentIndex: number;
  serializedInputBytes: number;
  serializedInputCharacterCount: number;
  split: boolean;
  summarized: boolean;
}

interface CartographerFinalSynthesisBudgetRecordingSummary {
  applicationDurationMs: number;
  closeReason: CartographerWindowCloseReason;
  diagnostics: CartographerDiagnosticRecordingSummary[];
  droppedItemCount: number;
  error: string;
  harnessDurationMs: number;
  includedItemCount: number;
  inputBundleBytes: number;
  inputBundleCharacterCount: number;
  inputItemCounts: CartographerInputItemCounts;
  model: CartographerModelAuditRecordingSummary;
  outcome: CartographerFinalSynthesisBudgetOutcome;
  preHarnessBudgetFailure: boolean;
  queueWaitMs: number;
  requestedInputBudget: number;
  reasoning: CartographerReasoningAuditRecordingSummary;
  runId: string;
  serializedInputBytes: number;
  serializedInputCharacterCount: number;
  status: CartographerRunStatus;
  structuredTaskCharacterLimit: number;
  totalDurationMs: number;
  triggerKind: CartographerRunTriggerKind;
  truncation: CartographerInputTruncationRecordingSummary;
  validationDurationMs: number;
  windowId: string;
}

const cartographerInputItemCountFields = [
  "newEvents",
  "observations",
  "toolCalls",
  "fileChanges",
  "testResults",
  "outputSummaries",
  "existingNodes",
  "existingEdges",
  "evidence",
  "activity",
  "steering",
  "contextPacks",
  "retrievalResults",
  "trajectorySummaries",
  "observedEventRefs",
] as const satisfies readonly (keyof CartographerInputItemCounts)[];

export function createCartographerAuditRecordingSnapshot({
  capturedAt,
  processingState,
  recentRuns,
  settings,
  trigger,
  workspaceId,
}: {
  capturedAt: string;
  processingState: CartographerProcessingState | null;
  recentRuns: CartographerRun[];
  settings: SemanticCartographerSettingsRecord | null;
  trigger: string;
  workspaceId: string;
}): CartographerAuditRecordingSnapshot {
  const runSummaries = recentRuns.map((run) => summarizeCartographerRunAudit(run));
  return {
    capturedAt,
    currentSettings: settings,
    processingState,
    recentFailedNoopAppliedRuns: {
      applied: runSummaries.filter((run) => run.status === "applied"),
      failed: runSummaries.filter((run) => run.status === "failed"),
      noop: runSummaries.filter((run) => run.status === "completed_noop"),
    },
    recentRuns: runSummaries,
    recentWorkflowDoneBudgetRuns: recentRuns
      .filter((run) => run.triggerKind === "workflow_done")
      .map((run) => summarizeCartographerFinalSynthesisBudget(run)),
    runtimeSummary:
      processingState === null ? null : summarizeCartographerRuntimeState(processingState),
    schemaVersion: 1,
    trigger,
    workspaceId,
  };
}

export function emitCartographerAuditRecordingSnapshot(
  snapshot: CartographerAuditRecordingSnapshot,
) {
  if (
    typeof window === "undefined" ||
    typeof window.dispatchEvent !== "function" ||
    typeof CustomEvent === "undefined"
  ) {
    return;
  }
  window.dispatchEvent(
    new CustomEvent(recordingCartographerAuditSnapshotEventName, {
      detail: {
        snapshot,
        trigger: snapshot.trigger,
        workspaceId: snapshot.workspaceId,
      },
    }),
  );
}

function summarizeCartographerRuntimeState(
  state: CartographerProcessingState,
): CartographerRuntimeRecordingSummary {
  return {
    concurrencyGuidance: state.concurrencyGuidance,
    counts: {
      completedNoopRuns: state.completedNoopRunCount,
      failedRuns: state.failedRunCount,
      pendingReviewPatches: state.pendingReviewPatchCount,
      supersededWindows: state.supersededWindowCount,
    },
    createdSemanticEventIds: state.createdSemanticEventIds,
    durable: {
      queuedWindows: state.durableQueuedWindowCount,
      runningWindows: state.durableRunningWindowCount,
      staleLeases: state.staleLeaseCount,
    },
    effectiveProcessingConfig: state.effectiveProcessingConfig,
    enabled: state.enabled,
    lastApplied: {
      at: state.lastAppliedAt,
      patchId: state.lastAppliedPatchId,
    },
    lastFailure: state.lastFailure,
    lastFailureRunSummary:
      state.lastFailureRunSummary === null
        ? null
        : summarizeCartographerProcessingRunAudit(state.lastFailureRunSummary),
    lastNoop: {
      at: state.lastNoopAt,
      reason: state.lastNoopReason,
      runId: state.lastNoopRunId,
    },
    lastProcessed: {
      at: state.lastProcessedAt,
      runId: state.lastProcessedRunId,
      windowId: state.lastProcessedWindowId,
      workspaceId: state.lastProcessedWorkspaceId,
    },
    lastProcessedRunSummary:
      state.lastProcessedRunSummary === null
        ? null
        : summarizeCartographerProcessingRunAudit(state.lastProcessedRunSummary),
    lastSuperseded: {
      at: state.lastSupersededAt,
      windowId: state.lastSupersededWindowId,
    },
    maxConcurrent: state.maxConcurrent,
    perSourceConcurrent: state.perSourceConcurrent,
    queue: {
      queuedWindows: state.queuedWindowCount,
      runningWindows: state.runningWindowCount,
    },
    settingsHash: state.settingsHash,
    started: state.started,
  };
}

function summarizeCartographerRunAudit(run: CartographerRun): CartographerRunAuditRecordingSummary {
  return {
    applicationDurationMs: run.applicationDurationMs,
    closeReason: run.closeReason,
    completedAt: run.completedAt,
    createdAt: run.createdAt,
    diagnostics: run.diagnostics.map(summarizeCartographerDiagnostic),
    effectiveModel: run.effectiveModel,
    effectiveReasoningEffort: run.effectiveReasoningEffort,
    error: run.error,
    harnessDurationMs: run.harnessDurationMs,
    inputBundleBytes: run.inputBundleBytes,
    inputBundleCharacterCount: run.inputBundleCharacterCount,
    inputItemCounts: run.inputItemCounts,
    model: cartographerModelAuditSummary(run),
    queueWaitMs: run.queueWaitMs,
    rawHarnessResponseBytes: run.rawHarnessResponseBytes,
    reasoning: cartographerReasoningAuditSummary(run),
    reasoningEffortReported: run.reasoningEffortReported,
    reportedModel: run.reportedModel,
    reportedReasoningEffort: run.reportedReasoningEffort,
    requestId: run.requestId,
    requestedInputBudget: run.requestedInputBudget,
    requestedModel: run.requestedModel,
    requestedModelSelection: run.requestedModelSelection,
    requestedReasoningEffort: run.requestedReasoningEffort,
    responseId: run.responseId,
    runId: run.id,
    settingsHash: run.settingsHash,
    sourceEpochId: run.sourceEpochId,
    sourceKey: run.sourceKey,
    startedAt: run.startedAt,
    status: run.status,
    taskProfile: run.taskProfile,
    totalDurationMs: run.totalDurationMs,
    triggerKind: run.triggerKind,
    truncation: summarizeCartographerInputTruncation(run.inputBundle.truncation),
    updatedAt: run.updatedAt,
    validationDurationMs: run.validationDurationMs,
    windowId: run.windowId,
    workspaceId: run.workspaceId,
  };
}

export function summarizeCartographerFinalSynthesisBudget(
  run: CartographerRun,
): CartographerFinalSynthesisBudgetRecordingSummary {
  const truncation = summarizeCartographerInputTruncation(run.inputBundle.truncation);
  return {
    applicationDurationMs: run.applicationDurationMs,
    closeReason: run.closeReason,
    diagnostics: run.diagnostics.map(summarizeCartographerDiagnostic),
    droppedItemCount: sumCartographerInputItemCounts(run.inputBundle.truncation.droppedItemCounts),
    error: run.error,
    harnessDurationMs: run.harnessDurationMs,
    includedItemCount: sumCartographerInputItemCounts(
      run.inputBundle.truncation.includedItemCounts,
    ),
    inputBundleBytes: run.inputBundleBytes,
    inputBundleCharacterCount: run.inputBundleCharacterCount,
    inputItemCounts: run.inputItemCounts,
    model: cartographerModelAuditSummary(run),
    outcome: cartographerFinalSynthesisBudgetOutcome(run),
    preHarnessBudgetFailure:
      run.status === "failed" &&
      run.harnessDurationMs === 0 &&
      run.inputBundle.truncation.budgetExceeded,
    queueWaitMs: run.queueWaitMs,
    requestedInputBudget: run.requestedInputBudget,
    reasoning: cartographerReasoningAuditSummary(run),
    runId: run.id,
    serializedInputBytes: run.inputBundle.truncation.serializedInputBytes,
    serializedInputCharacterCount: run.inputBundle.truncation.serializedInputCharacterCount,
    status: run.status,
    structuredTaskCharacterLimit: run.inputBundle.truncation.structuredTaskCharacterLimit,
    totalDurationMs: run.totalDurationMs,
    triggerKind: run.triggerKind,
    truncation,
    validationDurationMs: run.validationDurationMs,
    windowId: run.windowId,
  };
}

function cartographerFinalSynthesisBudgetOutcome(
  run: CartographerRun,
): CartographerFinalSynthesisBudgetOutcome {
  const truncation = run.inputBundle.truncation;
  if (truncation.budgetExceeded) {
    return "input_budget_exceeded";
  }
  if (truncation.serializedInputCharacterCount <= 0) {
    return "not_measured";
  }
  if (truncation.summarized || sumCartographerInputItemCounts(truncation.droppedItemCounts) > 0) {
    return "compacted_to_fit";
  }
  return "within_budget";
}

export function cartographerRunModelText(
  run: Pick<
    CartographerRun | CartographerProcessingRunAuditSummary,
    "effectiveModel" | "reportedModel" | "requestedModel" | "requestedModelSelection"
  >,
): string {
  return (
    run.reportedModel ||
    run.effectiveModel ||
    run.requestedModel ||
    (run.requestedModelSelection === "provider_default" ? "Provider default" : "Model unset")
  );
}

export function cartographerRunReasoningText(
  run: Pick<
    CartographerRun | CartographerProcessingRunAuditSummary,
    "effectiveReasoningEffort" | "reportedReasoningEffort" | "requestedReasoningEffort"
  >,
): string {
  return (
    run.reportedReasoningEffort || run.effectiveReasoningEffort || run.requestedReasoningEffort
  );
}

export function formatCartographerDuration(value: number): string {
  return value > 0 ? `${value} ms` : "0 ms";
}

export function formatCartographerBytes(value: number): string {
  if (value >= 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (value >= 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  return `${value} B`;
}

export function shortCartographerHash(value: string): string {
  if (value.length <= 18) {
    return value || "none";
  }
  return `${value.slice(0, 15)}...`;
}

function sumCartographerInputItemCounts(counts: CartographerInputItemCounts): number {
  return cartographerInputItemCountFields.reduce((total, field) => total + counts[field], 0);
}

function summarizeCartographerProcessingRunAudit(
  summary: CartographerProcessingRunAuditSummary,
): CartographerProcessingRunAuditRecordingSummary {
  return {
    closeReason: summary.closeReason,
    completedAt: summary.completedAt,
    effectiveModel: summary.effectiveModel,
    effectiveReasoningEffort: summary.effectiveReasoningEffort,
    error: summary.error,
    harnessDurationMs: summary.harnessDurationMs,
    inputBundleBytes: summary.inputBundleBytes,
    inputBundleCharacterCount: summary.inputBundleCharacterCount,
    model: cartographerModelAuditSummary(summary),
    reasoning: cartographerReasoningAuditSummary(summary),
    reasoningEffortReported: summary.reasoningEffortReported,
    reportedModel: summary.reportedModel,
    reportedReasoningEffort: summary.reportedReasoningEffort,
    requestedModel: summary.requestedModel,
    requestedModelSelection: summary.requestedModelSelection,
    requestedReasoningEffort: summary.requestedReasoningEffort,
    runId: summary.runId,
    status: summary.status,
    taskProfile: summary.taskProfile,
    totalDurationMs: summary.totalDurationMs,
    windowId: summary.windowId,
    workspaceId: summary.workspaceId,
  };
}

function cartographerModelAuditSummary(
  run: Pick<
    CartographerRun | CartographerProcessingRunAuditSummary,
    "effectiveModel" | "reportedModel" | "requestedModel" | "requestedModelSelection"
  >,
): CartographerModelAuditRecordingSummary {
  return {
    display: cartographerRunModelText(run),
    effective: run.effectiveModel,
    reported: run.reportedModel,
    requested: run.requestedModel,
    requestedSelection: run.requestedModelSelection,
  };
}

function cartographerReasoningAuditSummary(
  run: Pick<
    CartographerRun | CartographerProcessingRunAuditSummary,
    | "effectiveReasoningEffort"
    | "reasoningEffortReported"
    | "reportedReasoningEffort"
    | "requestedReasoningEffort"
  >,
): CartographerReasoningAuditRecordingSummary {
  return {
    display: cartographerRunReasoningText(run),
    effective: run.effectiveReasoningEffort,
    reported: run.reportedReasoningEffort,
    reportedByProvider: run.reasoningEffortReported,
    requested: run.requestedReasoningEffort,
  };
}

function summarizeCartographerDiagnostic(
  diagnostic: CartographerDiagnostic,
): CartographerDiagnosticRecordingSummary {
  return {
    code: diagnostic.code,
    createdAt: diagnostic.createdAt,
    id: diagnostic.id,
    message: diagnostic.message,
    patchId: diagnostic.patchId,
    path: diagnostic.path,
    severity: diagnostic.severity,
  };
}

function summarizeCartographerInputTruncation(
  truncation: CartographerInputTruncation,
): CartographerInputTruncationRecordingSummary {
  return {
    budgetExceeded: truncation.budgetExceeded,
    codexStructuredTaskCharacterLimit: truncation.structuredTaskCharacterLimit,
    deterministicSummary: truncation.deterministicSummary,
    droppedItemCounts: truncation.droppedItemCounts,
    effectiveBudgetCharacters: truncation.inputBudgetCharacters,
    foldedWindowCount: truncation.foldedWindowCount,
    includedContentBytes: truncation.includedContentBytes,
    includedEventCount: truncation.includedEventCount,
    includedItemCounts: truncation.includedItemCounts,
    originalContentBytes: truncation.originalContentBytes,
    originalEventCount: truncation.originalEventCount,
    originalItemCounts: truncation.originalItemCounts,
    reasons: truncation.reasons,
    segmentCount: truncation.segmentCount,
    segmentIndex: truncation.segmentIndex,
    serializedInputBytes: truncation.serializedInputBytes,
    serializedInputCharacterCount: truncation.serializedInputCharacterCount,
    split: truncation.split,
    summarized: truncation.summarized,
  };
}
