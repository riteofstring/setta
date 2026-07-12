package master

import (
	"errors"
	"time"
)

type InputRoutingCancellation struct {
	InputID        string `json:"inputId"`
	RoutingAttempt int    `json:"routingAttempt"`
	CancelledAt    string `json:"cancelledAt"`
}

func (cancellation InputRoutingCancellation) Validate() error {
	if err := ValidateInputID(cancellation.InputID); err != nil {
		return err
	}
	if cancellation.RoutingAttempt < 0 {
		return errors.New("master input routing cancellation attempt must be non-negative")
	}
	cancelledAt, err := normalizeTimestamp("master input routing cancelledAt", cancellation.CancelledAt)
	if err != nil || cancelledAt != cancellation.CancelledAt {
		return errors.New("master input routing cancelledAt must be normalized")
	}
	return nil
}

func validateCancelledInputRoutingState(state InputRoutingState) error {
	if state.RoutingStartedAt != nil || state.Decision != nil || state.Cancellation == nil || state.Failure != nil {
		return errors.New("cancelled master input routing state is incomplete")
	}
	if err := state.Cancellation.Validate(); err != nil {
		return err
	}
	if state.Cancellation.InputID != state.Input.Input.ID ||
		state.Cancellation.RoutingAttempt != state.RoutingAttempt {
		return errors.New("cancelled master input routing state references another input attempt")
	}
	cancelled, _ := time.Parse(time.RFC3339Nano, state.Cancellation.CancelledAt)
	accepted, _ := time.Parse(time.RFC3339Nano, state.Input.AcceptedAt)
	if cancelled.Before(accepted) {
		return errors.New("master input routing cancellation precedes input acceptance")
	}
	return nil
}
