package semanticgraph

import (
	"context"
	"errors"
	"fmt"

	"setta/internal/workspace"
)

type cartographerWindowProcessingOptions struct {
	AutoApplyValidatedPatches bool
	LeaseOwner                string
	LeaseDeadline             string
}

func (service *Service) ProcessCartographerWindow(ctx context.Context, workspaceID string, windowID string) (CartographerWindowProcessResult, error) {
	return service.processCartographerWindow(ctx, workspaceID, windowID, cartographerWindowProcessingOptions{})
}

func (service *Service) processCartographerWindow(ctx context.Context, workspaceID string, windowID string, options cartographerWindowProcessingOptions) (CartographerWindowProcessResult, error) {
	workspaceSummary, window, run, err := service.beginCartographerWindowProcessing(ctx, workspaceID, windowID, options)
	if err != nil {
		return CartographerWindowProcessResult{}, err
	}

	applicationInput := service.cartographerApplicationInputForWindow(run, window)
	applicationInput.AutoApplyValidatedPatches = options.AutoApplyValidatedPatches
	if service.cartographerHarness == nil {
		applicationInput.HarnessError = "semantic cartographer harness task runner is not configured"
	} else {
		taskID, err := service.newID("cartographer_task")
		if err != nil {
			return CartographerWindowProcessResult{}, fmt.Errorf("create cartographer task id: %w", err)
		}
		harnessResult, err := service.cartographerHarness.RunRaw(ctx, CartographerHarnessTask{
			ID:           taskID,
			Workspace:    workspaceSummary,
			InputBundle:  window.InputBundle,
			OutputSchema: CartographerPatchEnvelopeSchema(run.OutputSchema),
			Model:        run.Model,
		})
		if err != nil {
			if ctx.Err() != nil {
				cancelled, cancelErr := service.cancelCartographerWindowProcessing(context.WithoutCancel(ctx), run, window, ctx.Err().Error())
				if cancelErr != nil {
					return CartographerWindowProcessResult{}, cancelErr
				}
				return cancelled, nil
			}
			applicationInput.HarnessError = err.Error()
		} else {
			applicationInput.RawHarnessResponse = harnessResult.PatchEnvelope
			applicationInput.HarnessKind = string(harnessResult.Audit.HarnessKind)
			applicationInput.Model = harnessResult.Audit.Model
			applicationInput.RequestID = harnessResult.Audit.RequestID
			applicationInput.ResponseID = harnessResult.Audit.ResponseID
		}
	}

	applied, err := service.ApplyCartographerPatchEnvelope(ctx, applicationInput)
	if err != nil {
		return CartographerWindowProcessResult{}, err
	}
	processed, err := service.markCartographerWindowProcessed(ctx, window)
	if err != nil {
		return CartographerWindowProcessResult{}, err
	}
	return CartographerWindowProcessResult{
		Run:     applied.Run,
		Window:  processed,
		Patches: applied.Patches,
		Events:  applied.Events,
	}, nil
}

func (service *Service) beginCartographerWindowProcessing(ctx context.Context, workspaceID string, windowID string, options cartographerWindowProcessingOptions) (workspaceSummary workspace.WorkspaceSummary, window CartographerWindow, run CartographerRun, err error) {
	if ctx == nil {
		err = errors.New("context is required")
		return
	}
	if err = validateStoreIDs("workspace id", workspaceID, "cartographer window id", windowID); err != nil {
		return
	}
	workspaceSummary, err = service.resolveWorkspace(workspaceID)
	if err != nil {
		return
	}

	service.cartographerMu.Lock()
	defer service.cartographerMu.Unlock()

	window, err = service.readClosedCartographerWindow(ctx, workspaceID, windowID)
	if err != nil {
		return
	}
	run, err = service.readProcessableCartographerRun(ctx, workspaceID, window)
	if err != nil {
		return
	}
	window.InputBundle.WindowID = window.ID
	run, err = service.saveStartedCartographerRun(ctx, run, window, options)
	if err != nil {
		return
	}
	return
}

func (service *Service) readClosedCartographerWindow(ctx context.Context, workspaceID string, windowID string) (CartographerWindow, error) {
	window, ok, err := service.store.ReadCartographerWindow(ctx, workspaceID, windowID)
	if err != nil {
		return CartographerWindow{}, err
	}
	if !ok {
		return CartographerWindow{}, fmt.Errorf("cartographer window %s was not found", windowID)
	}
	if window.Status != CartographerWindowClosed {
		return CartographerWindow{}, fmt.Errorf("cartographer window %s has status %s, want closed", windowID, window.Status)
	}
	return window, nil
}

