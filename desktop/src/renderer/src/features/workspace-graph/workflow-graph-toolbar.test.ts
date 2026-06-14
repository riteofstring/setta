import { describe, expect, test } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type {
  CartographerProcessingState,
  CartographerRun,
  SemanticCartographerSettingsRecord,
  WorkflowGraphProjection,
} from "@generated/backend";
import {
  WorkflowGraphToolbar,
  workflowToolbarMismatchLabel,
  workflowToolbarStateLabel,
  workflowToolbarVersionLabel,
} from "./workflow-graph-toolbar";
import {
  CartographerHealthState,
  WorkflowGraphToolbarLayer,
} from "./workflow-graph-surface-layers";

describe("workflow graph toolbar state labels", () => {
  test("names editable draft state explicitly", () => {
    const projection = workflowProjection({ viewMode: "draft" });

    expect(workflowToolbarStateLabel(projection, true, "workspace_test")).toBe("Draft editable");
    expect(workflowToolbarVersionLabel(projection)).toBe("");
    expect(workflowToolbarMismatchLabel(projection)).toBe("");
  });

  test("names selected run and immutable version explicitly", () => {
    const projection = workflowProjection({ viewMode: "run" });

    expect(workflowToolbarStateLabel(projection, true, "workspace_test")).toBe(
      "Run completed read-only",
    );
    expect(workflowToolbarVersionLabel(projection)).toBe(
      "run workflow_e...on_run / v3 workflow_v...on_003",
    );
  });

  test("marks run projections whose selected version differs from the current draft", () => {
    const projection = workflowProjection({ versionMismatch: true, viewMode: "run" });

    expect(workflowToolbarMismatchLabel(projection)).toBe(
      "Current draft differs from this version",
    );
  });

  test("names read-only version snapshots without a selected run", () => {
    const projection = workflowProjection({
      executionId: "",
      executionStatus: null,
      viewMode: "version",
    });

    expect(workflowToolbarStateLabel(projection, true, "workspace_test")).toBe(
      "Version snapshot read-only",
    );
    expect(workflowToolbarVersionLabel(projection)).toBe("v3 workflow_v...on_003");
  });

  test("keeps async operation status separate from visible command labels", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowGraphToolbar, {
        busy: "validate",
        onAddNode: () => undefined,
        onOpenDetails: () => undefined,
        onOpenSettings: () => undefined,
        onRun: () => undefined,
        onShowDraft: () => undefined,
        onValidate: () => undefined,
        projection: workflowProjection({ viewMode: "draft" }),
        ready: true,
        selectedNodeLabel: "",
        validation: null,
        workspaceId: "workspace_test",
      }),
    );

    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain('aria-label="Validate"');
    expect(html).toContain(">Validate</span>");
    expect(html).not.toContain("Validating workflow");
    expect(html).not.toContain(">Validating</span>");
  });

  test("keeps validated status visible from projection validation state", () => {
    const validation = { diagnostics: [], valid: true };
    const html = renderToStaticMarkup(
      createElement(WorkflowGraphToolbar, {
        busy: null,
        onAddNode: () => undefined,
        onOpenDetails: () => undefined,
        onOpenSettings: () => undefined,
        onRun: () => undefined,
        onShowDraft: () => undefined,
        onValidate: () => undefined,
        projection: workflowProjection({
          validation: workflowValidationState(validation),
          viewMode: "draft",
        }),
        ready: true,
        selectedNodeLabel: "",
        validation,
        workspaceId: "workspace_test",
      }),
    );

    expect(html).toContain(">Validated</span>");
    expect(html).toContain('aria-label="Workflow validated"');
  });

  test("names the visible details command for the selected graph node", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowGraphToolbar, {
        busy: null,
        onAddNode: () => undefined,
        onOpenDetails: () => undefined,
        onOpenSettings: () => undefined,
        onRun: () => undefined,
        onShowDraft: () => undefined,
        onValidate: () => undefined,
        projection: workflowProjection({ viewMode: "run" }),
        ready: true,
        selectedNodeLabel: "Semantic API contract",
        validation: null,
        workspaceId: "workspace_test",
      }),
    );

    expect(html).toContain('aria-label="Open details for Semantic API contract"');
    expect(html).toContain(">Semantic API contract</span>");
  });

  test("renders cartographer health diagnostics when graph debug is enabled", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowGraphToolbarLayer, {
        addWorkflowDraftNodeFromToolbar: async () => undefined,
        debugEnabled: true,
        openGraphNodeDetails: () => undefined,
        openWorkflowSettings: () => undefined,
        runWorkflowDraft: async () => undefined,
        selectedGraphNodeId: null,
        selectedGraphNodeLabel: "",
        showDraftWorkflow: async () => undefined,
        syntheticGraph: null,
        validateWorkflowDraft: async () => null,
        workflowOperation: null,
        workflowProjection: workflowProjection({ viewMode: "draft" }),
        workflowProjectionReady: true,
        workflowValidation: null,
        workflowWorkspaceId: "workspace_test",
      }),
    );

    expect(html).toContain('data-testid="cartographer-health-panel"');
    expect(html).toContain("Cartographer Health");
  });

  test("renders final synthesis budget diagnostics in cartographer health state", () => {
    const html = renderToStaticMarkup(
      createElement(CartographerHealthState, {
        data: {
          processingState: cartographerProcessingState(),
          recentRuns: [cartographerWorkflowDoneRun()],
          settings: { settingsHash: "sha256:settings" } as SemanticCartographerSettingsRecord,
        },
      }),
    );

    expect(html).toContain("Final Synthesis Budget");
    expect(html).toContain("compacted to fit");
    expect(html).toContain("gpt-5.5 / medium");
    expect(html).toContain("6,500/12,000");
    expect(html).toContain("Dropped repeated prior-window observations before harness start.");
  });
});

