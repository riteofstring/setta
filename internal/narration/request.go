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

// Request is the scheduling envelope for one narrator actor operation. Later
// projector phases attach their typed context to the durable identifiers in
// this envelope; mailbox ordering depends only on kind, trigger, and whether
// the operation is a recoverable retry.
type Request struct {
	ID             string
	ConversationID string
	Kind           RequestKind
	Trigger        conversation.NarrationTrigger
	// RecoverableRetry changes scheduling priority without erasing the
	// projection, status, or checkpoint operation that must be prepared.
	RecoverableRetry bool
	// RetryAttempt is zero for an externally submitted operation and advances
	// once for each actor-scheduled recovery attempt.
	RetryAttempt int
}

func (request Request) Validate() error {
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
	switch request.Kind {
	case RequestKindProjection:
		if !isProjectionTrigger(request.Trigger) {
			return fmt.Errorf(
				"narrator projection request %s has unsupported trigger %q",
				request.ID,
				request.Trigger,
			)
		}
	case RequestKindStatus:
		if request.Trigger != conversation.NarrationTriggerExplicitStatusRequested {
			return fmt.Errorf(
				"narrator status request %s requires trigger %q",
				request.ID,
				conversation.NarrationTriggerExplicitStatusRequested,
			)
		}
	case RequestKindCheckpoint:
		if request.Trigger != conversation.NarrationTriggerCheckpointWindowExceeded {
			return fmt.Errorf(
				"narrator checkpoint request %s requires trigger %q",
				request.ID,
				conversation.NarrationTriggerCheckpointWindowExceeded,
			)
		}
	default:
		return fmt.Errorf("narrator request %s has unsupported kind %q", request.ID, request.Kind)
	}
	return nil
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
