import type {
  CartographerInputItemCounts,
  CartographerInputTruncation,
  CartographerProcessingState,
  CartographerRun,
  SemanticCartographerSettingsInput,
  SemanticCartographerSettingsRecord,
} from "@generated/backend";
import { describe, expect, test } from "vitest";

import { createCartographerAuditRecordingSnapshot } from "./semantic-cartographer-recording";

describe("semantic cartographer recording snapshots", () => {
  test("captures settings, processing state, run audit, and final synthesis budget summaries", () => {
    const settings = testSettingsRecord();
    const processingState = testProcessingState(settings.settingsHash);
    const compactedRun = testCartographerRun({
      diagnostics: [
        {
          code: "compacted",
          createdAt: "2026-06-15T12:00:04Z",
          id: "diagnostic_compacted",
          message: "Final synthesis input was compacted.",
          patchId: "",
          path: "inputBundle.truncation",
          runId: "cartographer_run_compacted",
          severity: "info",
        },
      ],
      effectiveModel: "gpt-explicit",
      effectiveReasoningEffort: "medium",
      id: "cartographer_run_compacted",
      inputBundleBytes: 7_000,
      inputBundleCharacterCount: 6_500,
      inputItemCounts: testItemCounts({ observations: 4, evidence: 2 }),
      reportedModel: "gpt-5.5",
      requestedInputBudget: 12_000,
      requestedModel: "gpt-explicit",
      requestedModelSelection: "explicit",
      requestedReasoningEffort: "medium",
      status: "applied",
      totalDurationMs: 600,
      triggerKind: "workflow_done",
      truncation: testTruncation({
        deterministicSummary: "Dropped repeated prior-window observations before harness start.",
        droppedItemCounts: testItemCounts({ observations: 18 }),
        foldedWindowCount: 3,
        includedItemCounts: testItemCounts({ observations: 4, evidence: 2 }),
        originalItemCounts: testItemCounts({ observations: 22, evidence: 2 }),
        reasons: ["deduplicated_folded_context", "serialized_budget_compaction"],
        serializedInputBytes: 7_000,
        serializedInputCharacterCount: 6_500,
        summarized: true,
      }),
    });
    const failedRun = testCartographerRun({
      error: "cartographer final synthesis input exceeded configured budget",
      harnessDurationMs: 0,
      id: "cartographer_run_budget_failed",
      status: "failed",
      triggerKind: "workflow_done",
      truncation: testTruncation({
        budgetExceeded: true,
        droppedItemCounts: testItemCounts({ observations: 50 }),
        serializedInputCharacterCount: 14_500,
      }),
    });
    const noopRun = testCartographerRun({
      id: "cartographer_run_noop",
      status: "completed_noop",
      triggerKind: "workflow_window",
    });

    const snapshot = createCartographerAuditRecordingSnapshot({
      capturedAt: "2026-06-15T12:05:00Z",
      processingState,
      recentRuns: [compactedRun, failedRun, noopRun],
      settings,
      trigger: "unit_test",
      workspaceId: "workspace_test",
    });

    expect(snapshot.currentSettings?.settings.finalSynthesisTaskConfig.inputBudget).toBe(12_000);
    expect(snapshot.processingState?.settingsHash).toBe("sha256:settings");
    expect(snapshot.runtimeSummary?.lastFailure?.message).toBe("input_budget_exceeded");
    expect(snapshot.recentFailedNoopAppliedRuns.applied.map((run) => run.runId)).toEqual([
      "cartographer_run_compacted",
    ]);
    expect(snapshot.recentFailedNoopAppliedRuns.failed.map((run) => run.runId)).toEqual([
      "cartographer_run_budget_failed",
    ]);
    expect(snapshot.recentFailedNoopAppliedRuns.noop.map((run) => run.runId)).toEqual([
      "cartographer_run_noop",
    ]);
    expect(snapshot.recentRuns.at(0)).toMatchObject({
      closeReason: "workflow_run_terminal",
      diagnostics: [
        {
          code: "compacted",
          message: "Final synthesis input was compacted.",
          severity: "info",
        },
      ],
      inputBundleBytes: 7_000,
      inputBundleCharacterCount: 6_500,
      inputItemCounts: { evidence: 2, observations: 4 },
      model: {
        display: "gpt-5.5",
        effective: "gpt-explicit",
        reported: "gpt-5.5",
        requested: "gpt-explicit",
        requestedSelection: "explicit",
      },
      reasoning: {
        display: "medium",
        effective: "medium",
        reported: "",
        reportedByProvider: false,
        requested: "medium",
      },
      requestedInputBudget: 12_000,
      truncation: {
        deterministicSummary: "Dropped repeated prior-window observations before harness start.",
        droppedItemCounts: { observations: 18 },
        effectiveBudgetCharacters: 12_000,
        foldedWindowCount: 3,
        serializedInputBytes: 7_000,
        serializedInputCharacterCount: 6_500,
      },
    });
    expect(
      snapshot.recentWorkflowDoneBudgetRuns.map((run) => ({
        outcome: run.outcome,
        preHarnessBudgetFailure: run.preHarnessBudgetFailure,
        runId: run.runId,
      })),
    ).toEqual([
      {
        outcome: "compacted_to_fit",
        preHarnessBudgetFailure: false,
        runId: "cartographer_run_compacted",
      },
      {
        outcome: "input_budget_exceeded",
        preHarnessBudgetFailure: true,
        runId: "cartographer_run_budget_failed",
      },
    ]);
  });
});

