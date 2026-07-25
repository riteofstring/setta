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
		Decision:           record.Decision,
		ResultingCommand:   record.ResultingCommand,
		DecidedAt:          record.DecidedAt,
	}
	return reflect.DeepEqual(existing, commit)
}

func CloneRouteDecisionRecord(record RouteDecisionRecord) RouteDecisionRecord {
	record.Context = cloneRouteContextAudit(record.Context)
	record.ResolvedInvocation = cloneRouteInvocationAudit(record.ResolvedInvocation)
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
	if command.Clarify != nil {
		command.Clarify.CandidateTargetIDs = append([]string{}, command.Clarify.CandidateTargetIDs...)
	}
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
	target.ResourceScope = cloneRouteResourceScope(target.ResourceScope)
	target.ResourceBindings = clonePresentationResourceBindings(target.ResourceBindings)
	return target
}

func clonePresentationResourceBindings(
	bindings []PresentationResourceBinding,
) []PresentationResourceBinding {
	if bindings == nil {
		return nil
	}
	cloned := append([]PresentationResourceBinding{}, bindings...)
	for index := range cloned {
		if cloned[index].Folder != nil {
			folder := *cloned[index].Folder
			cloned[index].Folder = &folder
		}
	}
	return cloned
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
		state.Cancellation = &cloned
	}
	if state.Failure != nil {
		cloned := *state.Failure
		state.Failure = &cloned
	}
	return state
}

func CloneInputRoutingWork(work InputRoutingWork) InputRoutingWork {
	work.Input = CloneAcceptedInput(work.Input)
	if work.PriorClarification != nil {
		prior := CloneRouteDecisionRecord(*work.PriorClarification)
		work.PriorClarification = &prior
	}
	return work
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
	if decision.CreateConversation != nil {
		decision.CreateConversation.ResourceScope = cloneRouteResourceScope(decision.CreateConversation.ResourceScope)
	}
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
		audit.RetrievedCandidates[index].ResourceScope = cloneRouteResourceScope(
			audit.RetrievedCandidates[index].ResourceScope,
		)
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
	if audit.Clarification != nil {
		clarification := *audit.Clarification
		clarification.CandidateTargetIDs = append([]string{}, clarification.CandidateTargetIDs...)
		audit.Clarification = &clarification
	}
	audit.TargetAuthorities = append([]RouteTargetAuthority{}, audit.TargetAuthorities...)
	for index := range audit.TargetAuthorities {
		audit.TargetAuthorities[index].ResourceScope = cloneRouteResourceScope(
			audit.TargetAuthorities[index].ResourceScope,
		)
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
