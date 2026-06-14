package semanticgraph

import (
	"context"
	"fmt"
)

func (service *Service) BuildCartographerWindow(ctx context.Context, request CartographerManualWindowRequest) (CartographerWindowBuildResult, error) {
	window, err := service.BuildManualCartographerWindow(ctx, request)
	if err != nil {
		return CartographerWindowBuildResult{}, err
	}
	run, ok, err := service.ReadCartographerRun(ctx, window.WorkspaceID, window.RunID)
	if err != nil {
		return CartographerWindowBuildResult{}, err
	}
	if !ok {
		return CartographerWindowBuildResult{}, fmt.Errorf("cartographer run %s was not found for window %s", window.RunID, window.ID)
	}
	var summary *CartographerTrajectorySummary
	if window.SummaryID != "" {
		readSummary, ok, err := service.ReadCartographerTrajectorySummary(ctx, window.WorkspaceID, window.SummaryID)
		if err != nil {
			return CartographerWindowBuildResult{}, err
		}
		if ok {
			summary = &readSummary
		}
	}
	return CartographerWindowBuildResult{Run: run, Window: window, Summary: summary}, nil
}

func (service *Service) ListCartographerRuns(ctx context.Context, filter CartographerRunFilter) (CartographerRunList, error) {
	if _, err := service.resolveWorkspace(filter.WorkspaceID); err != nil {
		return CartographerRunList{}, err
	}
	return service.store.ListCartographerRuns(ctx, filter)
}

func (service *Service) ListCartographerWindows(ctx context.Context, filter CartographerWindowFilter) (CartographerWindowList, error) {
	if _, err := service.resolveWorkspace(filter.WorkspaceID); err != nil {
		return CartographerWindowList{}, err
	}
	return service.store.ListCartographerWindows(ctx, filter)
}

func (service *Service) ListCartographerCursors(ctx context.Context, filter CartographerCursorFilter) (CartographerCursorList, error) {
	if _, err := service.resolveWorkspace(filter.WorkspaceID); err != nil {
		return CartographerCursorList{}, err
	}
	return service.store.ListCartographerCursors(ctx, filter)
}

func (service *Service) ListCartographerPatches(ctx context.Context, filter CartographerPatchFilter) (CartographerPatchList, error) {
	if _, err := service.resolveWorkspace(filter.WorkspaceID); err != nil {
		return CartographerPatchList{}, err
	}
	return service.store.ListCartographerPatches(ctx, filter)
}

func (service *Service) AcceptCartographerPatch(ctx context.Context, workspaceID string, patchID string) (CartographerPatchReviewResult, error) {
	patch, run, err := service.pendingCartographerPatchForReview(ctx, workspaceID, patchID)
	if err != nil {
		return CartographerPatchReviewResult{}, err
	}
	now := timestamp(service.now())
	input := cartographerPatchReviewApplicationInput(run, patch)
	newNodeIDs := collectCartographerEnvelopeNewNodeIDs(CartographerPatchEnvelope{Patches: []CartographerPatch{patch.Patch}})
	edgeConnectedNodeIDs := collectCartographerEnvelopeEdgeConnectedNodeIDs(CartographerPatchEnvelope{Patches: []CartographerPatch{patch.Patch}})
	diagnostics := service.validateCartographerPatch(ctx, input, patch.Patch, newNodeIDs, edgeConnectedNodeIDs, 0, now)
	if len(diagnostics) > 0 {
		patch.Status = CartographerPatchRejected
		patch.ValidatedAt = now
		patch.ValidationResult = CartographerPatchValidationResult{
			PatchID:     patch.ID,
			Accepted:    false,
			Diagnostics: diagnostics,
			ValidatedAt: now,
		}
		patch.ApplicationResult = CartographerPatchApplicationResult{
			PatchID:                 patch.ID,
			Applied:                 false,
			CreatedSemanticEventIDs: []string{},
			Diagnostics:             []CartographerDiagnostic{},
		}
		return service.saveCartographerPatchReview(ctx, run, patch, nil, now)
	}

	events, err := service.cartographerSemanticEventsForPatch(ctx, workspaceID, SemanticAttachmentActor{
		ActorKind: ActorKindCartographer,
		ActorID:   run.ID,
	}, patch.Patch)
	if err != nil {
		patch.Status = CartographerPatchRejected
		patch.ApplicationResult = CartographerPatchApplicationResult{
			PatchID:                 patch.ID,
			Applied:                 false,
			CreatedSemanticEventIDs: []string{},
			Diagnostics: []CartographerDiagnostic{
				service.newCartographerDiagnostic(run.ID, patch.ID, CartographerDiagnosticError, "application_failed", err.Error(), "$.patches[0]", now),
			},
		}
		return service.saveCartographerPatchReview(ctx, run, patch, nil, now)
	}
	for index := range events {
		service.decorateCartographerSemanticEvent(&events[index], input, patch.Patch, now)
	}
	if err := service.assignCartographerEventIDs(events); err != nil {
		return CartographerPatchReviewResult{}, err
	}
	eventIDs := semanticEventIDs(events)
	patch.Status = CartographerPatchApplied
	patch.ValidatedAt = now
	patch.AppliedAt = now
	patch.ValidationResult = CartographerPatchValidationResult{
		PatchID:     patch.ID,
		Accepted:    true,
		Diagnostics: []CartographerDiagnostic{},
		ValidatedAt: now,
	}
	patch.ApplicationResult = CartographerPatchApplicationResult{
		PatchID:                 patch.ID,
		Applied:                 true,
		CreatedSemanticEventIDs: eventIDs,
		Diagnostics:             []CartographerDiagnostic{},
		AppliedAt:               now,
	}
	patch.CreatedSemanticEventIDs = eventIDs
	return service.saveCartographerPatchReview(ctx, run, patch, events, now)
}

