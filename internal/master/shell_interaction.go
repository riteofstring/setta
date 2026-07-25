package master

import (
	"errors"
	"fmt"
)

// ShellInteractionFailure contains only failure details safe for the action
// overlay. Diagnostic references remain in the backend-owned routing record.
type ShellInteractionFailure struct {
	Code      string `json:"code"`
	Message   string `json:"message"`
	Retryable bool   `json:"retryable"`
}

// ShellInteractionState is the renderer-safe projection of one shell request.
// Provider ids, model configuration, route context, and audit sequences are
// deliberately absent.
type ShellInteractionState struct {
	Input    MasterInput              `json:"input"`
	Status   InputRoutingStatus       `json:"status"`
	Decision *RouteDecision           `json:"decision"`
	Failure  *ShellInteractionFailure `json:"failure"`
}

// ActiveShellInteraction contains only shell state that may be restored into
// the action overlay. Completed answers remain durable for routing context and
// audit but are deliberately absent.
type ActiveShellInteraction struct {
	State *ShellInteractionState `json:"state"`
}

func (failure ShellInteractionFailure) Validate() error {
	if err := validateBoundedIdentifier("master shell interaction failure code", failure.Code, MaxRouteReferenceBytes); err != nil {
		return err
	}
	return validateRouteText(
		"master shell interaction failure message",
		failure.Message,
		MaxRouteFailureMessageBytes,
	)
}

func (state ShellInteractionState) Validate() error {
	normalized, err := NormalizeInput(state.Input)
	if err != nil {
		return err
	}
	if !EqualInputs(normalized, state.Input) {
		return errors.New("master shell interaction input is not normalized")
	}
	if state.Input.Source != MasterInputSourceShell {
		return errors.New("master shell interaction contains a conversation escalation")
	}
	return validateShellInteractionResult(state)
}

func validateShellInteractionResult(state ShellInteractionState) error {
	switch state.Status {
	case InputRoutingStatusAccepted, InputRoutingStatusRouting:
		return validateUnsettledShellInteraction(state)
	case InputRoutingStatusDecided:
		return validateDecidedShellInteraction(state)
	case InputRoutingStatusCancelled:
		return validateCancelledShellInteraction(state)
	case InputRoutingStatusFailed:
		return validateFailedShellInteraction(state)
	default:
		return fmt.Errorf("unsupported master shell interaction status %q", state.Status)
	}
}

func validateCancelledShellInteraction(state ShellInteractionState) error {
	if state.Decision != nil || state.Failure != nil {
		return errors.New("cancelled master shell interaction cannot contain a result")
	}
	return nil
}

func validateUnsettledShellInteraction(state ShellInteractionState) error {
	if state.Decision != nil || state.Failure != nil {
		return fmt.Errorf("master shell interaction status %q cannot contain a result", state.Status)
	}
	return nil
}

func validateDecidedShellInteraction(state ShellInteractionState) error {
	if state.Decision == nil || state.Failure != nil {
		return errors.New("decided master shell interaction requires exactly one decision")
	}
	return state.Decision.Validate()
}

func validateFailedShellInteraction(state ShellInteractionState) error {
	if state.Decision != nil || state.Failure == nil {
		return errors.New("failed master shell interaction requires exactly one failure")
	}
	return state.Failure.Validate()
}

func (interaction ActiveShellInteraction) Validate() error {
	if interaction.State == nil {
		return nil
	}
	if err := interaction.State.Validate(); err != nil {
		return err
	}
	if !IsRestorableShellInteractionState(*interaction.State) {
		return fmt.Errorf(
			"master input routing status %q is not a restorable shell interaction",
			interaction.State.Status,
		)
	}
	return nil
}

func ProjectShellInteractionState(state InputRoutingState) (ShellInteractionState, error) {
	if err := state.Validate(); err != nil {
		return ShellInteractionState{}, err
	}
	projected := ShellInteractionState{
		Input:  cloneInput(state.Input.Input),
		Status: state.Status,
	}
	if state.Decision != nil {
		decision := cloneRouteDecision(state.Decision.Decision)
		projected.Decision = &decision
	}
	if state.Failure != nil {
		projected.Failure = &ShellInteractionFailure{
			Code:      state.Failure.Code,
			Message:   state.Failure.Message,
			Retryable: state.Failure.Retryable,
		}
	}
	if err := projected.Validate(); err != nil {
		return ShellInteractionState{}, err
	}
	return projected, nil
}

func IsRestorableShellInteractionState(state ShellInteractionState) bool {
	switch state.Status {
	case InputRoutingStatusAccepted, InputRoutingStatusRouting:
		return true
	case InputRoutingStatusDecided:
		return state.Decision != nil &&
			(state.Decision.Kind == RouteDecisionKindClarify || RouteDecisionRequiresNavigation(*state.Decision))
	case InputRoutingStatusCancelled:
		return false
	case InputRoutingStatusFailed:
		return false
	default:
		return false
	}
}

func RouteDecisionRequiresNavigation(decision RouteDecision) bool {
	switch decision.Kind {
	case RouteDecisionKindSendToAgent,
		RouteDecisionKindQueueAgentTurn,
		RouteDecisionKindSteerActiveTurn,
		RouteDecisionKindAskNarrator,
		RouteDecisionKindFocusConversation,
		RouteDecisionKindCreateConversation,
		RouteDecisionKindCreateSideConversation,
		RouteDecisionKindForkConversation:
		return true
	case RouteDecisionKindClarify, RouteDecisionKindAnswerGlobal:
		return false
	default:
		return false
	}
}

func CloneShellInteractionState(state ShellInteractionState) ShellInteractionState {
	state.Input = cloneInput(state.Input)
	if state.Decision != nil {
		decision := cloneRouteDecision(*state.Decision)
		state.Decision = &decision
	}
	if state.Failure != nil {
		failure := *state.Failure
		state.Failure = &failure
	}
	return state
}

func CloneActiveShellInteraction(interaction ActiveShellInteraction) ActiveShellInteraction {
	if interaction.State == nil {
		return ActiveShellInteraction{}
	}
	state := CloneShellInteractionState(*interaction.State)
	return ActiveShellInteraction{State: &state}
}
