package semanticgraph

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"setta/internal/chat"
)

func TestServiceReadSemanticRuntimeSnapshotProjectsBoundedCartographerRuntime(t *testing.T) {
	ctx := context.Background()
	service := newAssociationTestService(t, newTestStore(t), t.TempDir(), nil, nil)
	sourceRefs := SemanticContextSourceRefs{
		WorkflowExecutionID:     "workflow_execution_runtime",
		WorkflowNodeID:          "workflow_node_runtime",
		WorkflowNodeExecutionID: "workflow_node_execution_runtime",
		RunItemID:               "run_item_runtime",
	}
	for index := 0; index < 4; index++ {
		suffix := string(rune('a' + index))
		runID := "cartographer_run_runtime_" + suffix
		windowID := "cartographer_window_runtime_" + suffix
		run := CartographerRun{
			ID:                       runID,
			WorkspaceID:              testWorkspaceID,
			Status:                   CartographerRunQueued,
			TriggerKind:              CartographerTriggerWorkflowWindow,
			SourceRefs:               sourceRefs,
			TargetEntityID:           "node_runtime_target",
			InputBundle:              workingSetInputBundle(sourceRefs, "node_runtime_target"),
			WindowID:                 windowID,
			TaskProfile:              CartographerTaskProfileLiveWindow,
			EffectiveModel:           "gpt-runtime-live",
			EffectiveReasoningEffort: string(chat.ReasoningEffortHigh),
			QueueWaitMS:              120,
			HarnessDurationMS:        340,
			TotalDurationMS:          520,
			CreatedAt:                testTimestamp(40 + index),
			UpdatedAt:                testTimestamp(40 + index),
			Diagnostics:              []CartographerDiagnostic{},
			InputItemCounts:          CartographerInputItemCounts{},
		}
		if _, err := service.SaveCartographerRun(ctx, run); err != nil {
			t.Fatalf("save runtime run %d: %v", index, err)
		}
		if _, err := service.SaveCartographerWindow(ctx, CartographerWindow{
			ID:          windowID,
			WorkspaceID: testWorkspaceID,
			RunID:       runID,
			Status:      CartographerWindowOpen,
			Sequence:    index + 1,
			SourceKind:  CartographerSourceWorkflowExecution,
			SourceID:    sourceRefs.WorkflowExecutionID,
			InputBundle: workingSetInputBundle(sourceRefs, "node_runtime_target"),
			OpenedAt:    testTimestamp(50 + index),
			CreatedAt:   testTimestamp(50 + index),
			UpdatedAt:   testTimestamp(50 + index),
		}); err != nil {
			t.Fatalf("save runtime window %d: %v", index, err)
		}
	}
	patch := cartographerRecordFindingPatch("cartographer_patch_runtime", "node_runtime_preview", "Runtime preview", 0.88)
	patch.SourceRefs = sourceRefs
	if _, err := service.SaveCartographerPatch(ctx, CartographerPatchRecord{
		WorkspaceID: testWorkspaceID,
		ID:          patch.ID,
		RunID:       "cartographer_run_runtime_d",
		WindowID:    "cartographer_window_runtime_d",
		Status:      CartographerPatchPendingReview,
		Patch:       patch,
		ValidationResult: CartographerPatchValidationResult{
			PatchID:     patch.ID,
			Accepted:    true,
			Diagnostics: []CartographerDiagnostic{},
			ValidatedAt: testTimestamp(60),
		},
		ApplicationResult: CartographerPatchApplicationResult{
			PatchID:     patch.ID,
			Diagnostics: []CartographerDiagnostic{},
		},
		CreatedAt:   testTimestamp(60),
		ValidatedAt: testTimestamp(60),
	}); err != nil {
		t.Fatalf("save runtime patch: %v", err)
	}

	snapshot, err := service.ReadSemanticRuntimeSnapshot(ctx, SemanticRuntimeFilter{
		WorkspaceID: testWorkspaceID,
		Limit:       2,
	})
	if err != nil {
		t.Fatalf("read semantic runtime snapshot: %v", err)
	}
	if err := assertSemanticRuntimeListBounds(snapshot); err != nil {
		t.Fatal(err)
	}
	if snapshot.Revision == 0 {
		t.Fatalf("runtime revision = 0, want writes to advance revision")
	}
	assertSemanticRuntimeSnapshotPayloadBudget(t, snapshot)
	assertSemanticRuntimeCartographerBounds(t, snapshot)
	assertSemanticRuntimePatchPreview(t, snapshot, patch.ID)
	assertSemanticRuntimeWorkflowSources(t, snapshot, sourceRefs)
	assertSemanticRuntimeAggregateSource(t, snapshot.DisplayHints.AggregateSources, sourceRefs.WorkflowNodeID)
	assertSemanticRuntimeActiveRunModelAudit(t, snapshot.Cartographer.ActiveRuns[0].ModelAudit)
	assertSemanticRuntimeAggregateModelAudit(t, snapshot.DisplayHints.AggregateSources[0].ModelAudit)
}