func (service *Service) RejectCartographerPatch(ctx context.Context, workspaceID string, patchID string) (CartographerPatchReviewResult, error) {
	patch, run, err := service.pendingCartographerPatchForReview(ctx, workspaceID, patchID)
	if err != nil {
		return CartographerPatchReviewResult{}, err
	}
	now := timestamp(service.now())
	patch.Status = CartographerPatchRejected
	patch.ApplicationResult = CartographerPatchApplicationResult{
		PatchID:                 patch.ID,
		Applied:                 false,
		CreatedSemanticEventIDs: []string{},
		Diagnostics: []CartographerDiagnostic{
			service.newCartographerDiagnostic(run.ID, patch.ID, CartographerDiagnosticInfo, "review_rejected", "cartographer patch was rejected during review", "$", now),
		},
	}
	return service.saveCartographerPatchReview(ctx, run, patch, nil, now)
}

func (service *Service) pendingCartographerPatchForReview(ctx context.Context, workspaceID string, patchID string) (CartographerPatchRecord, CartographerRun, error) {
	if _, err := service.resolveWorkspace(workspaceID); err != nil {
		return CartographerPatchRecord{}, CartographerRun{}, err
	}
	patch, ok, err := service.store.ReadCartographerPatch(ctx, workspaceID, patchID)
	if err != nil {
		return CartographerPatchRecord{}, CartographerRun{}, err
	}
	if !ok {
		return CartographerPatchRecord{}, CartographerRun{}, fmt.Errorf("cartographer patch %s was not found", patchID)
	}
	if patch.Status != CartographerPatchPendingReview {
		return CartographerPatchRecord{}, CartographerRun{}, fmt.Errorf("cartographer patch %s has status %s, want pending_review", patchID, patch.Status)
	}
	run, ok, err := service.store.ReadCartographerRun(ctx, workspaceID, patch.RunID)
	if err != nil {
		return CartographerPatchRecord{}, CartographerRun{}, err
	}
	if !ok {
		return CartographerPatchRecord{}, CartographerRun{}, fmt.Errorf("cartographer run %s was not found for patch %s", patch.RunID, patch.ID)
	}
	return patch, run, nil
}

