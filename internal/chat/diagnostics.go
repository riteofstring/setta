package chat

import "fmt"

type diagnosticDraft struct {
	Code           string
	Context        map[string]string
	ConversationID string
	Message        string
	RunID          string
	Severity       string
	Source         string
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
