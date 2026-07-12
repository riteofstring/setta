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
		DecidedAt:          record.DecidedAt,
	}
	return reflect.DeepEqual(existing, commit)
}

func CloneRouteDecisionRecord(record RouteDecisionRecord) RouteDecisionRecord {
	record.Context = cloneRouteContextAudit(record.Context)
	record.ResolvedInvocation = cloneRouteInvocationAudit(record.ResolvedInvocation)
	record.Decision = cloneRouteDecision(record.Decision)
	return record
}

func CloneInputRoutingState(state InputRoutingState) InputRoutingState {
	state.Input = CloneAcceptedInput(state.Input)
	state.RoutingStartedAt = cloneString(state.RoutingStartedAt)
	if state.Decision != nil {
		cloned := CloneRouteDecisionRecord(*state.Decision)
		state.Decision = &cloned
	}
	if state.Failure != nil {
		cloned := *state.Failure
		state.Failure = &cloned
	}
	return state
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