function workflowProjection(
  overrides: Partial<WorkflowGraphProjection> = {},
): WorkflowGraphProjection {
  const viewMode = overrides.viewMode ?? "run";
  const versionMismatch = overrides.versionMismatch === true;
  return {
    definitionDescription: "",
    definitionId: "workflow_definition",
    definitionName: "Review workflow",
    ...workflowProjectionDefaultsByViewMode[viewMode],
    draftMatchesVersion: !versionMismatch,
    draftRevision: "sha256:draft",
    draftUpdatedAt: "2026-06-08T12:10:00Z",
    edges: [],
    layout: { nodes: [] },
    nodes: [],
    schemaVersion: 1,
    terminalReason: null,
    updatedAt: "2026-06-08T12:15:00Z",
    validation: workflowValidationState(null),
    versionMismatch,
    viewMode,
    workspaceId: "workspace_test",
    ...overrides,
  };
}

const workflowProjectionDefaultsByViewMode = {
  draft: {
    definitionVersionCreatedAt: "",
    definitionVersionId: "",
    definitionVersionNumber: 0,
    editable: true,
    executionId: "",
    executionStatus: null,
    lastEventOrdinal: 0,
  },
  run: {
    definitionVersionCreatedAt: "2026-06-08T12:00:00Z",
    definitionVersionId: "workflow_version_003",
    definitionVersionNumber: 3,
    editable: false,
    executionId: "workflow_execution_run",
    executionStatus: "completed",
    lastEventOrdinal: 7,
  },
  version: {
    definitionVersionCreatedAt: "2026-06-08T12:00:00Z",
    definitionVersionId: "workflow_version_003",
    definitionVersionNumber: 3,
    editable: false,
    executionId: "",
    executionStatus: null,
    lastEventOrdinal: 0,
  },
} satisfies Record<
  WorkflowGraphProjection["viewMode"],
  Pick<
    WorkflowGraphProjection,
    | "definitionVersionCreatedAt"
    | "definitionVersionId"
    | "definitionVersionNumber"
    | "editable"
    | "executionId"
    | "executionStatus"
    | "lastEventOrdinal"
  >
>;

function workflowValidationState(
  result: NonNullable<WorkflowGraphProjection["validation"]["snapshot"]>["result"] | null,
) {
  return {
    currentDraftRevision: "sha256:draft",
    currentGraphFingerprint: "sha256:graph",
    currentValidatorFingerprint: "workflow-validator:v1",
    snapshot:
      result === null
        ? null
        : {
            definitionId: "workflow_definition",
            graphFingerprint: "sha256:graph",
            result,
            schemaVersion: 1,
            validatedAt: "2026-06-08T12:16:00Z",
            validatorFingerprint: "workflow-validator:v1",
            workspaceId: "workspace_test",
          },
    status: result === null ? "not_validated" : "current",
  } satisfies WorkflowGraphProjection["validation"];
}

