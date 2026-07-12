package narration

import (
	"fmt"
	"strings"

	"setta/internal/conversation"
)

type RequestKind string

const (
	RequestKindProjection RequestKind = "projection"
	RequestKindStatus     RequestKind = "status"
	RequestKindCheckpoint RequestKind = "checkpoint"
)

// StatusOperation is the explicit user-addressed status request carried by a
// status mailbox item. It is deliberately separate from primary-agent input:
// the narrator worker may read it, but no agent turn or steering API accepts
// this shape.
type StatusOperation struct {
	WorkspaceID string
	Question    string
}

func (operation StatusOperation) Validate() error {
	if err := validateIdentifier("narrator status workspace id", operation.WorkspaceID); err != nil {
		return err
	}
	return ValidateStatusQuestion(operation.Question)
}

// Request is the scheduling envelope for one narrator actor operation. Later
// projector phases attach their typed context to the durable identifiers in
// this envelope; mailbox ordering depends only on kind, trigger, and whether
// the operation is a recoverable retry.
type Request struct {
	ID             string
	ConversationID string
	Kind           RequestKind
	Trigger        conversation.NarrationTrigger
	Status         *StatusOperation
	// RecoverableRetry changes scheduling priority without erasing the
	// projection, status, or checkpoint operation that must be prepared.
	RecoverableRetry bool
	// RetryAttempt is zero for an externally submitted operation and advances
	// once for each actor-scheduled recovery attempt.
	RetryAttempt int
}

func (request Request) Validate() error {
	if err := request.validateEnvelope(); err != nil {
		return err
	}
	switch request.Kind {
	case RequestKindProjection:
		return request.validateProjection()
	case RequestKindStatus:
		return request.validateStatus()
	case RequestKindCheckpoint:
		return request.validateCheckpoint()
	default:
		return fmt.Errorf("narrator request %s has unsupported kind %q", request.ID, request.Kind)
	}
}

func (request Request) validateEnvelope() error {
	if err := validateIdentifier("narrator request id", request.ID); err != nil {
		return err
	}
	if err := validateIdentifier("narrator request conversation id", request.ConversationID); err != nil {
		return err
	}
	if request.RetryAttempt < 0 {
		return fmt.Errorf("narrator request %s retry attempt must be non-negative", request.ID)
	}
	if request.RecoverableRetry != (request.RetryAttempt > 0) {
		return fmt.Errorf(
			"narrator request %s recoverable retry flag does not match attempt %d",
			request.ID,
			request.RetryAttempt,
		)
	}
	return nil
}

func (request Request) validateProjection() error {
	if request.Status != nil {
		return fmt.Errorf("narrator projection request %s cannot include a status operation", request.ID)
	}
	if !isProjectionTrigger(request.Trigger) {
		return fmt.Errorf(
			"narrator projection request %s has unsupported trigger %q",
			request.ID,
			request.Trigger,
		)
	}
	return nil
}

func (request Request) validateStatus() error {
	if request.Status == nil {
		return fmt.Errorf("narrator status request %s requires a status operation", request.ID)
	}
	if err := request.Status.Validate(); err != nil {
		return fmt.Errorf("narrator status request %s: %w", request.ID, err)
	}
	if request.Trigger != conversation.NarrationTriggerExplicitStatusRequested {
		return fmt.Errorf(
			"narrator status request %s requires trigger %q",
			request.ID,
			conversation.NarrationTriggerExplicitStatusRequested,
		)
	}
	return nil
}

func (request Request) validateCheckpoint() error {
	if request.Status != nil {
		return fmt.Errorf("narrator checkpoint request %s cannot include a status operation", request.ID)
	}
	if request.Trigger != conversation.NarrationTriggerCheckpointWindowExceeded {
		return fmt.Errorf(
			"narrator checkpoint request %s requires trigger %q",
			request.ID,
			conversation.NarrationTriggerCheckpointWindowExceeded,
		)
	}
	return nil
}

func cloneRequest(request Request) Request {
	cloned := request
	if request.Status != nil {
		status := *request.Status
		cloned.Status = &status
	}
	return cloned
}

func validateIdentifier(label string, value string) error {
	if value == "" {
		return fmt.Errorf("%s is required", label)
	}
	if strings.TrimSpace(value) != value {
		return fmt.Errorf("%s must not have surrounding whitespace", label)
	}
	return nil
}

func isProjectionTrigger(trigger conversation.NarrationTrigger) bool {
	switch trigger {
	case conversation.NarrationTriggerProgressWindowElapsed,
		conversation.NarrationTriggerPlanChanged,
		conversation.NarrationTriggerPhaseActivityCompleted,
		conversation.NarrationTriggerApprovalRequired,
		conversation.NarrationTriggerUserSteered,
		conversation.NarrationTriggerTurnTerminal:
		return true
	default:
		return false
	}
}
