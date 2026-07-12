package master

import (
	"encoding/json"
	"fmt"
	"reflect"
)

func validRouteDecisionKind(kind RouteDecisionKind) bool {
	switch kind {
	case RouteDecisionKindSendToAgent,
		RouteDecisionKindQueueAgentTurn,
		RouteDecisionKindSteerActiveTurn,
		RouteDecisionKindAskNarrator,
		RouteDecisionKindFocusConversation,
		RouteDecisionKindCreateConversation,
		RouteDecisionKindCreateSideConversation,
		RouteDecisionKindForkConversation,
		RouteDecisionKindClarify,
		RouteDecisionKindAnswerGlobal:
		return true
	default:
		return false
	}
}

func RouteDecisionEventID(inputID string) string {
	return "master-route-decided:" + inputID
}

func RouteRoutingEventID(stage string, inputID string, attempt int) string {
	return fmt.Sprintf("master-route-%s:%s:%d", stage, inputID, attempt)
}

func RouteInvocationAttemptEventID(inputID string, attempt int) string {
	return fmt.Sprintf("master-route-invocation-attempted:%s:%d", inputID, attempt)
}

func EqualRouteDecisionCommit(record RouteDecisionRecord, commit RouteDecisionCommit) bool {
	if record.StreamSequence <= 0 {
		return false
	}
	existing := RouteDecisionCommit{
		ID:                 record.ID,
		MasterSessionID:    record.MasterSessionID,
		InputID:            record.InputID,
		RoutingAttempt:     record.RoutingAttempt,
		Context:            record.Context,
		ResolvedInvocation: record.ResolvedInvocation,
		InvocationAttempt:  record.InvocationAttempt,
		Decision:           record.Decision,
		ResultingCommand:   record.ResultingCommand,
		DecidedAt:          record.DecidedAt,
	}
	return reflect.DeepEqual(existing, commit)
}

func CloneRouteDecisionRecord(record RouteDecisionRecord) RouteDecisionRecord {
	record.Context = cloneRouteContextAudit(record.Context)
	record.ResolvedInvocation = cloneRouteInvocationAudit(record.ResolvedInvocation)
	record.InvocationAttempt = CloneRouteInvocationAttempt(record.InvocationAttempt)
	record.Decision = cloneRouteDecision(record.Decision)
	record.ResultingCommand = cloneRouteCommand(record.ResultingCommand)
	return record
}

func cloneRouteCommand(command RouteCommand) RouteCommand {
	command.SendToAgent = cloneRoutePayload(command.SendToAgent)
	command.QueueAgentTurn = cloneRoutePayload(command.QueueAgentTurn)
	command.SteerActiveTurn = cloneRoutePayload(command.SteerActiveTurn)
	command.AskNarrator = cloneRoutePayload(command.AskNarrator)
	command.FocusConversation = cloneRoutePayload(command.FocusConversation)
	command.CreateConversation = cloneRoutePayload(command.CreateConversation)
	command.CreateSideConversation = cloneRoutePayload(command.CreateSideConversation)
	command.ForkConversation = cloneRoutePayload(command.ForkConversation)
	command.Clarify = cloneRoutePayload(command.Clarify)
	command.AnswerGlobal = cloneRoutePayload(command.AnswerGlobal)
	if command.SendToAgent != nil {
		command.SendToAgent.Target = clonePresentationTarget(command.SendToAgent.Target)
	}
	if command.QueueAgentTurn != nil {
		command.QueueAgentTurn.Target = clonePresentationTarget(command.QueueAgentTurn.Target)
	}
	if command.SteerActiveTurn != nil {
		command.SteerActiveTurn.Target = clonePresentationTarget(command.SteerActiveTurn.Target)
	}
	if command.AskNarrator != nil {
		command.AskNarrator.Target = clonePresentationTarget(command.AskNarrator.Target)
	}
	if command.FocusConversation != nil {
		command.FocusConversation.Target = clonePresentationTarget(command.FocusConversation.Target)
	}
	if command.CreateConversation != nil {
		command.CreateConversation.Target = clonePresentationTarget(command.CreateConversation.Target)
	}
	if command.CreateSideConversation != nil {
		command.CreateSideConversation.Target = clonePresentationTarget(command.CreateSideConversation.Target)
	}
	if command.ForkConversation != nil {
		command.ForkConversation.Target = clonePresentationTarget(command.ForkConversation.Target)
	}
	return command
}

func clonePresentationTarget(target ConversationPresentationTarget) ConversationPresentationTarget {
	target.PreferredPaneID = cloneString(target.PreferredPaneID)
	return target
}

func ClonePresentationIntent(intent PresentationIntent) PresentationIntent {
	intent.OriginatingWorkspaceID = cloneString(intent.OriginatingWorkspaceID)
	intent.OriginatingConversationID = cloneString(intent.OriginatingConversationID)
	intent.OriginatingPaneID = cloneString(intent.OriginatingPaneID)
	intent.OriginatingConversationInputID = cloneString(intent.OriginatingConversationInputID)
	intent.FocusExistingConversationPane = cloneRoutePayload(intent.FocusExistingConversationPane)
	intent.OpenConversationPane = cloneRoutePayload(intent.OpenConversationPane)
	intent.OpenSideConversation = cloneRoutePayload(intent.OpenSideConversation)
	intent.ShowMasterReply = cloneRoutePayload(intent.ShowMasterReply)
	if intent.FocusExistingConversationPane != nil {
		intent.FocusExistingConversationPane.Target = clonePresentationTarget(intent.FocusExistingConversationPane.Target)
	}
	if intent.OpenConversationPane != nil {
		intent.OpenConversationPane.Target = clonePresentationTarget(intent.OpenConversationPane.Target)
	}
	if intent.OpenSideConversation != nil {
		intent.OpenSideConversation.Target = clonePresentationTarget(intent.OpenSideConversation.Target)
	}
	return intent
}

