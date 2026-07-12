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

func conversationRouteCommandKey(commit ConversationRouteDecisionCommit) (string, error) {
	switch commit.ResultingCommand.Kind {
	case ConversationRouteDecisionKindSendToParent:
		return "conversation_turn:" + commit.ResultingCommand.SendToParent.TurnID, nil
	case ConversationRouteDecisionKindQueueParentTurn:
		return "conversation_turn:" + commit.ResultingCommand.QueueParentTurn.TurnID, nil
	case ConversationRouteDecisionKindSteerParentTurn:
		return "conversation_steering:" + commit.ID, nil
	case ConversationRouteDecisionKindAnswerAsNarrator:
		return "narrator_request:" + commit.ResultingCommand.AnswerAsNarrator.RequestID, nil
	case ConversationRouteDecisionKindCreateSideConversation:
		return "side_conversation:" + commit.ResultingCommand.CreateSideConversation.SideConversationID, nil
	case ConversationRouteDecisionKindForkConversation:
		return "topic_conversation:" + commit.ResultingCommand.ForkConversation.ChildConversationID, nil
	case ConversationRouteDecisionKindEscalateToMaster:
		return "master_input:" + commit.ResultingCommand.EscalateToMaster.MasterInputID, nil
	case ConversationRouteDecisionKindClarify:
		return "conversation_clarification:" + commit.ID, nil
	default:
		return "", fmt.Errorf("unsupported conversation route command kind %q", commit.ResultingCommand.Kind)
	}
}

func cloneConversationRouteDecisionRecord(record ConversationRouteDecisionRecord) ConversationRouteDecisionRecord {
	record.ClarificationInputID = cloneStringPointer(record.ClarificationInputID)
	record.RouterContext = cloneConversationRouteContextAudit(record.RouterContext)
	record.ResolvedInvocation = cloneConversationRouteResolvedInvocation(record.ResolvedInvocation)
	record.Decision = cloneConversationRouteDecision(record.Decision)
	record.ResultingCommand = cloneConversationRouteCommand(record.ResultingCommand)
	return record
}

func cloneConversationRouteDecision(decision ConversationRouteDecision) ConversationRouteDecision {
	decision.SendToParent = cloneConversationRoutePayload(decision.SendToParent)
	decision.QueueParentTurn = cloneConversationRoutePayload(decision.QueueParentTurn)
	decision.SteerParentTurn = cloneConversationRoutePayload(decision.SteerParentTurn)
	decision.AnswerAsNarrator = cloneConversationRoutePayload(decision.AnswerAsNarrator)
	decision.CreateSideConversation = cloneConversationRoutePayload(decision.CreateSideConversation)
	decision.ForkConversation = cloneConversationRoutePayload(decision.ForkConversation)
	decision.EscalateToMaster = cloneConversationRoutePayload(decision.EscalateToMaster)
	decision.Clarify = cloneConversationRoutePayload(decision.Clarify)
	return decision
}

func cloneConversationRouteCommand(command ConversationRouteCommand) ConversationRouteCommand {
	command.SendToParent = cloneConversationRoutePayload(command.SendToParent)
	command.QueueParentTurn = cloneConversationRoutePayload(command.QueueParentTurn)
	command.SteerParentTurn = cloneConversationRoutePayload(command.SteerParentTurn)
	command.AnswerAsNarrator = cloneConversationRoutePayload(command.AnswerAsNarrator)
	command.CreateSideConversation = cloneConversationRoutePayload(command.CreateSideConversation)
	command.ForkConversation = cloneConversationRoutePayload(command.ForkConversation)
	command.EscalateToMaster = cloneConversationRoutePayload(command.EscalateToMaster)
	command.Clarify = cloneConversationRoutePayload(command.Clarify)
	return command
}

func cloneConversationRoutePayload[Payload any](payload *Payload) *Payload {
	if payload == nil {
		return nil
	}
	cloned := *payload
	return &cloned
}

func cloneConversationRouteDecisionCommit(commit ConversationRouteDecisionCommit) ConversationRouteDecisionCommit {
	commit.ClarificationInputID = cloneStringPointer(commit.ClarificationInputID)
	commit.RouterContext = cloneConversationRouteContextAudit(commit.RouterContext)
	commit.ResolvedInvocation = cloneConversationRouteResolvedInvocation(commit.ResolvedInvocation)
	commit.Decision = cloneConversationRouteDecision(commit.Decision)
	commit.ResultingCommand = cloneConversationRouteCommand(commit.ResultingCommand)
	return commit
}

func cloneConversationRouteContextAudit(
	audit *ConversationRouteContextAudit,
) *ConversationRouteContextAudit {
	if audit == nil {
		return nil
	}
	cloned := *audit
	cloned.ClarificationInputSequence = cloneIntPointer(audit.ClarificationInputSequence)
	cloned.AvailableTrajectoryRange = cloneTrajectorySequenceRange(audit.AvailableTrajectoryRange)
	cloned.IncludedTrajectoryRange = cloneTrajectorySequenceRange(audit.IncludedTrajectoryRange)
	cloned.AllowedDecisionKinds = append([]ConversationRouteDecisionKind{}, audit.AllowedDecisionKinds...)
	return &cloned
}

func cloneConversationRouteResolvedInvocation(invocation *ResolvedInvocation) *ResolvedInvocation {
	if invocation == nil {
		return nil
	}
	cloned := *invocation
	cloned.Requested.ModelSelection.ModelID = cloneStringPointer(invocation.Requested.ModelSelection.ModelID)
	cloned.Requested.ServiceTier = cloneStringPointer(invocation.Requested.ServiceTier)
	cloned.Requested.PermissionProfile.ToolAccess.AllowedTools = append(
		[]string{},
		invocation.Requested.PermissionProfile.ToolAccess.AllowedTools...,
	)
	cloned.Resolved.ServiceTier = cloneStringPointer(invocation.Resolved.ServiceTier)
	cloned.Resolved.PermissionProfile.ToolAccess.AllowedTools = append(
		[]string{},
		invocation.Resolved.PermissionProfile.ToolAccess.AllowedTools...,
	)
	cloned.ProviderReferences.ThreadID = cloneStringPointer(invocation.ProviderReferences.ThreadID)
	cloned.ProviderReferences.TurnID = cloneStringPointer(invocation.ProviderReferences.TurnID)
	cloned.ProviderReferences.RequestID = cloneStringPointer(invocation.ProviderReferences.RequestID)
	cloned.ProviderReferences.ResponseID = cloneStringPointer(invocation.ProviderReferences.ResponseID)
	cloned.ModelReroutes = append([]InvocationModelReroute{}, invocation.ModelReroutes...)
	cloned.EndedAt = cloneStringPointer(invocation.EndedAt)
	if invocation.Failure != nil {
		failure := *invocation.Failure
		cloned.Failure = &failure
	}
	return &cloned
}

func cloneIntPointer(value *int) *int {
	if value == nil {
		return nil
	}
	cloned := *value
	return &cloned
}

func cloneTrajectorySequenceRange(value *TrajectorySequenceRange) *TrajectorySequenceRange {
	if value == nil {
		return nil
	}
	cloned := *value
	return &cloned
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