interface TestCartographerRunOverrides extends Partial<CartographerRun> {
  truncation?: CartographerInputTruncation;
}

function testCartographerRun(
  overrides: TestCartographerRunOverrides & Pick<CartographerRun, "id" | "status" | "triggerKind">,
): CartographerRun {
  const { truncation, ...runOverrides } = overrides;
  const base = baseCartographerRun(overrides.id, overrides.status, overrides.triggerKind);
  const requestedInputBudget = runOverrides.requestedInputBudget ?? base.requestedInputBudget;
  const harnessDurationMs = runOverrides.harnessDurationMs ?? base.harnessDurationMs;
  return {
    ...base,
    ...runOverrides,
    harnessDurationMs,
    inputBundle: testInputBundle({
      requestedInputBudget,
      triggerKind: runOverrides.triggerKind,
      truncation: truncation ?? base.inputBundle.truncation,
    }),
    requestId: runOverrides.requestId ?? (harnessDurationMs === 0 ? "" : base.requestId),
    requestedInputBudget,
    responseId: runOverrides.responseId ?? (harnessDurationMs === 0 ? "" : base.responseId),
    taskProfile: runOverrides.taskProfile ?? base.taskProfile,
  };
}

function baseCartographerRun(
  id: string,
  status: CartographerRun["status"],
  triggerKind: CartographerRun["triggerKind"],
): CartographerRun {
  return {
    applicationDurationMs: 30,
    attemptCount: 1,
    closeReason: "workflow_run_terminal",
    completedAt: "2026-06-15T12:00:05Z",
    createdAt: "2026-06-15T12:00:00Z",
    createdSemanticEventIds: [],
    diagnostics: [],
    effectiveModel: "",
    effectiveReasoningEffort: "low",
    error: "",
    graphUsefulnessScore: emptyGraphUsefulnessScore(),
    harnessDurationMs: 350,
    harnessKind: "codex_structured_task",
    id,
    inputBundle: testInputBundle({
      requestedInputBudget: 12_000,
      triggerKind,
      truncation: testTruncation(),
    }),
    inputBundleBytes: 2_000,
    inputBundleCharacterCount: 1_800,
    inputBundleHash: "sha256:input",
    inputItemCounts: testItemCounts({ observations: 2 }),
    leaseDeadline: "",
    leaseOwner: "",
    outputSchema: { type: "object" },
    outputSchemaBytes: 512,
    priority: 0,
    queueWaitMs: 120,
    rawHarnessResponseBytes: 900,
    rawHarnessResponseHash: "sha256:response",
    reasoningEffortReported: false,
    reportedModel: "",
    reportedReasoningEffort: "",
    requestId: "request_test",
    requestedInputBudget: 12_000,
    requestedModel: "",
    requestedModelSelection: "provider_default",
    requestedReasoningEffort: "low",
    responseId: "response_test",
    settingsHash: "sha256:settings",
    sourceEpochId: "cartographer_window_test",
    sourceKey: "workflow_execution:workflow_execution_test",
    sourceRefs: sourceRefs(),
    startedAt: "2026-06-15T12:00:01Z",
    status,
    targetEntityId: "",
    taskProfile: triggerKind === "workflow_done" ? "final_synthesis" : "live_window",
    totalDurationMs: 500,
    trajectorySummary: "",
    triggerKind,
    updatedAt: "2026-06-15T12:00:05Z",
    validationDurationMs: 20,
    windowId: "cartographer_window_test",
    workspaceId: "workspace_test",
  };
}

