package semanticgraph

import (
	"errors"
	"fmt"
	"strings"

	"setta/internal/chat"
)

func validateCartographerRunAudit(run CartographerRun) error {
	return firstCartographerValidationError(
		func() error { return validateCartographerRunSettingsAudit(run) },
		func() error { return validateCartographerRunModelAudit(run) },
		func() error { return validateCartographerRunReasoningAudit(run) },
		func() error { return validateCartographerRunReferenceAudit(run) },
		func() error { return validateCartographerRunQueueAudit(run) },
		func() error { return validateCartographerRunNumericAudit(run) },
		func() error { return validateCartographerRunCloseReasonAudit(run) },
		func() error { return validateCartographerRunLeaseAudit(run) },
		func() error { return validateCartographerInputItemCounts(run.InputItemCounts) },
		func() error {
			return validateOptionalStoreIDs(optionalIDsFromStrings("cartographer run created semantic event id", run.CreatedSemanticEventIDs))
		},
		func() error { return validateCartographerDiagnostics(run.Diagnostics) },
	)
}

func validateCartographerRunSettingsAudit(run CartographerRun) error {
	if run.SettingsHash == "" {
		return errors.New("cartographer run settingsHash is required")
	}
	if !isCartographerTaskProfile(run.TaskProfile) {
		return fmt.Errorf("cartographer run taskProfile is unsupported: %s", run.TaskProfile)
	}
	if expected := cartographerTaskProfileForTrigger(run.TriggerKind); run.TaskProfile != expected {
		return fmt.Errorf("cartographer run taskProfile = %s, want %s for triggerKind %s", run.TaskProfile, expected, run.TriggerKind)
	}
	return nil
}

func validateCartographerRunModelAudit(run CartographerRun) error {
	if !isSemanticCartographerModelSelection(run.RequestedModelSelection) {
		return fmt.Errorf("cartographer run requestedModelSelection is unsupported: %s", run.RequestedModelSelection)
	}
	switch run.RequestedModelSelection {
	case SemanticCartographerModelSelectionProviderDefault:
		if run.RequestedModel != "" {
			return fmt.Errorf("cartographer run requestedModel must be empty when requestedModelSelection is %s", SemanticCartographerModelSelectionProviderDefault)
		}
	case SemanticCartographerModelSelectionExplicit:
		return validateExplicitCartographerRequestedModel(run.RequestedModel)
	}
	return nil
}

func validateExplicitCartographerRequestedModel(model string) error {
	if strings.TrimSpace(model) == "" {
		return fmt.Errorf("cartographer run requestedModel is required when requestedModelSelection is %s", SemanticCartographerModelSelectionExplicit)
	}
	if strings.TrimSpace(model) != model {
		return errors.New("cartographer run requestedModel must not have leading or trailing whitespace")
	}
	return nil
}

func validateCartographerRunReasoningAudit(run CartographerRun) error {
	if !isSemanticCartographerReasoningEffort(run.RequestedReasoningEffort) {
		return fmt.Errorf("cartographer run requestedReasoningEffort is unsupported: %s", run.RequestedReasoningEffort)
	}
	if run.RequestedInputBudget <= 0 {
		return fmt.Errorf("cartographer run requestedInputBudget must be positive: %d", run.RequestedInputBudget)
	}
	if run.RequestedInputBudget > codexStructuredTaskInputCharacterLimit {
		return fmt.Errorf("cartographer run requestedInputBudget must not exceed %d serialized harness-input characters: %d", codexStructuredTaskInputCharacterLimit, run.RequestedInputBudget)
	}
	if err := validateOptionalCartographerReasoningEffort("effectiveReasoningEffort", run.EffectiveReasoningEffort); err != nil {
		return err
	}
	if err := validateOptionalCartographerReasoningEffort("reportedReasoningEffort", run.ReportedReasoningEffort); err != nil {
		return err
	}
	if run.ReportedReasoningEffort != "" && !run.ReasoningEffortReported {
		return errors.New("cartographer run reasoningEffortReported must be true when reportedReasoningEffort is set")
	}
	if run.ReasoningEffortReported && run.ReportedReasoningEffort == "" {
		return errors.New("cartographer run reportedReasoningEffort is required when reasoningEffortReported is true")
	}
	return nil
}

func validateOptionalCartographerReasoningEffort(label string, value string) error {
	if value == "" {
		return nil
	}
	if !isSemanticCartographerReasoningEffort(chat.ReasoningEffort(value)) {
		return fmt.Errorf("cartographer run %s is unsupported: %s", label, value)
	}
	return nil
}

func validateCartographerRunReferenceAudit(run CartographerRun) error {
	return validateOptionalStoreIDs([]optionalStoreID{
		{label: "cartographer run window id", value: run.WindowID},
		{label: "cartographer run source epoch id", value: run.SourceEpochID},
		{label: "cartographer run request id", value: run.RequestID},
		{label: "cartographer run response id", value: run.ResponseID},
	})
}

func validateCartographerRunQueueAudit(run CartographerRun) error {
	if run.Priority < 0 {
		return fmt.Errorf("cartographer run priority must not be negative: %d", run.Priority)
	}
	if run.AttemptCount < 0 {
		return fmt.Errorf("cartographer run attemptCount must not be negative: %d", run.AttemptCount)
	}
	return nil
}

func validateCartographerRunCloseReasonAudit(run CartographerRun) error {
	if run.CloseReason != "" && !isCartographerWindowCloseReason(run.CloseReason) {
		return fmt.Errorf("cartographer run closeReason is unsupported: %s", run.CloseReason)
	}
	return nil
}

func validateCartographerRunLeaseAudit(run CartographerRun) error {
	if run.LeaseDeadline == "" {
		return nil
	}
	return validateTimestamp("cartographer run leaseDeadline", run.LeaseDeadline)
}

func validateCartographerRunNumericAudit(run CartographerRun) error {
	values := []struct {
		label string
		value int
	}{
		{label: "cartographer run inputBundleBytes", value: run.InputBundleBytes},
		{label: "cartographer run inputBundleCharacterCount", value: run.InputBundleCharacterCount},
		{label: "cartographer run outputSchemaBytes", value: run.OutputSchemaBytes},
		{label: "cartographer run rawHarnessResponseBytes", value: run.RawHarnessResponseBytes},
		{label: "cartographer run queueWaitMs", value: run.QueueWaitMS},
		{label: "cartographer run harnessDurationMs", value: run.HarnessDurationMS},
		{label: "cartographer run validationDurationMs", value: run.ValidationDurationMS},
		{label: "cartographer run applicationDurationMs", value: run.ApplicationDurationMS},
		{label: "cartographer run totalDurationMs", value: run.TotalDurationMS},
	}
	for _, item := range values {
		if item.value < 0 {
			return fmt.Errorf("%s must not be negative: %d", item.label, item.value)
		}
	}
	return nil
}