function cartographerProcessingState(): CartographerProcessingState {
  return {
    completedNoopRunCount: 0,
    concurrencyGuidance: "Cartographer concurrency is within configured limits.",
    createdSemanticEventIds: [],
    durableQueuedWindowCount: 0,
    durableRunningWindowCount: 0,
    effectiveProcessingConfig: {
      leaseDurationSeconds: 600,
      maxConcurrent: 2,
      maxQueuedPerSource: 8,
      perSourceConcurrent: 1,
    },
    enabled: true,
    failedRunCount: 0,
    lastAppliedAt: "",
    lastAppliedPatchId: "",
    lastFailure: null,
    lastFailureRunSummary: null,
    lastNoopAt: "",
    lastNoopReason: "",
    lastNoopRunId: "",
    lastProcessedAt: "2026-06-15T12:00:05Z",
    lastProcessedRunId: "cartographer_run_budget",
    lastProcessedRunSummary: null,
    lastProcessedWindowId: "cartographer_window_budget",
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
    settingsHash: "sha256:settings",
    staleLeaseCount: 0,
    started: true,
    supersededWindowCount: 0,
  };
}

function cartographerWorkflowDoneRun(): CartographerRun {
  return {
    applicationDurationMs: 10,
    attemptCount: 1,
    closeReason: "workflow_run_terminal",
    completedAt: "2026-06-15T12:00:05Z",
    createdAt: "2026-06-15T12:00:00Z",
    createdSemanticEventIds: [],
    diagnostics: [],
    effectiveModel: "gpt-explicit",
    effectiveReasoningEffort: "medium",
    error: "",
    harnessDurationMs: 350,
    harnessKind: "codex_structured_task",
    id: "cartographer_run_budget",
    inputBundle: {
      activity: [],
      assistantResponseSummary: "",
      assistantText: "",
      contextPacks: [],
      evidence: [],
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
      sourceRefs: cartographerSourceRefs(),
      steering: [],
      targetEntityId: "",
      terminalReason: "",
      testResults: [],
      tokenBudget: 12000,
      toolCalls: [],
      trajectorySummaries: [],
      triggerKind: "workflow_done",
      truncation: {
        budgetExceeded: false,
        deterministicSummary: "Dropped repeated prior-window observations before harness start.",
        droppedItemCounts: cartographerInputItemCounts({ observations: 12 }),
        foldedWindowCount: 3,
        includedContentBytes: 6000,
        includedEventCount: 4,
        includedItemCounts: cartographerInputItemCounts({ evidence: 2, observations: 4 }),
        inputBudgetCharacters: 12000,
        originalContentBytes: 18000,
        originalEventCount: 16,
        originalItemCounts: cartographerInputItemCounts({ evidence: 2, observations: 16 }),
        reasons: ["serialized_budget_compaction"],
        segmentCount: 1,
        segmentIndex: 0,
        serializedInputBytes: 7000,
        serializedInputCharacterCount: 6500,
        split: false,
        structuredTaskCharacterLimit: 1048576,
        summarized: true,
      },
      windowEndCursor: cartographerWindowCursor(),
      windowId: "cartographer_window_budget",
      windowStartCursor: cartographerWindowCursor(),
      workspaceId: "workspace_test",
    },
    inputBundleBytes: 7000,
    inputBundleCharacterCount: 6500,
    inputBundleHash: "sha256:input",
    inputItemCounts: cartographerInputItemCounts({ evidence: 2, observations: 4 }),
    leaseDeadline: "",
    leaseOwner: "",
    outputSchema: {},
    outputSchemaBytes: 512,
    priority: 0,
    queueWaitMs: 120,
    rawHarnessResponseBytes: 1024,
    rawHarnessResponseHash: "sha256:response",
    reasoningEffortReported: false,
    reportedModel: "gpt-5.5",
    reportedReasoningEffort: "",
    requestId: "request_budget",
    requestedInputBudget: 12000,
    requestedModel: "gpt-explicit",
    requestedModelSelection: "explicit",
    requestedReasoningEffort: "medium",
    responseId: "response_budget",
    settingsHash: "sha256:settings",
    sourceEpochId: "cartographer_window_budget",
    sourceKey: "workflow_execution:workflow_execution_test",
    sourceRefs: cartographerSourceRefs(),
    startedAt: "2026-06-15T12:00:01Z",
    status: "applied",
    targetEntityId: "",
    taskProfile: "final_synthesis",
    totalDurationMs: 600,
    trajectorySummary: "",
    triggerKind: "workflow_done",
    updatedAt: "2026-06-15T12:00:05Z",
    validationDurationMs: 20,
    windowId: "cartographer_window_budget",
    workspaceId: "workspace_test",
  };
}

function cartographerInputItemCounts(
  overrides: Partial<CartographerRun["inputItemCounts"]> = {},
): CartographerRun["inputItemCounts"] {
  return {
    activity: 0,
    contextPacks: 0,
    evidence: 0,
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

function cartographerSourceRefs() {
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

function cartographerWindowCursor() {
  return {
    chatEventSequence: 0,
    chatEventStreamId: "",
    outputOrdinalByRunItem: {},
    workflowEventCursor: "",
  };
}
