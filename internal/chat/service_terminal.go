package chat

import (
	"fmt"
	"strings"
)

const terminalTurnPublishFailedDiagnosticCode = "terminal_turn_publish_failed"

type terminalTurnPublishFailure struct {
	eventType string
	err       error
}

type terminalTurnPublishFailures struct {
	failures []terminalTurnPublishFailure
}

func (failures *terminalTurnPublishFailures) publish(service *Service, draft EventDraft) {
	if _, err := service.events.Publish(draft); err != nil {
		failures.failures = append(failures.failures, terminalTurnPublishFailure{
			eventType: draft.Type,
			err:       err,
		})
	}
}

func (service *Service) recordTerminalTurnPublishFailuresLocked(workspaceID string, conversationID string, runID string, failures terminalTurnPublishFailures) {
	if len(failures.failures) == 0 {
		return
	}
	details := make([]string, 0, len(failures.failures))
	for _, failure := range failures.failures {
		details = append(details, fmt.Sprintf("%s: %s", failure.eventType, failure.err))
	}
	_, _ = service.recordDiagnosticLocked(diagnosticDraft{
		Code:           terminalTurnPublishFailedDiagnosticCode,
		Context:        map[string]string{"errors": strings.Join(details, " | ")},
		ConversationID: conversationID,
		Message:        "Terminal turn state was saved, but one or more chat events failed to publish.",
		RunID:          runID,
		Severity:       DiagnosticSeverityWarning,
		Source:         DiagnosticSourceChat,
		WorkspaceID:    workspaceID,
	})
}

func (service *Service) markTerminalPendingSteeringLocked(workspaceID string, conversationID string, runID string, status MessageStatus, reconcile bool) ([]ChatMessage, error) {
	if !reconcile {
		return nil, nil
	}
	return service.markPendingSteeringMessagesLocked(workspaceID, conversationID, runID, status)
}

func (service *Service) publishTerminalTurnLocked(workspaceID string, conversationID string, assistant ChatMessage, run Run, pendingSteering []ChatMessage, transcript *transcriptIngest, liveness RunLiveness) error {
	var failures terminalTurnPublishFailures
	if transcript != nil {
		failures.publish(service, NewTranscriptBlocksReplacedEvent(workspaceID, conversationID, run.ID, transcript.snapshot()))
	}
	failures.publish(service, NewMessageUpdatedEvent(workspaceID, conversationID, run.ID, assistant))
	for _, message := range pendingSteering {
		failures.publish(service, NewMessageUpdatedEvent(workspaceID, conversationID, run.ID, message))
	}
	failures.publish(service, NewRunUpdatedEvent(run))
	failures.publish(service, NewRunLivenessUpdatedEvent(liveness))
	if err := service.publishTerminalConversationUpdatedLocked(workspaceID, conversationID, run.ID, &failures); err != nil {
		service.recordTerminalTurnPublishFailuresLocked(workspaceID, conversationID, run.ID, failures)
		return err
	}
	service.recordTerminalTurnPublishFailuresLocked(workspaceID, conversationID, run.ID, failures)
	return nil
}

func (service *Service) publishTerminalConversationUpdatedLocked(workspaceID string, conversationID string, runID string, failures *terminalTurnPublishFailures) error {
	draft, ok, err := service.conversationUpdatedEventLocked(workspaceID, conversationID, runID)
	if err != nil || !ok {
		return err
	}
	failures.publish(service, draft)
	return nil
}