func cartographerPatchReviewApplicationInput(run CartographerRun, patch CartographerPatchRecord) CartographerPatchEnvelopeApplicationInput {
	return CartographerPatchEnvelopeApplicationInput{
		WorkspaceID:       run.WorkspaceID,
		RunID:             run.ID,
		WindowID:          patch.WindowID,
		TriggerKind:       run.TriggerKind,
		TargetEntityID:    run.TargetEntityID,
		SourceRefs:        run.SourceRefs,
		InputBundle:       run.InputBundle,
		HarnessKind:       run.HarnessKind,
		EffectiveModel:    run.EffectiveModel,
		ReportedModel:     run.ReportedModel,
		RequestID:         run.RequestID,
		ResponseID:        run.ResponseID,
		SourceEpochID:     run.SourceEpochID,
		SourceKey:         run.SourceKey,
		Priority:          run.Priority,
		AttemptCount:      run.AttemptCount,
		TrajectorySummary: run.TrajectorySummary,
	}
}

func (service *Service) saveCartographerPatchReview(ctx context.Context, run CartographerRun, patch CartographerPatchRecord, events []SemanticEvent, now string) (CartographerPatchReviewResult, error) {
	patches, err := service.store.ListCartographerPatches(ctx, CartographerPatchFilter{
		WorkspaceID: run.WorkspaceID,
		RunID:       run.ID,
		Limit:       defaultSemanticPageLimit,
	})
	if err != nil {
		return CartographerPatchReviewResult{}, err
	}
	records := replaceCartographerPatchRecord(patches.Patches, patch)
	run.Status = cartographerRunStatusForPatchRecords(records)
	run.CreatedSemanticEventIDs = createdSemanticEventIDsFromCartographerPatches(records)
	run.UpdatedAt = now
	if run.Status != CartographerRunRejected {
		run.Error = ""
	} else if run.Error == "" {
		run.Error = "cartographer patch review rejected all proposed mutations"
	}
	appended, err := service.store.SaveCartographerRunPatchesAndAppendEvents(ctx, run, []CartographerPatchRecord{patch}, events)
	if err != nil {
		return CartographerPatchReviewResult{}, err
	}
	service.publishSemanticGraphChangeForEvents(appended, cartographerPatchApplicationChangeDraft(run.WorkspaceID, run, []CartographerPatchRecord{patch}))
	nodeDetail, err := service.nodeDetailForCartographerPatchReview(ctx, run.WorkspaceID, patch)
	if err != nil {
		return CartographerPatchReviewResult{}, err
	}
	return CartographerPatchReviewResult{
		Run:        run,
		Patch:      patch,
		Events:     appended,
		NodeDetail: nodeDetail,
	}, nil
}

func replaceCartographerPatchRecord(records []CartographerPatchRecord, replacement CartographerPatchRecord) []CartographerPatchRecord {
	replaced := false
	result := make([]CartographerPatchRecord, 0, len(records)+1)
	for _, record := range records {
		if record.ID == replacement.ID {
			result = append(result, replacement)
			replaced = true
			continue
		}
		result = append(result, record)
	}
	if !replaced {
		result = append(result, replacement)
	}
	return result
}

func createdSemanticEventIDsFromCartographerPatches(records []CartographerPatchRecord) []string {
	ids := []string{}
	for _, record := range records {
		ids = append(ids, record.CreatedSemanticEventIDs...)
	}
	return ids
}

func (service *Service) nodeDetailForCartographerPatchReview(ctx context.Context, workspaceID string, patch CartographerPatchRecord) (*SemanticNodeDetail, error) {
	targetID := cartographerPatchPrimarySemanticTargetID(patch.Patch)
	if targetID == "" {
		return nil, nil
	}
	detail, ok, err := service.ReadNodeDetail(ctx, workspaceID, targetID)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, nil
	}
	return &detail, nil
}

func cartographerPatchPrimarySemanticTargetID(patch CartographerPatch) string {
	payload := patch.Payload
	if payload.NewNode != nil {
		return payload.NewNode.SemanticNodeID
	}
	if payload.SemanticNodeID != "" {
		return payload.SemanticNodeID
	}
	if payload.TargetEntityID != "" {
		return payload.TargetEntityID
	}
	if payload.TargetNode != nil {
		return payload.TargetNode.SemanticNodeID
	}
	if len(payload.NewNodes) > 0 {
		return payload.NewNodes[0].SemanticNodeID
	}
	if payload.SourceNodeID != "" {
		return payload.SourceNodeID
	}
	if len(payload.SourceNodeIDs) > 0 {
		return payload.SourceNodeIDs[0]
	}
	return ""
}