func assertSemanticRuntimeCartographerBounds(t *testing.T, snapshot SemanticRuntimeSnapshot) {
	t.Helper()
	if len(snapshot.Cartographer.ActiveRuns) != snapshot.Limits.MaxCartographerRuns ||
		len(snapshot.Cartographer.ActiveWindows) != snapshot.Limits.MaxCartographerWindows {
		t.Fatalf("active cartographer runtime = runs %+v windows %+v limits %+v", snapshot.Cartographer.ActiveRuns, snapshot.Cartographer.ActiveWindows, snapshot.Limits)
	}
}

func assertSemanticRuntimePatchPreview(t *testing.T, snapshot SemanticRuntimeSnapshot, patchID string) {
	t.Helper()
	if len(snapshot.Patches) != 1 ||
		snapshot.Patches[0].PatchID != patchID ||
		len(snapshot.Patches[0].NewNodes) != 1 ||
		snapshot.Patches[0].NewNodes[0].SemanticNodeID != "node_runtime_preview" {
		t.Fatalf("patch previews = %+v, want bounded pending runtime preview", snapshot.Patches)
	}
}

func assertSemanticRuntimeWorkflowSources(t *testing.T, snapshot SemanticRuntimeSnapshot, sourceRefs SemanticContextSourceRefs) {
	t.Helper()
	if !stringSliceContains(snapshot.Workflow.ActiveWorkflowNodeIDs, sourceRefs.WorkflowNodeID) ||
		!stringSliceContains(snapshot.Workflow.ActiveRunItemIDs, sourceRefs.RunItemID) {
		t.Fatalf("runtime workflow sources = nodes %+v run items %+v", snapshot.Workflow.ActiveWorkflowNodeIDs, snapshot.Workflow.ActiveRunItemIDs)
	}
}

func assertSemanticRuntimeAggregateSource(t *testing.T, aggregateSources []SemanticRuntimeSourceAggregate, workflowNodeID string) {
	t.Helper()
	if len(aggregateSources) == 0 {
		t.Fatalf("aggregate sources = %+v, want collapsed source counts with typed refs", aggregateSources)
	}
	aggregate := aggregateSources[0]
	if aggregate.TotalCount == 0 ||
		aggregate.SourceRefs.WorkflowNodeID != workflowNodeID {
		t.Fatalf("aggregate sources = %+v, want collapsed source counts with typed refs", aggregateSources)
	}
}

func assertSemanticRuntimeActiveRunModelAudit(t *testing.T, audit *SemanticRuntimeModelAudit) {
	t.Helper()
	if audit == nil {
		t.Fatal("active run model audit = nil, want queued settings snapshot and effective provider audit")
	}
	if audit.RequestedModelSelection != SemanticCartographerModelSelectionProviderDefault ||
		audit.RequestedReasoningEffort != chat.ReasoningEffortLow ||
		audit.EffectiveReasoningEffort != string(chat.ReasoningEffortHigh) {
		t.Fatalf("active run model audit = %+v, want queued settings snapshot and effective provider audit", audit)
	}
}

func assertSemanticRuntimeAggregateModelAudit(t *testing.T, audit *SemanticRuntimeModelAudit) {
	t.Helper()
	if audit == nil {
		t.Fatal("aggregate model audit = nil, want compact workflow-source model audit")
	}
	if audit.EffectiveReasoningEffort != string(chat.ReasoningEffortHigh) {
		t.Fatalf("aggregate model audit = %+v, want compact workflow-source model audit", audit)
	}
}

