package semanticgraph

import (
	"context"
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
}
