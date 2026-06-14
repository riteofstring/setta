package semanticgraph

import "context"

func (service *Service) cartographerRunAuditFromPatchInput(ctx context.Context, input CartographerPatchEnvelopeApplicationInput, now string) (CartographerRun, error) {
	bundle := input.InputBundle
	bundle.WorkspaceID = input.WorkspaceID
	run, err := service.cartographerRunAuditBase(ctx, input, now)
	if err != nil {
		return CartographerRun{}, err
	}
	applyCartographerPatchInputRunAudit(&run, input, bundle, now)
	if !cartographerRunSettingsSnapshotComplete(run) {
		if err := service.applyCartographerRunSettingsSnapshot(ctx, &run, false); err != nil {
			return CartographerRun{}, err
		}
	}
	return run, nil
}

func (service *Service) cartographerRunAuditBase(ctx context.Context, input CartographerPatchEnvelopeApplicationInput, now string) (CartographerRun, error) {
	run, ok, err := service.store.ReadCartographerRun(ctx, input.WorkspaceID, input.RunID)
	if err != nil {
		return CartographerRun{}, err
	}
	if ok {
		return run, nil
	}
	return CartographerRun{
		ID:          input.RunID,
		WorkspaceID: input.WorkspaceID,
		CreatedAt:   now,
		StartedAt:   now,
	}, nil
}

func applyCartographerPatchInputRunAudit(run *CartographerRun, input CartographerPatchEnvelopeApplicationInput, bundle CartographerInputBundle, now string) {
	run.Status = CartographerRunPendingReview
	run.TriggerKind = input.TriggerKind
	run.TargetEntityID = input.TargetEntityID
	run.SourceRefs = input.SourceRefs
	run.InputBundle = bundle
	run.OutputSchema = DefaultCartographerPatchEnvelopeSchema()
	applyCartographerPatchInputHarnessAudit(run, input)
	applyCartographerPatchInputQueueAudit(run, input)
	run.TrajectorySummary = input.TrajectorySummary
	run.CreatedSemanticEventIDs = []string{}
	run.Diagnostics = []CartographerDiagnostic{}
	completeCartographerPatchInputRunAudit(run, now)
}

func applyCartographerPatchInputHarnessAudit(run *CartographerRun, input CartographerPatchEnvelopeApplicationInput) {
	if input.HarnessKind != "" {
		run.HarnessKind = input.HarnessKind
	}
	applyCartographerAuditString(&run.EffectiveModel, input.EffectiveModel)
	applyCartographerAuditString(&run.ReportedModel, input.ReportedModel)
	applyCartographerAuditString(&run.EffectiveReasoningEffort, input.EffectiveReasoningEffort)
	applyCartographerAuditString(&run.ReportedReasoningEffort, input.ReportedReasoningEffort)
	run.ReasoningEffortReported = run.ReasoningEffortReported || input.ReasoningEffortReported
	applyNonEmptyCartographerAuditString(&run.RequestID, input.RequestID)
	applyNonEmptyCartographerAuditString(&run.ResponseID, input.ResponseID)
	if len(input.RawHarnessResponse) > 0 {
		run.RawHarnessResponseHash = hashBytes(input.RawHarnessResponse)
		run.RawHarnessResponseBytes = len([]byte(input.RawHarnessResponse))
	}
	if input.HarnessDurationMS > 0 {
		run.HarnessDurationMS = input.HarnessDurationMS
	}
}

func applyCartographerAuditString(target *string, value string) {
	if value != "" || *target == "" {
		*target = value
	}
}

func applyNonEmptyCartographerAuditString(target *string, value string) {
	if value != "" {
		*target = value
	}
}

func applyCartographerPatchInputQueueAudit(run *CartographerRun, input CartographerPatchEnvelopeApplicationInput) {
	run.WindowID = input.WindowID
	run.SourceEpochID = input.SourceEpochID
	run.SourceKey = input.SourceKey
	run.Priority = input.Priority
	run.AttemptCount = input.AttemptCount
}

func completeCartographerPatchInputRunAudit(run *CartographerRun, now string) {
	if run.CreatedAt == "" {
		run.CreatedAt = now
	}
	if run.StartedAt == "" {
		run.StartedAt = now
	}
	run.CompletedAt = now
	run.UpdatedAt = now
	run.Error = ""
}