func TestServiceReadSemanticRuntimeSnapshotKeepsTerminalLifecycleAuditCompact(t *testing.T) {
	ctx := context.Background()
	service := newAssociationTestService(t, newTestStore(t), t.TempDir(), nil, nil)
	sourceRefs := SemanticContextSourceRefs{
		WorkflowExecutionID: "workflow_execution_terminal_runtime",
		WorkflowNodeID:      "workflow_node_terminal_runtime",
		RunItemID:           "run_item_terminal_runtime",
	}
	run := CartographerRun{
		ID:                       "cartographer_run_terminal_runtime",
		WorkspaceID:              testWorkspaceID,
		Status:                   CartographerRunCompletedNoop,
		TriggerKind:              CartographerTriggerWorkflowWindow,
		SourceRefs:               sourceRefs,
		InputBundle:              workingSetInputBundle(sourceRefs, ""),
		TaskProfile:              CartographerTaskProfileLiveWindow,
		RequestedModelSelection:  SemanticCartographerModelSelectionProviderDefault,
		RequestedReasoningEffort: chat.ReasoningEffortLow,
		EffectiveReasoningEffort: string(chat.ReasoningEffortLow),
		QueueWaitMS:              40,
		TotalDurationMS:          75,
		CreatedAt:                testTimestamp(90),
		CompletedAt:              testTimestamp(91),
		UpdatedAt:                testTimestamp(91),
		Diagnostics:              []CartographerDiagnostic{},
	}
	if _, err := service.SaveCartographerRun(ctx, run); err != nil {
		t.Fatalf("save terminal runtime run: %v", err)
	}

	snapshot, err := service.ReadSemanticRuntimeSnapshot(ctx, SemanticRuntimeFilter{
		WorkspaceID: testWorkspaceID,
		Limit:       4,
	})
	if err != nil {
		t.Fatalf("read terminal semantic runtime snapshot: %v", err)
	}
	if len(snapshot.Cartographer.ActiveRuns) != 0 {
		t.Fatalf("active runs = %+v, want terminal no-op kept out of active graph runtime", snapshot.Cartographer.ActiveRuns)
	}
	if len(snapshot.DisplayHints.AggregateSources) != 1 {
		t.Fatalf("aggregate sources = %+v, want one compact lifecycle aggregate", snapshot.DisplayHints.AggregateSources)
	}
	aggregate := snapshot.DisplayHints.AggregateSources[0]
	if aggregate.Status != WorkingSetStatusNoop ||
		aggregate.ModelAudit == nil ||
		aggregate.ModelAudit.RequestedModelSelection != SemanticCartographerModelSelectionProviderDefault ||
		aggregate.ModelAudit.RequestedReasoningEffort != chat.ReasoningEffortLow {
		t.Fatalf("terminal aggregate = %+v, want no-op status with model audit", aggregate)
	}
}