function emptyGraphUsefulnessScore(): CartographerRun["graphUsefulnessScore"] {
  return {
    activityCoveragePercent: 0,
    activityCoveredTargetCount: 0,
    activityTargetCount: 0,
    appliedPatches: 0,
    committedUpdateLatencySampleCount: 0,
    createdEdgesByKind: [],
    createdNodesByKind: [],
    duplicateEvidencePrevented: 0,
    livePulseLatencySampleCount: 0,
    medianSourceEventToCommittedSemanticUpdateMs: 0,
    medianSourceEventToVisibleLivePulseMs: 0,
    noopPatches: 0,
    rejectedPatches: 0,
    sourceLinksBySourceKind: [],
  };
}

function testInputBundle({
  requestedInputBudget,
  triggerKind,
  truncation,
}: {
  requestedInputBudget: number;
  triggerKind: CartographerRun["triggerKind"];
  truncation: CartographerInputTruncation;
}): CartographerRun["inputBundle"] {
  return {
    activity: [],
    assistantResponseSummary: "",
    assistantText: "",
    contextPacks: [],
    evidence: [],
    evidenceCandidates: [],
    existingEdges: [],
    existingNodes: [],
    fileChanges: [],
    newEvents: [],
    observations: [],
    observedEventRefs: [],
    outputSummaries: [],
    promptSummary: "",
    promptText: "",
    retrievalResults: [],
    runStatus: "completed",
    sourceRefs: sourceRefs(),
    steering: [],
    targetEntityId: "",
    terminalReason: "",
    testResults: [],
    tokenBudget: requestedInputBudget,
    toolCalls: [],
    trajectorySummaries: [],
    triggerKind,
    truncation,
    windowEndCursor: windowCursor(),
    windowId: "cartographer_window_test",
    windowStartCursor: windowCursor(),
    workspaceId: "workspace_test",
  };
}

function testTruncation(
  overrides: Partial<CartographerInputTruncation> = {},
): CartographerInputTruncation {
  return {
    budgetExceeded: false,
    deterministicSummary: "",
    droppedItemCounts: testItemCounts(),
    foldedWindowCount: 0,
    includedContentBytes: 1_500,
    includedEventCount: 2,
    includedItemCounts: testItemCounts({ observations: 2 }),
    inputBudgetCharacters: 12_000,
    originalContentBytes: 1_500,
    originalEventCount: 2,
    originalItemCounts: testItemCounts({ observations: 2 }),
    reasons: [],
    segmentCount: 1,
    segmentIndex: 0,
    serializedInputBytes: 2_000,
    serializedInputCharacterCount: 1_800,
    split: false,
    structuredTaskCharacterLimit: 1_048_576,
    summarized: false,
    ...overrides,
  };
}

function testItemCounts(
  overrides: Partial<CartographerInputItemCounts> = {},
): CartographerInputItemCounts {
  return {
    activity: 0,
    contextPacks: 0,
    evidence: 0,
    evidenceCandidates: 0,
    existingEdges: 0,
    existingNodes: 0,
    fileChanges: 0,
    newEvents: 0,
    observations: 0,
    observedEventRefs: 0,
    outputSummaries: 0,
    retrievalResults: 0,
    steering: 0,
    testResults: 0,
    toolCalls: 0,
    trajectorySummaries: 0,
    ...overrides,
  };
}

