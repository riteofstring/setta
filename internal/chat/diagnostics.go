package chat

import "fmt"

type diagnosticDraft struct {
	Code           string
	Context        map[string]string
	ConversationID string
	Message        string
	RunID          string
	Severity       DiagnosticSeverity
	Source         DiagnosticSource
	WorkspaceID    string
}

func (service *Service) recordDiagnostic(draft diagnosticDraft) (Diagnostic, error) {
	service.mu.Lock()
	defer service.mu.Unlock()
	return service.recordDiagnosticLocked(draft)
}

func (service *Service) recordDiagnosticLocked(draft diagnosticDraft) (Diagnostic, error) {
	id, err := service.newID("diagnostic")
	if err != nil {
		return Diagnostic{}, fmt.Errorf("create diagnostic id: %w", err)
	}
	context := draft.Context
	if context == nil {
		context = map[string]string{}
	}
	diagnostic := Diagnostic{
		SchemaVersion:  SchemaVersion,
		ID:             id,
		Source:         draft.Source,
		Severity:       draft.Severity,
		Code:           draft.Code,
		Message:        draft.Message,
		WorkspaceID:    draft.WorkspaceID,
		ConversationID: draft.ConversationID,
		RunID:          draft.RunID,
		OccurredAt:     timestamp(service.now()),
		Context:        context,
	}
	if err := service.store.SaveDiagnostic(diagnostic); err != nil {
		return Diagnostic{}, err
	}
	if _, err := service.events.Publish(NewDiagnosticCreatedEvent(diagnostic)); err != nil {
		return Diagnostic{}, err
	}
	return diagnostic, nil
}

func (service *Service) recordBackgroundFailure(request TurnRequest, code string, err error) {
	if err == nil {
		return
	}
	_, diagnosticErr := service.recordDiagnostic(diagnosticDraft{
		Code:           code,
		Context:        map[string]string{"error": err.Error()},
		ConversationID: request.Conversation.ID,
		Message:        err.Error(),
		RunID:          request.Run.ID,
		Severity:       DiagnosticSeverityCritical,
		Source:         DiagnosticSourceChat,
		WorkspaceID:    request.Workspace.ID,
	})
	if diagnosticErr != nil {
		return
	}
}

func (service *Service) recordProviderDiagnostic(workspaceID string, conversationID string, runID string, code string, message string, context map[string]string, resyncRequired bool, severity DiagnosticSeverity) error {
	if context == nil {
		context = map[string]string{}
	}
	if severity == "" {
		severity = DiagnosticSeverityCritical
	}
	context["resyncRequired"] = fmt.Sprintf("%t", resyncRequired)
	_, err := service.recordDiagnostic(diagnosticDraft{
		Code:           code,
		Context:        context,
		ConversationID: conversationID,
		Message:        message,
		RunID:          runID,
		Severity:       severity,
		Source:         DiagnosticSourceProvider,
		WorkspaceID:    workspaceID,
	})
	return err
}

func (service *Service) recordCorruptStateDiagnostic(err error, workspaceID string, conversationID string, runID string) {
	if err == nil || !IsCorruptStateError(err) {
		return
	}
	service.mu.Lock()
	defer service.mu.Unlock()
	service.recordCorruptStateDiagnosticLocked(err, workspaceID, conversationID, runID)
}

func (service *Service) recordCorruptStateDiagnosticLocked(err error, workspaceID string, conversationID string, runID string) {
	if err == nil || !IsCorruptStateError(err) {
		return
	}
	finding := corruptStateFinding(err, workspaceID, conversationID, runID, "unknown")
	service.recordCorruptStateFindingLocked(finding)
}

func (service *Service) recordCorruptStateFindingsLocked(findings []CorruptStateFinding) []Diagnostic {
	diagnostics := make([]Diagnostic, 0, len(findings))
	for _, finding := range findings {
		diagnostic, ok := service.recordCorruptStateFindingLocked(finding)
		if ok {
			diagnostics = append(diagnostics, diagnostic)
		}
	}
	return diagnostics
}

func (service *Service) recordCorruptStateFinding(finding CorruptStateFinding) {
	service.mu.Lock()
	defer service.mu.Unlock()
	service.recordCorruptStateFindingLocked(finding)
}

func (service *Service) recordCorruptStateFindingLocked(finding CorruptStateFinding) (Diagnostic, bool) {
	if finding.Code == "" {
		finding.Code = corruptChatStateCode
	}
	if finding.Severity == "" {
		finding.Severity = DiagnosticSeverityCritical
	}
	id, err := service.newID("diagnostic")
	if err != nil {
		return Diagnostic{}, false
	}
	diagnostic := Diagnostic{
		SchemaVersion:  SchemaVersion,
		ID:             id,
		Source:         DiagnosticSourceChat,
		Severity:       finding.Severity,
		Code:           finding.Code,
		Message:        finding.Error,
		WorkspaceID:    finding.WorkspaceID,
		ConversationID: finding.ConversationID,
		RunID:          finding.RunID,
		OccurredAt:     timestamp(service.now()),
		Context:        corruptFindingContext(finding),
	}
	if err := service.store.SaveDiagnostic(diagnostic); err != nil {
		return diagnostic, true
	}
	if _, err := service.events.Publish(NewDiagnosticCreatedEvent(diagnostic)); err != nil {
		return diagnostic, true
	}
	return diagnostic, true
}
