package semanticgraph

import (
	"context"
	"errors"
	"fmt"
)

func validateCartographerRun(ctx context.Context, run CartographerRun) error {
	if ctx == nil {
		return errors.New("context is required")
	}
	if err := validateStoreIDs("workspace id", run.WorkspaceID, "cartographer run id", run.ID); err != nil {
		return err
	}
	if !isCartographerRunStatus(run.Status) {
		return fmt.Errorf("cartographer run status is unsupported: %s", run.Status)
	}
	if !isCartographerRunTriggerKind(run.TriggerKind) {
		return fmt.Errorf("cartographer run triggerKind is unsupported: %s", run.TriggerKind)
	}
	if err := requireOptionalEntityID(run.TargetEntityID, "cartographer target entity id"); err != nil {
		return err
	}
	if err := validateContextSourceRefs(run.SourceRefs, "cartographer run"); err != nil {
		return err
	}
	if err := validateCartographerInputBundle(run.InputBundle, "cartographer run input bundle"); err != nil {
		return err
	}
	if err := validateCartographerDiagnostics(run.Diagnostics); err != nil {
		return err
	}
	return validateCartographerTimestamps("cartographer run", run.CreatedAt, run.StartedAt, run.CompletedAt, run.UpdatedAt)
}

func validateCartographerWindow(ctx context.Context, window CartographerWindow) error {
	if ctx == nil {
		return errors.New("context is required")
	}
	if err := validateStoreIDs("workspace id", window.WorkspaceID, "cartographer window id", window.ID, "cartographer run id", window.RunID, "cartographer source id", window.SourceID); err != nil {
		return err
	}
	if err := validateOptionalStoreIDs([]optionalStoreID{
		{label: "cartographer cursor id", value: window.CursorID},
		{label: "cartographer summary id", value: window.SummaryID},
	}); err != nil {
		return err
	}
	if !isCartographerWindowStatus(window.Status) {
		return fmt.Errorf("cartographer window status is unsupported: %s", window.Status)
	}
	if !isCartographerSourceKind(window.SourceKind) {
		return fmt.Errorf("cartographer source kind is unsupported: %s", window.SourceKind)
	}
	if window.Sequence < 0 {
		return fmt.Errorf("cartographer window sequence must not be negative: %d", window.Sequence)
	}
	if err := validateCartographerInputBundle(window.InputBundle, "cartographer window input bundle"); err != nil {
		return err
	}
	return validateCartographerTimestamps("cartographer window", window.CreatedAt, window.OpenedAt, window.ClosedAt, window.UpdatedAt)
}

func validateCartographerCursor(ctx context.Context, cursor CartographerCursor) error {
	if err := validateCartographerSource(ctx, cursor.WorkspaceID, cursor.SourceKind, cursor.SourceID); err != nil {
		return err
	}
	if err := validateStoreIDs("cartographer cursor id", cursor.ID); err != nil {
		return err
	}
	if err := validateOptionalStoreIDs([]optionalStoreID{
		{label: "cartographer cursor last event id", value: cursor.LastEventID},
		{label: "cartographer run id", value: cursor.RunID},
	}); err != nil {
		return err
	}
	if cursor.LastSequence < 0 {
		return fmt.Errorf("cartographer cursor lastSequence must not be negative: %d", cursor.LastSequence)
	}
	return validateCartographerTimestamps("cartographer cursor", cursor.UpdatedAt, cursor.LastObservedAt)
}

func validateCartographerTrajectorySummary(ctx context.Context, summary CartographerTrajectorySummary) error {
	if err := validateCartographerSource(ctx, summary.WorkspaceID, summary.SourceKind, summary.SourceID); err != nil {
		return err
	}
	if err := validateStoreIDs("cartographer summary id", summary.ID, "cartographer run id", summary.RunID); err != nil {
		return err
	}
	if err := requireOptionalEntityID(summary.WindowID, "cartographer window id"); err != nil {
		return err
	}
	if err := requireNonEmpty(summary.Summary, "cartographer trajectory summary"); err != nil {
		return err
	}
	if err := validateContextSourceRefs(summary.SourceRefs, "cartographer summary"); err != nil {
		return err
	}
	if summary.ItemCount < 0 {
		return fmt.Errorf("cartographer summary itemCount must not be negative: %d", summary.ItemCount)
	}
	return validateCartographerTimestamps("cartographer summary", summary.CreatedAt)
}