func TestServiceReadSemanticRuntimeSnapshotCapsHotPathPayloadAndLeavesRunDetailsOnDemand(t *testing.T) {
	ctx := context.Background()
	service := newAssociationTestService(t, newTestStore(t), t.TempDir(), nil, nil)
	sourceRefs := SemanticContextSourceRefs{
		WorkflowExecutionID: "workflow_execution_large_runtime",
		WorkflowNodeID:      "workflow_node_large_runtime",
		RunItemID:           "run_item_large_runtime",
	}
	largeSummary := strings.Repeat("runtime summary ", 900)
	largeError := strings.Repeat("provider error ", 500)
	seedLargeSemanticRuntimeRecords(t, ctx, service, sourceRefs, largeSummary, largeError, 36)

	snapshot, err := service.ReadSemanticRuntimeSnapshot(ctx, SemanticRuntimeFilter{
		WorkspaceID: testWorkspaceID,
		Limit:       maxSemanticRuntimeLimit,
	})
	if err != nil {
		t.Fatalf("read large semantic runtime snapshot: %v", err)
	}
	if err := assertSemanticRuntimeListBounds(snapshot); err != nil {
		t.Fatal(err)
	}
	assertSemanticRuntimeSnapshotPayloadBudget(t, snapshot)
	if snapshot.PayloadBudget.TruncatedStringCount == 0 {
		t.Fatalf("snapshot truncated string count = 0, want oversized summaries capped")
	}
	if snapshot.PayloadBudget.ByteSize >= 100_000 {
		t.Fatalf("snapshot payload bytes = %d, want hot path below 100 KB", snapshot.PayloadBudget.ByteSize)
	}
	if snapshot.Cartographer.RecentRunCount != 36 ||
		snapshot.Cartographer.OmittedRecentRunDetailCount != 36 {
		t.Fatalf("snapshot cartographer counts = %+v, want full recent run details omitted from hot path", snapshot.Cartographer)
	}
	assertSemanticRuntimeSnapshotStringsCapped(t, snapshot)

	runList, err := service.ListCartographerRuns(ctx, CartographerRunFilter{
		WorkspaceID: testWorkspaceID,
		Limit:       maxSemanticRuntimeLimit,
	})
	if err != nil {
		t.Fatalf("list cartographer runs for details: %v", err)
	}
	if len(runList.Runs) != 36 {
		t.Fatalf("detail run list length = %d, want full on-demand recent runs", len(runList.Runs))
	}
	readRun, ok, err := service.ReadCartographerRun(ctx, testWorkspaceID, largeRuntimeRunID(0))
	if err != nil {
		t.Fatalf("read cartographer run detail: %v", err)
	}
	if !ok {
		t.Fatal("cartographer run detail missing")
	}
	if readRun.TrajectorySummary != largeSummary || readRun.Error != largeError {
		t.Fatalf("cartographer run detail was truncated: summary bytes %d error bytes %d", len([]byte(readRun.TrajectorySummary)), len([]byte(readRun.Error)))
	}
}

func seedLargeSemanticRuntimeRecords(t *testing.T, ctx context.Context, service *Service, sourceRefs SemanticContextSourceRefs, largeSummary string, largeError string, count int) {
	t.Helper()
	for index := 0; index < count; index++ {
		runID := largeRuntimeRunID(index)
		windowID := largeRuntimeWindowID(index)
		if _, err := service.SaveCartographerRun(ctx, largeRuntimeRun(sourceRefs, largeSummary, largeError, runID, windowID, index)); err != nil {
			t.Fatalf("save large runtime run %d: %v", index, err)
		}
		if _, err := service.SaveCartographerWindow(ctx, largeRuntimeWindow(sourceRefs, runID, windowID, index)); err != nil {
			t.Fatalf("save large runtime window %d: %v", index, err)
		}
		if _, err := service.SaveCartographerPatch(ctx, largeRuntimePatchRecord(sourceRefs, largeSummary, runID, windowID, index)); err != nil {
			t.Fatalf("save large runtime patch %d: %v", index, err)
		}
	}
}

func largeRuntimeRun(sourceRefs SemanticContextSourceRefs, largeSummary string, largeError string, runID string, windowID string, index int) CartographerRun {
	return CartographerRun{
		ID:                       runID,
		WorkspaceID:              testWorkspaceID,
		Status:                   CartographerRunQueued,
		TriggerKind:              CartographerTriggerWorkflowWindow,
		SourceRefs:               sourceRefs,
		TargetEntityID:           "node_large_runtime",
		InputBundle:              workingSetInputBundle(sourceRefs, "node_large_runtime"),
		WindowID:                 windowID,
		TaskProfile:              CartographerTaskProfileLiveWindow,
		EffectiveModel:           strings.Repeat("gpt-runtime-large-", 40),
		EffectiveReasoningEffort: string(chat.ReasoningEffortHigh),
		Error:                    largeError,
		TrajectorySummary:        largeSummary,
		CreatedAt:                testTimestamp(120 + index),
		UpdatedAt:                testTimestamp(120 + index),
		Diagnostics:              []CartographerDiagnostic{},
	}
}

func largeRuntimeWindow(sourceRefs SemanticContextSourceRefs, runID string, windowID string, index int) CartographerWindow {
	return CartographerWindow{
		ID:          windowID,
		WorkspaceID: testWorkspaceID,
		RunID:       runID,
		Status:      CartographerWindowOpen,
		Sequence:    index + 1,
		SourceKind:  CartographerSourceWorkflowExecution,
		SourceID:    sourceRefs.WorkflowExecutionID,
		InputBundle: workingSetInputBundle(sourceRefs, "node_large_runtime"),
		OpenedAt:    testTimestamp(160 + index),
		CreatedAt:   testTimestamp(160 + index),
		UpdatedAt:   testTimestamp(160 + index),
	}
}