function testProcessingState(settingsHash: string): CartographerProcessingState {
  return {
    completedNoopRunCount: 1,
    concurrencyGuidance: "Cartographer concurrency is within the configured limits.",
    createdSemanticEventIds: ["semantic_event_test"],
    durableQueuedWindowCount: 0,
    durableRunningWindowCount: 0,
    effectiveProcessingConfig: testSettingsInput().processingConfig,
    enabled: true,
    failedRunCount: 1,
    lastAppliedAt: "2026-06-15T12:00:05Z",
    lastAppliedPatchId: "cartographer_patch_test",
    lastFailure: {
      failedAt: "2026-06-15T12:00:05Z",
      message: "input_budget_exceeded",
      runId: "cartographer_run_budget_failed",
      sourceKey: "workflow_execution:workflow_execution_test",
      windowId: "cartographer_window_test",
      workspaceId: "workspace_test",
    },
    lastFailureRunSummary: null,
    lastNoopAt: "2026-06-15T12:00:06Z",
    lastNoopReason: "cartographer patch envelope proposed no semantic graph mutations",
    lastNoopRunId: "cartographer_run_noop",
    lastProcessedAt: "2026-06-15T12:00:05Z",
    lastProcessedRunId: "cartographer_run_compacted",
    lastProcessedRunSummary: null,
    lastProcessedWindowId: "cartographer_window_test",
    lastProcessedWorkspaceId: "workspace_test",
    lastSupersededAt: "",
    lastSupersededWindowId: "",
    maxConcurrent: 2,
    pendingReviewPatchCount: 0,
    perSourceConcurrent: 1,
    queuedWindowCount: 0,
    queuedWindows: [],
    runningWindowCount: 0,
    runningWindows: [],
    settingsHash,
    staleLeaseCount: 0,
    started: true,
    supersededWindowCount: 0,
  };
}

function testSettingsRecord(): SemanticCartographerSettingsRecord {
  return {
    createdAt: "2026-06-15T12:00:00Z",
    id: "global",
    settings: {
      ...testSettingsInput(),
      schemaVersion: 1,
      updatedAt: "2026-06-15T12:00:00Z",
    },
    settingsHash: "sha256:settings",
    updatedAt: "2026-06-15T12:00:00Z",
  };
}

function testSettingsInput(): SemanticCartographerSettingsInput {
  return {
    auditConfig: { captureLevel: "standard" },
    automaticProcessingEnabled: true,
    finalSynthesisTaskConfig: {
      inputBudget: 12_000,
      modelId: "",
      modelSelection: "provider_default",
      reasoningEffort: "medium",
    },
    liveTaskConfig: {
      inputBudget: 6_000,
      modelId: "",
      modelSelection: "provider_default",
      reasoningEffort: "low",
    },
    observationConfig: {
      assistantThresholdBytes: 4_096,
      maxWindowContentBytes: 8_192,
      maxWindowEvents: 24,
      outputThresholdBytes: 4_096,
      priorSummaryLimit: 8,
      quietCloseAfterSeconds: 120,
      tokenBudget: 6_000,
    },
    processingConfig: {
      leaseDurationSeconds: 600,
      maxConcurrent: 2,
      maxQueuedPerSource: 8,
      perSourceConcurrent: 1,
    },
  };
}

function sourceRefs() {
  return {
    chatConversationId: "",
    chatMessageId: "",
    chatRunId: "",
    runItemId: "",
    workflowDefinitionId: "workflow_definition_test",
    workflowExecutionId: "workflow_execution_test",
    workflowNodeExecutionId: "",
    workflowNodeId: "",
  };
}

function windowCursor() {
  return {
    chatEventSequence: 0,
    chatEventStreamId: "",
    outputOrdinalByRunItem: {},
    workflowEventCursor: "",
  };
}