func validateCartographerPatchRecord(ctx context.Context, patch CartographerPatchRecord) error {
	if ctx == nil {
		return errors.New("context is required")
	}
	if err := validateStoreIDs("workspace id", patch.WorkspaceID, "cartographer patch id", patch.ID, "cartographer run id", patch.RunID); err != nil {
		return err
	}
	if err := requireOptionalEntityID(patch.WindowID, "cartographer window id"); err != nil {
		return err
	}
	if !isCartographerPatchStatus(patch.Status) {
		return fmt.Errorf("cartographer patch status is unsupported: %s", patch.Status)
	}
	if err := validateCartographerPatch(patch.Patch, patch.ID, patch.RunID, patch.WindowID); err != nil {
		return err
	}
	if err := validateCartographerValidationResult(patch.ValidationResult, patch.ID); err != nil {
		return err
	}
	if err := validateCartographerApplicationResult(patch.ApplicationResult, patch.ID); err != nil {
		return err
	}
	if err := validateOptionalStoreIDs(optionalIDsFromStrings("cartographer created semantic event id", patch.CreatedSemanticEventIDs)); err != nil {
		return err
	}
	return validateCartographerTimestamps("cartographer patch", patch.CreatedAt, patch.ValidatedAt, patch.AppliedAt)
}

func validateCartographerPatch(patch CartographerPatch, patchID string, runID string, windowID string) error {
	if err := validateCartographerPatchIdentity(patch, patchID, runID, windowID); err != nil {
		return err
	}
	if patch.Confidence != nil && (*patch.Confidence < 0 || *patch.Confidence > 100) {
		return fmt.Errorf("cartographer patch confidence must be between 0 and 100")
	}
	if err := validateCartographerPatchOperations(patch.Operations); err != nil {
		return err
	}
	if err := validateCartographerPatchEvidence(patch.Evidence); err != nil {
		return err
	}
	if _, _, err := compactRawJSON(patch.RawEnvelope, "{}"); err != nil {
		return fmt.Errorf("cartographer patch raw envelope: %w", err)
	}
	return nil
}

func validateCartographerPatchIdentity(patch CartographerPatch, patchID string, runID string, windowID string) error {
	if patch.ID != patchID {
		return fmt.Errorf("cartographer patch id = %s, want %s", patch.ID, patchID)
	}
	if patch.RunID != runID {
		return fmt.Errorf("cartographer patch runId = %s, want %s", patch.RunID, runID)
	}
	if patch.WindowID != windowID {
		return fmt.Errorf("cartographer patch windowId = %s, want %s", patch.WindowID, windowID)
	}
	return nil
}

func validateCartographerPatchOperations(operations []CartographerPatchOperation) error {
	if len(operations) == 0 {
		return errors.New("cartographer patch operations are required")
	}
	for _, operation := range operations {
		if err := validateCartographerPatchOperation(operation); err != nil {
			return err
		}
	}
	return nil
}

func validateCartographerPatchOperation(operation CartographerPatchOperation) error {
	if err := validateStoreIDs("cartographer patch operation id", operation.ID); err != nil {
		return err
	}
	if err := requireNonEmpty(operation.Kind, "cartographer patch operation kind"); err != nil {
		return err
	}
	if err := requireOptionalEntityID(operation.TargetEntityID, "cartographer patch operation target entity id"); err != nil {
		return err
	}
	if _, _, err := compactRawJSON(operation.Payload, "{}"); err != nil {
		return fmt.Errorf("cartographer patch operation payload: %w", err)
	}
	return nil
}

func validateCartographerPatchEvidence(evidenceRefs []CartographerPatchEvidenceRef) error {
	for _, evidence := range evidenceRefs {
		if evidence.SourceKind != "" && !isSemanticEvidenceSourceKind(evidence.SourceKind) {
			return fmt.Errorf("cartographer patch evidence sourceKind is unsupported: %s", evidence.SourceKind)
		}
		if err := validateOptionalStoreIDs([]optionalStoreID{
			{label: "cartographer patch evidence source id", value: evidence.SourceID},
			{label: "cartographer patch evidence anchor id", value: evidence.EvidenceAnchorID},
		}); err != nil {
			return err
		}
	}
	return nil
}

func validateCartographerValidationResult(result CartographerPatchValidationResult, patchID string) error {
	if result.PatchID == "" {
		return nil
	}
	if result.PatchID != patchID {
		return fmt.Errorf("cartographer validation patchId = %s, want %s", result.PatchID, patchID)
	}
	if err := validateCartographerDiagnostics(result.Diagnostics); err != nil {
		return err
	}
	return validateCartographerTimestamps("cartographer validation result", result.ValidatedAt)
}