func (service *Service) readProcessableCartographerRun(ctx context.Context, workspaceID string, window CartographerWindow) (CartographerRun, error) {
	run, ok, err := service.store.ReadCartographerRun(ctx, workspaceID, window.RunID)
	if err != nil {
		return CartographerRun{}, err
	}
	if !ok {
		return CartographerRun{}, fmt.Errorf("cartographer run %s was not found for window %s", window.RunID, window.ID)
	}
	if run.Status != CartographerRunQueued {
		return CartographerRun{}, fmt.Errorf("cartographer run %s has status %s, want queued", run.ID, run.Status)
	}
	return run, nil
}

func (service *Service) saveStartedCartographerRun(ctx context.Context, run CartographerRun, window CartographerWindow, options cartographerWindowProcessingOptions) (CartographerRun, error) {
	now := timestamp(service.now())
	run.Status = CartographerRunRunning
	run.WindowID = window.ID
	run.SourceEpochID = firstNonEmpty(run.SourceEpochID, window.ID)
	run.SourceKey = firstNonEmpty(run.SourceKey, cartographerProcessingSourceKey(window))
	run.Priority = cartographerQueuePriority(run.TriggerKind)
	run.LeaseOwner = options.LeaseOwner
	run.LeaseDeadline = options.LeaseDeadline
	run.AttemptCount++
	run.InputBundle = window.InputBundle
	run.OutputSchema = DefaultCartographerPatchEnvelopeSchema()
	run.HarnessKind = string(service.cartographerHarnessKind)
	if run.StartedAt == "" {
		run.StartedAt = now
	}
	run.UpdatedAt = now
	run.Error = ""
	return service.SaveCartographerRun(ctx, run)
}

func (service *Service) cartographerApplicationInputForWindow(run CartographerRun, window CartographerWindow) CartographerPatchEnvelopeApplicationInput {
	return CartographerPatchEnvelopeApplicationInput{
		WorkspaceID:       run.WorkspaceID,
		RunID:             run.ID,
		WindowID:          window.ID,
		TriggerKind:       run.TriggerKind,
		TargetEntityID:    run.TargetEntityID,
		SourceRefs:        run.SourceRefs,
		InputBundle:       window.InputBundle,
		HarnessKind:       run.HarnessKind,
		Model:             run.Model,
		SourceEpochID:     run.SourceEpochID,
		SourceKey:         run.SourceKey,
		Priority:          run.Priority,
		AttemptCount:      run.AttemptCount,
		TrajectorySummary: cartographerTrajectorySummaryText(window.InputBundle),
	}
}

func (service *Service) markCartographerWindowProcessed(ctx context.Context, window CartographerWindow) (CartographerWindow, error) {
	service.cartographerMu.Lock()
	defer service.cartographerMu.Unlock()

	window.Status = CartographerWindowProcessed
	window.UpdatedAt = timestamp(service.now())
	return service.SaveCartographerWindow(ctx, window)
}

func (service *Service) cancelCartographerWindowProcessing(ctx context.Context, run CartographerRun, window CartographerWindow, message string) (CartographerWindowProcessResult, error) {
	now := timestamp(service.now())
	run.Status = CartographerRunCancelled
	run.LeaseOwner = ""
	run.LeaseDeadline = ""
	run.CompletedAt = now
	run.UpdatedAt = now
	run.Error = firstNonEmpty(message, "cartographer processing was cancelled")
	run.Diagnostics = append(run.Diagnostics, service.newCartographerDiagnostic(run.ID, "", CartographerDiagnosticWarning, "processing_cancelled", run.Error, "$", now))
	savedRun, err := service.SaveCartographerRun(ctx, run)
	if err != nil {
		return CartographerWindowProcessResult{}, err
	}
	processed, err := service.markCartographerWindowProcessed(ctx, window)
	if err != nil {
		return CartographerWindowProcessResult{}, err
	}
	return CartographerWindowProcessResult{
		Run:     savedRun,
		Window:  processed,
		Patches: []CartographerPatchRecord{},
		Events:  []SemanticEvent{},
	}, nil
}

func cartographerTrajectorySummaryText(bundle CartographerInputBundle) string {
	for index := len(bundle.TrajectorySummaries) - 1; index >= 0; index-- {
		if bundle.TrajectorySummaries[index].WindowID == bundle.WindowID && bundle.TrajectorySummaries[index].Summary != "" {
			return bundle.TrajectorySummaries[index].Summary
		}
	}
	if bundle.Truncation.DeterministicSummary != "" {
		return bundle.Truncation.DeterministicSummary
	}
	return summarizeTrajectoryEvents(bundle.NewEvents)
}
