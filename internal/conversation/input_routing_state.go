package conversation

import "errors"

func validateConversationInputRoutingStateLifecycle(state ConversationInputRoutingState) error {
	switch state.Input.Status {
	case ConversationInputStatusAccepted, ConversationInputStatusRouting:
		return validatePendingConversationInputRoutingState(state)
	case ConversationInputStatusFailed:
		return validateFailedConversationInputRoutingState(state)
	case ConversationInputStatusAwaitingClarification:
		return validateAwaitingConversationInputRoutingState(state)
	case ConversationInputStatusDispatched:
		return validateDispatchedConversationInputRoutingState(state)
	}
	return nil
}

func validatePendingConversationInputRoutingState(state ConversationInputRoutingState) error {
	if len(state.Decisions) != 0 {
		return errors.New("pending conversation input contains a committed route decision")
	}
	if state.ClarificationReply != nil {
		return errors.New("pending conversation input contains a clarification reply")
	}
	return nil
}

func validateFailedConversationInputRoutingState(state ConversationInputRoutingState) error {
	if state.Input.Failure == nil {
		return errors.New("failed conversation input routing state requires a failure")
	}
	if state.Input.Failure.Retryable {
		return validatePendingConversationInputRoutingState(state)
	}
	if err := validateDiscardedConversationInputRoutingDecisions(state); err != nil {
		return err
	}
	return validateDiscardedConversationInputRoutingReply(state.ClarificationReply)
}

func validateDiscardedConversationInputRoutingDecisions(state ConversationInputRoutingState) error {
	if len(state.Decisions) > 1 {
		return errors.New("discarded conversation input contains multiple route decisions")
	}
	if len(state.Decisions) == 1 && state.Decisions[0].Decision.Kind != ConversationRouteDecisionKindClarify {
		return errors.New("discarded conversation input contains a final route decision")
	}
	return nil
}

func validateDiscardedConversationInputRoutingReply(reply *ConversationInputState) error {
	if reply == nil {
		return nil
	}
	if reply.Status != ConversationInputStatusFailed {
		return errors.New("discarded clarification exchange contains a pending reply")
	}
	if reply.Failure == nil {
		return errors.New("discarded clarification reply has no failure")
	}
	if reply.Failure.Retryable {
		return errors.New("discarded clarification reply is retryable")
	}
	if reply.Failure.Code != ConversationInputDiscardedFailureCode {
		return errors.New("discarded clarification reply has the wrong failure code")
	}
	return nil
}

func validateAwaitingConversationInputRoutingState(state ConversationInputRoutingState) error {
	if len(state.Decisions) != 1 {
		return errors.New("conversation input awaiting clarification requires one decision")
	}
	if state.Decisions[0].Decision.Kind != ConversationRouteDecisionKindClarify {
		return errors.New("conversation input awaiting clarification requires a clarification decision")
	}
	if state.ClarificationReply != nil {
		switch state.ClarificationReply.Status {
		case ConversationInputStatusAccepted, ConversationInputStatusRouting:
		case ConversationInputStatusFailed:
			if state.ClarificationReply.Failure == nil || !state.ClarificationReply.Failure.Retryable {
				return errors.New("conversation input awaiting clarification contains a terminal reply")
			}
		default:
			return errors.New("conversation input awaiting clarification contains a resolved reply")
		}
	}
	return nil
}

func validateDispatchedConversationInputRoutingState(state ConversationInputRoutingState) error {
	if len(state.Decisions) == 0 {
		return errors.New("dispatched conversation input requires a route decision")
	}
	if state.Decisions[len(state.Decisions)-1].Decision.Kind == ConversationRouteDecisionKindClarify {
		return errors.New("dispatched conversation input requires a final route decision")
	}
	if state.ClarificationReply == nil {
		if len(state.Decisions) != 1 {
			return errors.New("dispatched conversation input without clarification requires one decision")
		}
		return nil
	}
	if len(state.Decisions) != 2 {
		return errors.New("dispatched clarification exchange requires two decisions")
	}
	if state.ClarificationReply.Status != ConversationInputStatusDispatched {
		return errors.New("dispatched clarification exchange contains a pending reply")
	}
	return nil
}