func validateCartographerApplicationResult(result CartographerPatchApplicationResult, patchID string) error {
	if result.PatchID == "" {
		return nil
	}
	if result.PatchID != patchID {
		return fmt.Errorf("cartographer application patchId = %s, want %s", result.PatchID, patchID)
	}
	if err := validateOptionalStoreIDs(optionalIDsFromStrings("cartographer application created semantic event id", result.CreatedSemanticEventIDs)); err != nil {
		return err
	}
	if err := validateCartographerDiagnostics(result.Diagnostics); err != nil {
		return err
	}
	return validateCartographerTimestamps("cartographer application result", result.AppliedAt)
}

func validateCartographerInputBundle(bundle CartographerInputBundle, label string) error {
	if bundle.WorkspaceID != "" {
		if err := validateStoreIDs(label+" workspace id", bundle.WorkspaceID); err != nil {
			return err
		}
	}
	if err := requireOptionalEntityID(bundle.TargetEntityID, label+" target entity id"); err != nil {
		return err
	}
	if err := validateContextSourceRefs(bundle.SourceRefs, label); err != nil {
		return err
	}
	return validateOptionalStoreIDs(optionalIDsFromStrings(label+" observed event ref", bundle.ObservedEventRefs))
}

func validateCartographerDiagnostics(diagnostics []CartographerDiagnostic) error {
	for _, diagnostic := range diagnostics {
		if err := validateStoreIDs("cartographer diagnostic id", diagnostic.ID, "cartographer diagnostic run id", diagnostic.RunID); err != nil {
			return err
		}
		if err := requireOptionalEntityID(diagnostic.PatchID, "cartographer diagnostic patch id"); err != nil {
			return err
		}
		if !isCartographerDiagnosticSeverity(diagnostic.Severity) {
			return fmt.Errorf("cartographer diagnostic severity is unsupported: %s", diagnostic.Severity)
		}
		if err := requireNonEmpty(diagnostic.Code, "cartographer diagnostic code"); err != nil {
			return err
		}
		if err := requireNonEmpty(diagnostic.Message, "cartographer diagnostic message"); err != nil {
			return err
		}
		if err := validateCartographerTimestamps("cartographer diagnostic", diagnostic.CreatedAt); err != nil {
			return err
		}
	}
	return nil
}

func validateCartographerSource(ctx context.Context, workspaceID string, sourceKind CartographerSourceKind, sourceID string) error {
	if ctx == nil {
		return errors.New("context is required")
	}
	if err := validateStoreIDs("workspace id", workspaceID, "cartographer source id", sourceID); err != nil {
		return err
	}
	if !isCartographerSourceKind(sourceKind) {
		return fmt.Errorf("cartographer source kind is unsupported: %s", sourceKind)
	}
	return nil
}

func validateCartographerTimestamps(label string, values ...string) error {
	for _, value := range values {
		if value == "" {
			continue
		}
		if err := validateTimestamp(label+" timestamp", value); err != nil {
			return err
		}
	}
	return nil
}

func optionalIDsFromStrings(label string, values []string) []optionalStoreID {
	result := make([]optionalStoreID, 0, len(values))
	for _, value := range values {
		result = append(result, optionalStoreID{label: label, value: value})
	}
	return result
}

func isCartographerRunStatus(status CartographerRunStatus) bool {
	switch status {
	case CartographerRunPending, CartographerRunRunning, CartographerRunCompleted, CartographerRunFailed:
		return true
	default:
		return false
	}
}

func isCartographerRunTriggerKind(kind CartographerRunTriggerKind) bool {
	switch kind {
	case CartographerTriggerManual, CartographerTriggerWorkflowWindow, CartographerTriggerWorkflowDone, CartographerTriggerExplicitRetry, CartographerTriggerExplicitReview:
		return true
	default:
		return false
	}
}

func isCartographerWindowStatus(status CartographerWindowStatus) bool {
	switch status {
	case CartographerWindowOpen, CartographerWindowClosed, CartographerWindowProcessed:
		return true
	default:
		return false
	}
}

func isCartographerSourceKind(kind CartographerSourceKind) bool {
	switch kind {
	case CartographerSourceWorkflowExecution, CartographerSourceChatRun, CartographerSourceSemanticTarget:
		return true
	default:
		return false
	}
}

func isCartographerPatchStatus(status CartographerPatchStatus) bool {
	switch status {
	case CartographerPatchProposed, CartographerPatchValidated, CartographerPatchRejected, CartographerPatchApplied:
		return true
	default:
		return false
	}
}

func isCartographerDiagnosticSeverity(severity CartographerDiagnosticSeverity) bool {
	switch severity {
	case CartographerDiagnosticInfo, CartographerDiagnosticWarning, CartographerDiagnosticError:
		return true
	default:
		return false
	}
}
