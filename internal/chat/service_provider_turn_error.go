package chat

import "fmt"

func (service *Service) handleProviderTurnError(workspaceID string, conversationID string, runID string, providerError ProviderTurnError) error {
	if providerError.Message == "" {
		return fmt.Errorf("provider turn error message is required")
	}

	service.mu.Lock()
	defer service.mu.Unlock()

	run, active, ok, err := service.runningActiveTurnLocked(workspaceID, conversationID, runID)
	if err != nil || !ok {
		return err
	}
	observedAt := timestamp(service.now())
	if err := service.recordProviderTurnErrorDiagnosticLocked(workspaceID, conversationID, runID, providerError); err != nil {
		return err
	}
	if !providerError.Retryable && !providerError.StreamFailure {
		return nil
	}

	var liveness RunLiveness
	if providerError.Retryable {
		liveness = service.markActiveRunLivenessReconcilingLocked(workspaceID, conversationID, run, active, RunLivenessReasonStreamResync, observedAt)
		liveness.Error = providerError.Message
		service.liveness[activeKey(workspaceID, conversationID)] = liveness
	} else {
		liveness = service.markActiveRunLivenessLostLocked(workspaceID, conversationID, run, active, RunLivenessReasonProviderUnavailable, observedAt, providerError.Message)
	}
	if _, err := service.events.Publish(NewRunLivenessUpdatedEvent(liveness)); err != nil {
		return err
	}
	return service.publishConversationUpdatedLocked(workspaceID, conversationID, runID)
}

func (service *Service) recordProviderTurnErrorDiagnosticLocked(workspaceID string, conversationID string, runID string, providerError ProviderTurnError) error {
	code := "codex_turn_error"
	resyncRequired := false
	severity := DiagnosticSeverityCritical
	if providerError.Retryable {
		code = "codex_turn_error_retrying"
		resyncRequired = true
		severity = DiagnosticSeverityWarning
	} else if providerError.StreamFailure {
		code = "codex_stream_error"
		resyncRequired = true
	}
	context := providerTurnErrorDiagnosticContext(providerError, resyncRequired)
	_, err := service.recordDiagnosticLocked(diagnosticDraft{
		Code:           code,
		Context:        context,
		ConversationID: conversationID,
		Message:        providerError.Message,
		RunID:          runID,
		Severity:       severity,
		Source:         DiagnosticSourceProvider,
		WorkspaceID:    workspaceID,
	})
	return err
}

func providerTurnErrorDiagnosticContext(providerError ProviderTurnError, resyncRequired bool) map[string]string {
	context := map[string]string{
		"resyncRequired": fmt.Sprintf("%t", resyncRequired),
		"streamFailure":  fmt.Sprintf("%t", providerError.StreamFailure),
		"willRetry":      fmt.Sprintf("%t", providerError.Retryable),
	}
	if providerError.AdditionalDetails != "" {
		context["additionalDetails"] = providerError.AdditionalDetails
	}
	if providerError.CodexErrorKind != "" {
		context["codexErrorKind"] = providerError.CodexErrorKind
	}
	if len(providerError.CodexErrorInfo) > 0 {
		context["codexErrorInfo"] = boundedText(string(providerError.CodexErrorInfo), 4096)
	}
	return context
}