func CloneInputRoutingState(state InputRoutingState) InputRoutingState {
	state.Input = CloneAcceptedInput(state.Input)
	state.RoutingStartedAt = cloneString(state.RoutingStartedAt)
	if state.Decision != nil {
		cloned := CloneRouteDecisionRecord(*state.Decision)
		state.Decision = &cloned
	}
	if state.Cancellation != nil {
		cloned := *state.Cancellation
		if state.Cancellation.InvocationAttempt != nil {
			attempt := CloneRouteInvocationAttempt(*state.Cancellation.InvocationAttempt)
			cloned.InvocationAttempt = &attempt
		}
		state.Cancellation = &cloned
	}
	if state.Failure != nil {
		cloned := *state.Failure
		state.Failure = &cloned
	}
	if state.InvocationAttempt != nil {
		attempt := CloneRouteInvocationAttempt(*state.InvocationAttempt)
		state.InvocationAttempt = &attempt
	}
	return state
}

func CloneRouteInvocationAttempt(attempt RouteInvocationAttempt) RouteInvocationAttempt {
	attempt.MasterSessionID = cloneString(attempt.MasterSessionID)
	attempt.Context = cloneRouteContextAuditPointer(attempt.Context)
	if attempt.Configuration != nil {
		configuration := cloneRouteModelConfigurationAudit(*attempt.Configuration)
		attempt.Configuration = &configuration
	}
	attempt.ProviderRequestID = cloneString(attempt.ProviderRequestID)
	attempt.ProviderThreadID = cloneString(attempt.ProviderThreadID)
	attempt.ProviderTurnID = cloneString(attempt.ProviderTurnID)
	if attempt.DecisionKind != nil {
		kind := *attempt.DecisionKind
		attempt.DecisionKind = &kind
	}
	if attempt.Failure != nil {
		failure := *attempt.Failure
		attempt.Failure = &failure
	}
	return attempt
}

func cloneRouteContextAuditPointer(value *RouteContextAudit) *RouteContextAudit {
	if value == nil {
		return nil
	}
	cloned := cloneRouteContextAudit(*value)
	return &cloned
}

func cloneRouteModelConfigurationAudit(audit RouteModelConfigurationAudit) RouteModelConfigurationAudit {
	audit.RequestedProfile = append(json.RawMessage{}, audit.RequestedProfile...)
	audit.RequestedServiceTier = cloneString(audit.RequestedServiceTier)
	audit.ResolvedServiceTier = cloneString(audit.ResolvedServiceTier)
	return audit
}

func cloneRouteDecision(decision RouteDecision) RouteDecision {
	decision.SendToAgent = cloneRoutePayload(decision.SendToAgent)
	decision.QueueAgentTurn = cloneRoutePayload(decision.QueueAgentTurn)
	decision.SteerActiveTurn = cloneRoutePayload(decision.SteerActiveTurn)
	decision.AskNarrator = cloneRoutePayload(decision.AskNarrator)
	decision.FocusConversation = cloneRoutePayload(decision.FocusConversation)
	decision.CreateConversation = cloneRoutePayload(decision.CreateConversation)
	decision.CreateSideConversation = cloneRoutePayload(decision.CreateSideConversation)
	decision.ForkConversation = cloneRoutePayload(decision.ForkConversation)
	decision.Clarify = cloneRoutePayload(decision.Clarify)
	decision.AnswerGlobal = cloneRoutePayload(decision.AnswerGlobal)
	return decision
}

func cloneRoutePayload[T any](value *T) *T {
	if value == nil {
		return nil
	}
	cloned := *value
	return &cloned
}

func cloneRouteContextAudit(audit RouteContextAudit) RouteContextAudit {
	audit.RetrievedCandidates = append([]RouteCandidateAudit{}, audit.RetrievedCandidates...)
	for index := range audit.RetrievedCandidates {
		if audit.RetrievedCandidates[index].LexicalRank != nil {
			rank := *audit.RetrievedCandidates[index].LexicalRank
			audit.RetrievedCandidates[index].LexicalRank = &rank
		}
	}
	audit.IncludedCandidateIDs = append([]string{}, audit.IncludedCandidateIDs...)
	audit.ActiveWorkspaceIDs = append([]string{}, audit.ActiveWorkspaceIDs...)
	audit.FocusedWorkspaceID = cloneString(audit.FocusedWorkspaceID)
	audit.FocusedConversationID = cloneString(audit.FocusedConversationID)
	audit.OriginatingConversationID = cloneString(audit.OriginatingConversationID)
	audit.TargetAuthorities = append([]RouteTargetAuthority{}, audit.TargetAuthorities...)
	for index := range audit.TargetAuthorities {
		audit.TargetAuthorities[index].AllowedDecisionKinds = append(
			[]RouteDecisionKind{},
			audit.TargetAuthorities[index].AllowedDecisionKinds...,
		)
		audit.TargetAuthorities[index].CompletedForkTurnIDs = append(
			[]string{},
			audit.TargetAuthorities[index].CompletedForkTurnIDs...,
		)
	}
	return audit
}

func cloneRouteInvocationAudit(audit RouteInvocationAudit) RouteInvocationAudit {
	audit.Configuration.RequestedProfile = append(
		json.RawMessage{},
		audit.Configuration.RequestedProfile...,
	)
	audit.Configuration.RequestedServiceTier = cloneString(audit.Configuration.RequestedServiceTier)
	audit.Configuration.ResolvedServiceTier = cloneString(audit.Configuration.ResolvedServiceTier)
	return audit
}
