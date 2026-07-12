package conversation

import (
	"errors"
	"fmt"
)

func (failure ConversationInputRoutingFailure) Validate() error {
	if err := validateConversationInputReference("conversation input routing failure conversation id", failure.ConversationID); err != nil {
		return err
	}
	if err := ValidateConversationInputID(failure.InputID); err != nil {
		return err
	}
	if failure.ClarificationInputID != nil {
		if err := ValidateConversationInputID(*failure.ClarificationInputID); err != nil {
			return err
		}
	}
	if failure.RoutingAttempt <= 0 {
		return errors.New("conversation input routing failure attempt must be positive")
	}
	if err := failure.Failure.Validate(); err != nil {
		return err
	}
	_, err := validateTimestamp("conversation input routing failedAt", failure.FailedAt)
	return err
}

func validateConversationRouteDecisionID(id string) error {
	return validateBoundedConversationInputIdentifier(
		"conversation route decision id",
		id,
		MaxConversationRouteDecisionIDBytes,
	)
}

func validateConversationRouteAuthoredInput(input AuthoredInput) error {
	if err := input.Validate(); err != nil {
		return err
	}
	if len(input.Text) > MaxAuthoredInputBytes {
		return fmt.Errorf("conversation route authored input exceeds %d bytes", MaxAuthoredInputBytes)
	}
	return nil
}

func validateConversationRouteQuestion(label string, question string) error {
	if err := validateTrimmedText(label, question); err != nil {
		return err
	}
	if len(question) > MaxConversationRouteQuestionBytes {
		return fmt.Errorf("%s exceeds %d bytes", label, MaxConversationRouteQuestionBytes)
	}
	return nil
}

func validConversationRouteDecisionSource(source ConversationRouteDecisionSource) bool {
	switch source {
	case ConversationRouteDecisionSourceRouter, ConversationRouteDecisionSourceExplicit:
		return true
	default:
		return false
	}
}

func cloneConversationRouteDecisionRecord(record ConversationRouteDecisionRecord) ConversationRouteDecisionRecord {
	record.ClarificationInputID = cloneStringPointer(record.ClarificationInputID)
	return record
}

func cloneConversationInputRoutingWork(work ConversationInputRoutingWork) ConversationInputRoutingWork {
	work.Input = CloneAcceptedConversationInput(work.Input)
	if work.ClarificationReply != nil {
		reply := CloneAcceptedConversationInput(*work.ClarificationReply)
		work.ClarificationReply = &reply
	}
	if work.PriorClarification != nil {
		clarification := cloneConversationRouteDecisionRecord(*work.PriorClarification)
		work.PriorClarification = &clarification
	}
	return work
}

func cloneConversationInputState(state ConversationInputState) ConversationInputState {
	state.Input = cloneConversationInput(state.Input)
	state.RoutingStartedAt = cloneStringPointer(state.RoutingStartedAt)
	if state.Failure != nil {
		failure := *state.Failure
		state.Failure = &failure
	}
	return state
}

func cloneConversationInputRoutingState(state ConversationInputRoutingState) ConversationInputRoutingState {
	state.Input = cloneConversationInputState(state.Input)
	if state.ClarificationReply != nil {
		reply := cloneConversationInputState(*state.ClarificationReply)
		state.ClarificationReply = &reply
	}
	state.Decisions = append([]ConversationRouteDecisionRecord{}, state.Decisions...)
	for index := range state.Decisions {
		state.Decisions[index] = cloneConversationRouteDecisionRecord(state.Decisions[index])
	}
	return state
}
