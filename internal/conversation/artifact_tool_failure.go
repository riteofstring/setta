package conversation

import (
	"context"
	"errors"
	"fmt"

	"setta/internal/agent"
)

func (service *Service) persistArtifactToolFailure(
	ctx context.Context,
	workspaceID string,
	conversationID string,
	turnID string,
	call agent.DynamicToolCall,
	failure agent.DynamicToolFailure,
) error {
	trajectoryID, err := service.newID("trajectory")
	if err != nil {
		return fmt.Errorf("create artifact failure trajectory id: %w", err)
	}
	lock := service.conversationLock(conversationID)
	lock.Lock()
	defer lock.Unlock()
	snapshot, err := service.snapshotLocked(ctx, workspaceID, conversationID)
	if err != nil {
		return err
	}
	turn, err := findConversationTurn(snapshot, turnID)
	if err != nil {
		return err
	}
	now := service.timestamp()
	trajectory := artifactToolFailureTrajectory(
		trajectoryID,
		conversationID,
		turnID,
		call,
		failure,
		snapshot.Conversation.LastTrajectorySequence+1,
		now,
	)
	publications, err := service.publications(
		conversationID,
		now,
		ConversationTrajectoryAppendedEventPayload{Type: ConversationEventTypeTrajectoryAppended, Event: trajectory},
	)
	if err != nil {
		return err
	}
	_, err = service.store.transactPresentationAware(ctx, "record topic conversation artifact tool failure", func(transaction *WriteTransaction) error {
		if err := transaction.AppendTrajectoryEvent(trajectory); err != nil {
			return err
		}
		return appendPublications(transaction, publications)
	})
	if err == nil {
		service.observeCommittedTrajectory(snapshot.Conversation, turn, []TrajectoryEvent{trajectory}, nil, false)
	}
	return err
}

func artifactToolFailureTrajectory(
	trajectoryID string,
	conversationID string,
	turnID string,
	call agent.DynamicToolCall,
	failure agent.DynamicToolFailure,
	sequence int,
	emittedAt string,
) TrajectoryEvent {
	title := call.Tool
	if call.Namespace != "" {
		title = call.Namespace + "/" + title
	}
	activity := TrajectoryActivity{
		ID:    call.CallID,
		Kind:  TrajectoryActivityDynamicTool,
		Title: title,
		Tool:  &call.Tool,
	}
	if call.Namespace != "" {
		activity.Namespace = &call.Namespace
	}
	return TrajectoryEvent{
		ID:               trajectoryID,
		ConversationID:   conversationID,
		TurnID:           &turnID,
		Sequence:         sequence,
		EmittedAt:        emittedAt,
		Kind:             TrajectoryEventActivityFailed,
		Actor:            TrajectoryActorSystem,
		ProviderEventID:  &call.CallID,
		ProviderThreadID: &call.ProviderThreadID,
		ProviderTurnID:   &call.ProviderTurnID,
		ActivityFailed: &TrajectoryActivityFailed{
			Activity: activity,
			Failure: Failure{
				Code:                failure.Code,
				Message:             failure.Message,
				Retryable:           failure.Retryable,
				DiagnosticReference: failure.DiagnosticReference,
			},
		},
	}
}

type artifactToolFailureError struct {
	code        string
	message     string
	retryable   bool
	fieldErrors []agent.DynamicToolFieldError
	cause       error
}

func newArtifactToolFailureError(
	code string,
	message string,
	retryable bool,
	fieldErrors []agent.DynamicToolFieldError,
	cause error,
) *artifactToolFailureError {
	if fieldErrors == nil {
		fieldErrors = []agent.DynamicToolFieldError{}
	}
	return &artifactToolFailureError{
		code:        code,
		message:     message,
		retryable:   retryable,
		fieldErrors: append([]agent.DynamicToolFieldError{}, fieldErrors...),
		cause:       cause,
	}
}

func (err *artifactToolFailureError) Error() string {
	return err.message
}

func (err *artifactToolFailureError) Unwrap() error {
	return err.cause
}

func (err *artifactToolFailureError) dynamicToolFailure(call agent.DynamicToolCall) agent.DynamicToolFailure {
	return agent.DynamicToolFailure{
		Code:                err.code,
		Message:             err.message,
		Retryable:           err.retryable,
		FieldErrors:         append([]agent.DynamicToolFieldError{}, err.fieldErrors...),
		DiagnosticReference: artifactToolDiagnosticReference(call, err.code),
	}
}

func artifactToolFailureFromError(
	call agent.DynamicToolCall,
	err error,
) (agent.DynamicToolFailure, bool) {
	var failureErr *artifactToolFailureError
	if errors.As(err, &failureErr) {
		return failureErr.dynamicToolFailure(call), true
	}
	return agent.DynamicToolFailure{}, false
}

func artifactToolStaleTurnError(cause error) *artifactToolFailureError {
	return newArtifactToolFailureError(
		artifactToolFailureStaleTurn,
		"artifact tool call no longer matches the active turn",
		false,
		[]agent.DynamicToolFieldError{},
		cause,
	)
}

func artifactToolPersistenceFailure(
	call agent.DynamicToolCall,
	cause error,
) agent.DynamicToolFailure {
	err := newArtifactToolFailureError(
		artifactToolFailurePersistenceFailure,
		"artifact tool failure diagnostics could not be stored",
		false,
		[]agent.DynamicToolFieldError{},
		cause,
	)
	return err.dynamicToolFailure(call)
}

func artifactToolDiagnosticReference(call agent.DynamicToolCall, code string) string {
	if call.CallID == "" {
		return "artifact_tool:" + code
	}
	return "artifact_tool:" + call.CallID + ":" + code
}