func largeRuntimePatchRecord(sourceRefs SemanticContextSourceRefs, largeSummary string, runID string, windowID string, index int) CartographerPatchRecord {
	patch := cartographerRecordFindingPatch(
		"cartographer_patch_large_runtime_"+testSuffix(index),
		"node_large_runtime_preview_"+testSuffix(index),
		"Runtime preview "+testSuffix(index),
		0.88,
	)
	patch.SourceRefs = sourceRefs
	patch.PublicSummary = largeSummary
	return CartographerPatchRecord{
		WorkspaceID: testWorkspaceID,
		ID:          patch.ID,
		RunID:       runID,
		WindowID:    windowID,
		Status:      CartographerPatchPendingReview,
		Patch:       patch,
		ValidationResult: CartographerPatchValidationResult{
			PatchID:     patch.ID,
			Accepted:    true,
			Diagnostics: []CartographerDiagnostic{},
			ValidatedAt: testTimestamp(200 + index),
		},
		ApplicationResult: CartographerPatchApplicationResult{
			PatchID:     patch.ID,
			Diagnostics: []CartographerDiagnostic{},
		},
		CreatedAt:   testTimestamp(200 + index),
		ValidatedAt: testTimestamp(200 + index),
	}
}

func assertSemanticRuntimeSnapshotStringsCapped(t *testing.T, snapshot SemanticRuntimeSnapshot) {
	t.Helper()
	for _, run := range snapshot.Cartographer.ActiveRuns {
		assertMaxByteLength(t, "runtime run public summary", run.PublicSummary, snapshot.Limits.MaxPublicSummaryBytes)
		if run.ModelAudit != nil {
			assertMaxByteLength(t, "runtime model audit effective model", run.ModelAudit.EffectiveModel, snapshot.Limits.MaxModelAuditTextBytes)
			assertMaxByteLength(t, "runtime model audit error", run.ModelAudit.Error, snapshot.Limits.MaxModelAuditErrorBytes)
		}
	}
	for _, preview := range snapshot.Patches {
		assertMaxByteLength(t, "runtime patch public summary", preview.PublicSummary, snapshot.Limits.MaxPublicSummaryBytes)
		for _, node := range preview.NewNodes {
			assertMaxByteLength(t, "runtime preview node label", node.Label, snapshot.Limits.MaxPreviewNodeTextBytes)
			assertMaxByteLength(t, "runtime preview node summary", node.Summary, snapshot.Limits.MaxPreviewNodeTextBytes)
		}
	}
}

func largeRuntimeRunID(index int) string {
	return "cartographer_run_large_runtime_" + testSuffix(index)
}

func largeRuntimeWindowID(index int) string {
	return "cartographer_window_large_runtime_" + testSuffix(index)
}

