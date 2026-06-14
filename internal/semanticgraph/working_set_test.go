package semanticgraph

import (
	"context"
	"testing"
)

func TestServiceReadWorkingSetProjectsLiveCartographerAudit(t *testing.T) {
	ctx := context.Background()
	store := newTestStore(t)
	service := newAssociationTestService(t, store, t.TempDir(), nil, nil)
	sourceRefs := SemanticContextSourceRefs{
		WorkflowExecutionID:     "workflow_execution_working_set",
		WorkflowNodeID:          "workflow_node_working_set",
		WorkflowNodeExecutionID: "workflow_node_execution_working_set",
		ChatRunID:               "chat_run_working_set",
		RunItemID:               "run_item_working_set",
	}
	run := CartographerRun{
		ID:              "cartographer_run_working_set",
		WorkspaceID:     testWorkspaceID,
		Status:          CartographerRunQueued,
		TriggerKind:     CartographerTriggerWorkflowWindow,
		SourceRefs:      sourceRefs,
		InputBundle:     workingSetInputBundle(sourceRefs, ""),
		WindowID:        "cartographer_window_working_set",
		CreatedAt:       testTimestamp(40),
		UpdatedAt:       testTimestamp(40),
		Diagnostics:     []CartographerDiagnostic{},
		InputItemCounts: CartographerInputItemCounts{},
	}
	if _, err := service.SaveCartographerRun(ctx, run); err != nil {
		t.Fatalf("save working-set run: %v", err)
	}
	if _, err := service.SaveCartographerWindow(ctx, CartographerWindow{
		ID:          "cartographer_window_working_set",
		WorkspaceID: testWorkspaceID,
		RunID:       run.ID,
		Status:      CartographerWindowOpen,
		Sequence:    1,
		SourceKind:  CartographerSourceWorkflowExecution,
		SourceID:    "workflow_execution_working_set",
		InputBundle: workingSetInputBundle(sourceRefs, ""),
		OpenedAt:    testTimestamp(41),
		CreatedAt:   testTimestamp(41),
		UpdatedAt:   testTimestamp(41),
	}); err != nil {
		t.Fatalf("save working-set window: %v", err)
	}
	patch := cartographerRecordFindingPatch("cartographer_patch_working_set", "node_working_set_preview", "Working set preview", 0.91)
	patch.SourceRefs = sourceRefs
	patch.Payload.NewNode.EvidenceRefs = []CartographerPatchEvidenceRef{}
	if _, err := service.SaveCartographerPatch(ctx, CartographerPatchRecord{
		WorkspaceID: testWorkspaceID,
		ID:          patch.ID,
		RunID:       run.ID,
		WindowID:    "cartographer_window_working_set",
		Status:      CartographerPatchPendingReview,
		Patch:       patch,
		ValidationResult: CartographerPatchValidationResult{
			PatchID:     patch.ID,
			Accepted:    true,
			Diagnostics: []CartographerDiagnostic{},
			ValidatedAt: testTimestamp(42),
		},
		ApplicationResult: CartographerPatchApplicationResult{
			PatchID:                 patch.ID,
			Applied:                 false,
			CreatedSemanticEventIDs: []string{},
			Diagnostics:             []CartographerDiagnostic{},
		},
		CreatedSemanticEventIDs: []string{},
		CreatedAt:               testTimestamp(42),
		ValidatedAt:             testTimestamp(42),
	}); err != nil {
		t.Fatalf("save working-set patch: %v", err)
	}

	workingSet, err := service.ReadWorkingSet(ctx, SemanticWorkingSetFilter{
		WorkspaceID: testWorkspaceID,
		Limit:       20,
	})
	if err != nil {
		t.Fatalf("read working set: %v", err)
	}

	if !stringSliceContains(workingSet.ActiveWorkflowNodeIDs, "workflow_node_working_set") ||
		!stringSliceContains(workingSet.ActiveRunItemIDs, "run_item_working_set") {
		t.Fatalf("working-set active sources = nodes %+v run items %+v, want workflow/run item source ids", workingSet.ActiveWorkflowNodeIDs, workingSet.ActiveRunItemIDs)
	}
	if len(workingSet.ActiveCartographerWindows) != 1 ||
		workingSet.ActiveCartographerWindows[0].Status != WorkingSetStatusWindowOpen {
		t.Fatalf("active windows = %+v, want one open window", workingSet.ActiveCartographerWindows)
	}
	if len(workingSet.ActiveCartographerRuns) != 1 ||
		workingSet.ActiveCartographerRuns[0].Status != WorkingSetStatusQueued {
		t.Fatalf("active runs = %+v, want one queued run", workingSet.ActiveCartographerRuns)
	}
	if len(workingSet.PendingPatchPreviews) != 1 ||
		workingSet.PendingPatchPreviews[0].NewNodes[0].SemanticNodeID != "node_working_set_preview" ||
		workingSet.PendingPatchPreviews[0].Status != WorkingSetStatusPendingReview {
		t.Fatalf("pending previews = %+v, want pending new-node preview", workingSet.PendingPatchPreviews)
	}
	if len(workingSet.LiveSourceRefs) == 0 {
		t.Fatalf("live source refs = %+v, want source pulses from cartographer audit", workingSet.LiveSourceRefs)
	}
	if !semanticWorkingSetPulsesContain(workingSet.Pulses, WorkingSetPulseActiveWorkflowSource) ||
		!semanticWorkingSetPulsesContain(workingSet.Pulses, WorkingSetPulseCartographerObserving) ||
		!semanticWorkingSetPulsesContain(workingSet.Pulses, WorkingSetPulsePatchProposed) {
		t.Fatalf("working-set pulses = %+v, want active source, observing, and patch proposed pulses", workingSet.Pulses)
	}
}

func workingSetInputBundle(sourceRefs SemanticContextSourceRefs, targetEntityID string) CartographerInputBundle {
	return CartographerInputBundle{
		WorkspaceID:    testWorkspaceID,
		TriggerKind:    CartographerTriggerWorkflowWindow,
		SourceRefs:     sourceRefs,
		TargetEntityID: targetEntityID,
		NewEvents: []CartographerTrajectoryEvent{{
			Source:      CartographerTrajectorySourceWorkflow,
			EventID:     "workflow_events:working_set",
			Type:        "workflow.node.running",
			StreamID:    "workflow_events",
			Sequence:    1,
			OccurredAt:  testTimestamp(39),
			SourceRefs:  sourceRefs,
			RunItemID:   sourceRefs.RunItemID,
			Summary:     "Workflow node activity reached the cartographer.",
			CloseReason: CartographerCloseNone,
		}},
		ObservedEventRefs: []string{"workflow_events:working_set"},
	}
}

func semanticWorkingSetPulsesContain(pulses []SemanticWorkingSetPulse, kind SemanticWorkingSetPulseKind) bool {
	for _, pulse := range pulses {
		if pulse.Kind == kind {
			return true
		}
	}
	return false
}
