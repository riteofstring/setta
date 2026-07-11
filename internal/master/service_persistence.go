package master

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"setta/internal/conversation"
	"setta/internal/conversationindex"
)

type persistInteractionRequest struct {
	PriorSession     *conversation.MasterSessionRecord
	SessionID        string
	Input            Input
	Candidates       []conversationindex.TopicCandidate
	CandidateContext CandidateContext
	Decision         RouteDecision
	Command          *CommandResult
	Intents          []PresentationIntent
	Invocation       conversation.ResolvedInvocation
	ActionError      error
	ProviderThreadID string
}

func (service *Service) persistInteraction(ctx context.Context, request persistInteractionRequest) (Interaction, error) {
	decisionJSON, err := marshalRouteDecision(request.Decision)
	if err != nil {
		return Interaction{}, err
	}
	candidatesJSON, err := json.Marshal(request.CandidateContext)
	if err != nil {
		return Interaction{}, err
	}
	commandJSON, err := marshalOptional(request.Command)
	if err != nil {
		return Interaction{}, err
	}
	recordID, err := service.newID("master_route")
	if err != nil {
		return Interaction{}, err
	}
	createdAt := *request.Invocation.EndedAt
	failure := masterActionFailure(recordID, request.ActionError)
	outcome := "succeeded"
	if failure != nil {
		outcome = "failed"
	}
	record := conversation.MasterRouteDecisionRecord{
		ID: recordID, MasterSessionID: request.SessionID,
		InputID: request.Input.ID, InputModality: string(request.Input.Modality),
		InputText: request.Input.Text, InputSubmittedAt: request.Input.SubmittedAt,
		FocusedWorkspaceID:    cloneString(request.Input.FocusedWorkspaceID),
		FocusedConversationID: cloneString(request.Input.FocusedConversationID),
		FocusedPaneID:         cloneString(request.Input.FocusedPaneID),
		CandidateContext:      json.RawMessage(candidatesJSON), RouteDecision: decisionJSON,
		ResultingCommand: commandJSON, ResolvedInvocation: request.Invocation,
		Outcome: outcome, Error: failure, CreatedAt: createdAt,
	}
	session, err := sessionAfterInteraction(request, createdAt)
	if err != nil {
		return Interaction{}, err
	}
	replyCount := replyIntentCount(request.Intents)
	eventIDs, err := service.interactionEventIDs(len(request.Intents) + replyCount)
	if err != nil {
		return Interaction{}, err
	}
	interaction := Interaction{}
	_, err = service.store.Transact(ctx, "persist master route decision", func(transaction *conversation.WriteTransaction) error {
		if request.PriorSession == nil {
			if err := transaction.InsertMasterSession(session); err != nil {
				return err
			}
		} else if err := transaction.UpdateMasterSession(request.PriorSession.UpdatedAt, session); err != nil {
			return err
		}
		created, err := transaction.InsertMasterRouteDecision(record)
		if err != nil {
			return err
		}
		interaction, err = interactionFromRecord(created)
		if err != nil {
			return err
		}
		if err := appendMasterEvent(transaction, eventIDs[0], request.SessionID, createdAt, SessionUpdatedPayload{Type: EventTypeSessionUpdated, Session: publicSession(session)}); err != nil {
			return err
		}
		if err := appendMasterEvent(transaction, eventIDs[1], request.SessionID, createdAt, RouteCommittedPayload{Type: EventTypeRouteCommitted, Interaction: interaction}); err != nil {
			return err
		}
		for index, intent := range request.Intents {
			if err := appendMasterEvent(transaction, eventIDs[index+2], request.SessionID, createdAt, PresentationIntentPayload{Type: EventTypePresentationIntent, Intent: intent}); err != nil {
				return err
			}
		}
		eventIndex := len(request.Intents) + 2
		for _, intent := range request.Intents {
			if reply, ok := intent.(ShowMasterReplyIntent); ok {
				if err := appendMasterEvent(transaction, eventIDs[eventIndex], request.SessionID, createdAt, ReplyPayload{Type: EventTypeReply, Text: reply.Text}); err != nil {
					return err
				}
				eventIndex++
			}
		}
		return nil
	})
	return interaction, err
}

func sessionAfterInteraction(request persistInteractionRequest, updatedAt string) (conversation.MasterSessionRecord, error) {
	contextJSON, err := json.Marshal(map[string]string{"lastInputId": request.Input.ID})
	if err != nil {
		return conversation.MasterSessionRecord{}, err
	}
	createdAt := request.Invocation.StartedAt
	if request.PriorSession != nil {
		createdAt = request.PriorSession.CreatedAt
	}
	threadID := request.ProviderThreadID
	return conversation.MasterSessionRecord{
		ID: request.SessionID, Provider: conversation.ProviderCodex, ProviderThreadID: &threadID,
		Status: string(SessionStatusReady), ResolvedInvocation: request.Invocation,
		DurableContext: json.RawMessage(contextJSON), CreatedAt: createdAt, UpdatedAt: updatedAt,
	}, nil
}