func TestServicePublishesSemanticRuntimeDeltaRevisions(t *testing.T) {
	ctx := context.Background()
	service := newNotificationTestService(t)
	subscription := subscribeSemanticGraphChangesForTest(t, service, SemanticGraphChangeCursor{})
	defer subscription.Unsubscribe()
	sourceRefs := SemanticContextSourceRefs{
		WorkflowExecutionID: "workflow_execution_runtime_delta",
		WorkflowNodeID:      "workflow_node_runtime_delta",
		RunItemID:           "run_item_runtime_delta",
	}
	run := CartographerRun{
		ID:             "cartographer_run_runtime_delta",
		WorkspaceID:    testWorkspaceID,
		Status:         CartographerRunQueued,
		TriggerKind:    CartographerTriggerWorkflowWindow,
		SourceRefs:     sourceRefs,
		TargetEntityID: "node_runtime_delta",
		InputBundle:    workingSetInputBundle(sourceRefs, "node_runtime_delta"),
		CreatedAt:      testTimestamp(80),
		UpdatedAt:      testTimestamp(80),
	}
	if _, err := service.SaveCartographerRun(ctx, run); err != nil {
		t.Fatalf("save runtime delta run: %v", err)
	}
	runEvent := receiveSemanticGraphChange(t, subscription)
	if runEvent.SemanticRuntimeRevision != 1 ||
		runEvent.SemanticRuntimeSnapshotRequired ||
		runEvent.SemanticRuntimeDelta == nil ||
		runEvent.SemanticRuntimeDelta.FromRevision != 0 ||
		runEvent.SemanticRuntimeDelta.ToRevision != 1 ||
		len(runEvent.SemanticRuntimeDelta.CartographerRunUpdates) != 1 ||
		runEvent.SemanticRuntimeDelta.CartographerRunUpdates[0].ID != run.ID {
		t.Fatalf("run semantic runtime event = %+v", runEvent)
	}
	assertSemanticRuntimeDeltaPayloadBudgetForTest(t, *runEvent.SemanticRuntimeDelta)
	patch := cartographerRecordFindingPatch("cartographer_patch_runtime_delta", "node_runtime_delta_preview", "Runtime delta preview", 0.82)
	patch.SourceRefs = sourceRefs
	if _, err := service.SaveCartographerPatch(ctx, CartographerPatchRecord{
		WorkspaceID: testWorkspaceID,
		ID:          patch.ID,
		RunID:       run.ID,
		Status:      CartographerPatchPendingReview,
		Patch:       patch,
		ValidationResult: CartographerPatchValidationResult{
			PatchID:     patch.ID,
			Accepted:    true,
			Diagnostics: []CartographerDiagnostic{},
			ValidatedAt: testTimestamp(81),
		},
		ApplicationResult: CartographerPatchApplicationResult{
			PatchID:     patch.ID,
			Diagnostics: []CartographerDiagnostic{},
		},
		CreatedAt:   testTimestamp(81),
		ValidatedAt: testTimestamp(81),
	}); err != nil {
		t.Fatalf("save runtime delta patch: %v", err)
	}
	patchEvent := receiveSemanticGraphChange(t, subscription)
	if patchEvent.SemanticRuntimeRevision != 2 ||
		patchEvent.SemanticRuntimeSnapshotRequired ||
		patchEvent.SemanticRuntimeDelta == nil ||
		patchEvent.SemanticRuntimeDelta.FromRevision != 1 ||
		patchEvent.SemanticRuntimeDelta.ToRevision != 2 ||
		len(patchEvent.SemanticRuntimeDelta.PatchPreviewUpdates) != 1 ||
		patchEvent.SemanticRuntimeDelta.PatchPreviewUpdates[0].PatchID != patch.ID {
		t.Fatalf("patch semantic runtime event = %+v", patchEvent)
	}
	assertSemanticRuntimeDeltaPayloadBudgetForTest(t, *patchEvent.SemanticRuntimeDelta)
}

func TestServicePublishesSemanticRuntimeDeltaWithPayloadBudget(t *testing.T) {
	ctx := context.Background()
	service := newNotificationTestService(t)
	subscription := subscribeSemanticGraphChangesForTest(t, service, SemanticGraphChangeCursor{})
	defer subscription.Unsubscribe()
	sourceRefs := SemanticContextSourceRefs{
		WorkflowExecutionID: "workflow_execution_runtime_delta_budget",
		WorkflowNodeID:      "workflow_node_runtime_delta_budget",
		RunItemID:           "run_item_runtime_delta_budget",
	}
	run := CartographerRun{
		ID:                       "cartographer_run_runtime_delta_budget",
		WorkspaceID:              testWorkspaceID,
		Status:                   CartographerRunQueued,
		TriggerKind:              CartographerTriggerWorkflowWindow,
		SourceRefs:               sourceRefs,
		TargetEntityID:           "node_runtime_delta_budget",
		InputBundle:              workingSetInputBundle(sourceRefs, "node_runtime_delta_budget"),
		WindowID:                 "cartographer_window_runtime_delta_budget",
		TaskProfile:              CartographerTaskProfileLiveWindow,
		EffectiveModel:           strings.Repeat("gpt-runtime-delta-budget-", 40),
		EffectiveReasoningEffort: string(chat.ReasoningEffortHigh),
		Error:                    strings.Repeat("runtime delta provider error ", 600),
		TrajectorySummary:        strings.Repeat("runtime delta summary ", 900),
		CreatedAt:                testTimestamp(260),
		UpdatedAt:                testTimestamp(260),
	}
	if _, err := service.SaveCartographerRun(ctx, run); err != nil {
		t.Fatalf("save runtime delta budget run: %v", err)
	}
	event := receiveSemanticGraphChange(t, subscription)
	if event.SemanticRuntimeDelta == nil {
		t.Fatalf("runtime delta budget event = %+v, want delta", event)
	}
	delta := *event.SemanticRuntimeDelta
	assertSemanticRuntimeDeltaPayloadBudgetForTest(t, delta)
	if delta.PayloadBudget.TruncatedStringCount == 0 {
		t.Fatalf("delta truncated string count = 0, want oversized runtime summary capped")
	}
	if len(delta.CartographerRunUpdates) != 1 {
		t.Fatalf("delta run updates = %+v, want one run", delta.CartographerRunUpdates)
	}
	update := delta.CartographerRunUpdates[0]
	assertMaxByteLength(t, "delta run public summary", update.PublicSummary, semanticRuntimeMaxPublicSummaryBytes)
	if update.ModelAudit == nil {
		t.Fatal("delta model audit = nil, want compact audit")
	}
	assertMaxByteLength(t, "delta model audit effective model", update.ModelAudit.EffectiveModel, semanticRuntimeMaxModelAuditTextBytes)
	assertMaxByteLength(t, "delta model audit error", update.ModelAudit.Error, semanticRuntimeMaxModelAuditErrorBytes)
}

