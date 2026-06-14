package semanticgraph

import (
	"context"
	"testing"
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
			ID:              runID,
			WorkspaceID:     testWorkspaceID,
			Status:          CartographerRunQueued,
			TriggerKind:     CartographerTriggerWorkflowWindow,
			SourceRefs:      sourceRefs,
			TargetEntityID:  "node_runtime_target",
			InputBundle:     workingSetInputBundle(sourceRefs, "node_runtime_target"),
			WindowID:        windowID,
			CreatedAt:       testTimestamp(40 + index),
			UpdatedAt:       testTimestamp(40 + index),
			Diagnostics:     []CartographerDiagnostic{},
			InputItemCounts: CartographerInputItemCounts{},
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
	if len(snapshot.Cartographer.ActiveRuns) != snapshot.Limits.MaxCartographerRuns ||
		len(snapshot.Cartographer.ActiveWindows) != snapshot.Limits.MaxCartographerWindows {
		t.Fatalf("active cartographer runtime = runs %+v windows %+v limits %+v", snapshot.Cartographer.ActiveRuns, snapshot.Cartographer.ActiveWindows, snapshot.Limits)
	}
	if len(snapshot.Patches) != 1 ||
		snapshot.Patches[0].PatchID != patch.ID ||
		snapshot.Patches[0].NewNodes[0].SemanticNodeID != "node_runtime_preview" {
		t.Fatalf("patch previews = %+v, want bounded pending runtime preview", snapshot.Patches)
	}
	if !stringSliceContains(snapshot.Workflow.ActiveWorkflowNodeIDs, sourceRefs.WorkflowNodeID) ||
		!stringSliceContains(snapshot.Workflow.ActiveRunItemIDs, sourceRefs.RunItemID) {
		t.Fatalf("runtime workflow sources = nodes %+v run items %+v", snapshot.Workflow.ActiveWorkflowNodeIDs, snapshot.Workflow.ActiveRunItemIDs)
	}
	if len(snapshot.DisplayHints.AggregateSources) == 0 ||
		snapshot.DisplayHints.AggregateSources[0].TotalCount == 0 ||
		snapshot.DisplayHints.AggregateSources[0].SourceRefs.WorkflowNodeID != sourceRefs.WorkflowNodeID {
		t.Fatalf("aggregate sources = %+v, want collapsed source counts with typed refs", snapshot.DisplayHints.AggregateSources)
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