func (service *Service) interactionEventIDs(eventCount int) ([]string, error) {
	result := make([]string, 0, eventCount+2)
	for range eventCount + 2 {
		id, err := service.newID("master_event")
		if err != nil {
			return nil, err
		}
		result = append(result, id)
	}
	return result, nil
}

func appendMasterEvent(transaction *conversation.WriteTransaction, eventID string, sessionID string, emittedAt string, payload EventPayload) error {
	_, err := transaction.AppendCommittedEvent(conversation.CommittedEventDraft{
		ID: eventID, StreamID: masterStreamID(sessionID), Kind: string(payload.eventType()),
		Payload: payload, CommittedAt: emittedAt,
	})
	return err
}

func masterActionFailure(reference string, actionErr error) *conversation.Failure {
	if actionErr == nil {
		return nil
	}
	return &conversation.Failure{
		Code: "master_action_failed", Message: actionErr.Error(), Retryable: false,
		DiagnosticReference: reference,
	}
}

func marshalOptional(value *CommandResult) (json.RawMessage, error) {
	if value == nil {
		return nil, nil
	}
	encoded, err := json.Marshal(value)
	return json.RawMessage(encoded), err
}

func interactionFromRecord(record conversation.MasterRouteDecisionRecord) (Interaction, error) {
	decision, err := decodeRouteDecision(string(record.RouteDecision))
	if err != nil {
		return Interaction{}, err
	}
	var context CandidateContext
	if err := json.Unmarshal(record.CandidateContext, &context); err != nil {
		return Interaction{}, err
	}
	var command *CommandResult
	if len(record.ResultingCommand) > 0 {
		command = &CommandResult{}
		if err := json.Unmarshal(record.ResultingCommand, command); err != nil {
			return Interaction{}, err
		}
	}
	return Interaction{
		Sequence: record.StreamSequence, ID: record.ID,
		Input: Input{
			ID: record.InputID, Text: record.InputText, Modality: MasterInputModality(record.InputModality),
			SubmittedAt: record.InputSubmittedAt, FocusedWorkspaceID: cloneString(record.FocusedWorkspaceID),
			FocusedConversationID: cloneString(record.FocusedConversationID), FocusedPaneID: cloneString(record.FocusedPaneID),
		},
		Candidates: context.Candidates, Decision: decision, Command: command,
		ResolvedInvocation: record.ResolvedInvocation, Outcome: record.Outcome,
		Error: record.Error, CreatedAt: record.CreatedAt,
	}, nil
}

func publicSession(record conversation.MasterSessionRecord) Session {
	threadID := ""
	if record.ProviderThreadID != nil {
		threadID = *record.ProviderThreadID
	}
	return Session{
		ID: record.ID, ProviderThreadID: threadID, Status: MasterSessionStatus(record.Status),
		ResolvedInvocation: record.ResolvedInvocation, CreatedAt: record.CreatedAt,
		UpdatedAt: record.UpdatedAt, Degradation: record.Degradation,
	}
}

func (service *Service) persistMasterDegradation(ctx context.Context, previous *conversation.MasterSessionRecord, sessionID string, reference string, failure error, startedAt string, endedAt string) {
	if previous == nil {
		return
	}
	next := *previous
	next.Status = string(SessionStatusDegraded)
	next.UpdatedAt = endedAt
	next.Degradation = &conversation.Failure{
		Code: "master_call_failed", Message: failure.Error(), Retryable: true,
		DiagnosticReference: reference,
	}
	eventID, err := service.newID("master_event")
	if err != nil {
		return
	}
	_, _ = service.store.Transact(ctx, "persist master degradation", func(transaction *conversation.WriteTransaction) error {
		if err := transaction.UpdateMasterSession(previous.UpdatedAt, next); err != nil {
			return err
		}
		return appendMasterEvent(transaction, eventID, sessionID, endedAt, SessionUpdatedPayload{Type: EventTypeSessionUpdated, Session: publicSession(next)})
	})
}

func masterStreamID(sessionID string) string {
	return "master:global"
}

func replyIntentCount(intents []PresentationIntent) int {
	count := 0
	for _, intent := range intents {
		if _, ok := intent.(ShowMasterReplyIntent); ok {
			count++
		}
	}
	return count
}

func joinActionAndPersistence(actionErr error, persistErr error) error {
	return errors.Join(actionErr, persistErr)
}

func unexpectedMissingInvocationEnd(invocation conversation.ResolvedInvocation) error {
	return fmt.Errorf("master invocation %s has no end time", invocation.ID)
}