func assertSemanticRuntimeSnapshotPayloadBudget(t *testing.T, snapshot SemanticRuntimeSnapshot) {
	t.Helper()
	if snapshot.PayloadBudget.ByteSize <= 0 {
		t.Fatalf("snapshot payload byte size = %d, want measured payload", snapshot.PayloadBudget.ByteSize)
	}
	if snapshot.PayloadBudget.MaxByteSize != semanticRuntimeMaxSnapshotPayloadBytes {
		t.Fatalf("snapshot max payload bytes = %d, want %d", snapshot.PayloadBudget.MaxByteSize, semanticRuntimeMaxSnapshotPayloadBytes)
	}
	if snapshot.PayloadBudget.ByteSize > snapshot.PayloadBudget.MaxByteSize {
		t.Fatalf("snapshot payload bytes = %d, budget %d", snapshot.PayloadBudget.ByteSize, snapshot.PayloadBudget.MaxByteSize)
	}
	payload, err := json.Marshal(snapshot)
	if err != nil {
		t.Fatalf("marshal snapshot: %v", err)
	}
	if snapshot.PayloadBudget.ByteSize != len(payload) {
		t.Fatalf("snapshot payload byte size = %d, actual %d", snapshot.PayloadBudget.ByteSize, len(payload))
	}
}

func assertSemanticRuntimeDeltaPayloadBudgetForTest(t *testing.T, delta SemanticRuntimeDelta) {
	t.Helper()
	if err := assertSemanticRuntimeDeltaPayloadBudget(delta); err != nil {
		t.Fatal(err)
	}
	if delta.PayloadBudget.ByteSize <= 0 {
		t.Fatalf("delta payload byte size = %d, want measured payload", delta.PayloadBudget.ByteSize)
	}
	if delta.PayloadBudget.MaxByteSize != semanticRuntimeMaxDeltaPayloadBytes {
		t.Fatalf("delta max payload bytes = %d, want %d", delta.PayloadBudget.MaxByteSize, semanticRuntimeMaxDeltaPayloadBytes)
	}
	payload, err := json.Marshal(delta)
	if err != nil {
		t.Fatalf("marshal delta: %v", err)
	}
	if delta.PayloadBudget.ByteSize != len(payload) {
		t.Fatalf("delta payload byte size = %d, actual %d", delta.PayloadBudget.ByteSize, len(payload))
	}
}

func assertMaxByteLength(t *testing.T, label string, value string, maxBytes int) {
	t.Helper()
	if len([]byte(value)) > maxBytes {
		t.Fatalf("%s byte length = %d, want <= %d", label, len([]byte(value)), maxBytes)
	}
}

func testSuffix(index int) string {
	return strings.ReplaceAll(testTimestamp(index), ":", "_")
}
