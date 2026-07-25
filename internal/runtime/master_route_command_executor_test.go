package runtime

import (
	"context"
	"encoding/json"
	"errors"
	"testing"

	"setta/internal/conversation"
	"setta/internal/master"
	"setta/internal/narration"
)

func TestMasterRouteCommandExecutorCompletesPersistedNarratorDegradation(t *testing.T) {
	degradation := conversation.NarratorDegradation{
		Code:                "provider_unavailable",
		Message:             "Narrator status is temporarily unavailable.",
		Retryable:           true,
		DiagnosticReference: "narrator_diagnostic_master_test",
		DegradedAt:          "2026-07-14T20:00:01Z",
	}
	store := &masterRouteCommandExecutorStore{
		applied: []bool{false, false},
		snapshot: conversation.ConversationSnapshot{
			NarratorState: conversation.NarratorState{
				Status:      conversation.NarratorStatusDegraded,
				Degradation: &degradation,
			},
		},
	}
	narratorService := &routeCommandExecutorNarrator{
		err: &narration.DegradedError{
			RequestID:   "master_narrator_status_test",
			Generation:  1,
			Degradation: degradation,
			Cause:       errors.New("provider unavailable"),
		},
	}
	executor, err := newMasterRouteCommandExecutor(
		store,
		&masterRouteCommandExecutorConversations{},
		narratorService,
	)
	if err != nil {
		t.Fatalf("newMasterRouteCommandExecutor: %v", err)
	}

	if err := executor.ExecuteMasterRouteCommand(
		context.Background(),
		masterRoutedNarratorStatusDecisionRecord(),
		nil,
	); err != nil {
		t.Fatalf("ExecuteMasterRouteCommand: %v", err)
	}
	if store.appliedCalls != 2 || store.snapshotReads != 1 || narratorService.calls != 1 {
		t.Fatalf(
			"executor calls = applied:%d snapshots:%d narrator:%d",
			store.appliedCalls,
			store.snapshotReads,
			narratorService.calls,
		)
	}
}

func masterRoutedNarratorStatusDecisionRecord() master.RouteDecisionRecord {
	decision := master.RouteDecision{
		Kind: master.RouteDecisionKindAskNarrator,
		AskNarrator: &master.MasterAskNarratorRouteDecision{
			ConversationID: "conversation_test",
			Question:       "What is the current status?",
		},
	}
	return master.RouteDecisionRecord{
		StreamSequence:  1,
		ID:              "master_route_decision_test",
		MasterSessionID: "master_session_test",
		InputID:         "master_input_test",
		RoutingAttempt:  1,
		Context: master.RouteContextAudit{
			InputSequence:        1,
			RetrievedCandidates:  []master.RouteCandidateAudit{},
			IncludedCandidateIDs: []string{},
			ActiveWorkspaceIDs:   []string{"workspace_test"},
			TargetAuthorities: []master.RouteTargetAuthority{{
				ConversationID:       "conversation_test",
				WorkspaceID:          "workspace_test",
				AllowedDecisionKinds: []master.RouteDecisionKind{master.RouteDecisionKindAskNarrator},
				CompletedForkTurnIDs: []string{},
			}},
		},
		ResolvedInvocation: master.RouteInvocationAudit{
			Configuration: master.RouteModelConfigurationAudit{
				RequestedProfile:         json.RawMessage(`{"role":"master"}`),
				RequestedModel:           "gpt-master-test",
				ResolvedModel:            "gpt-master-test",
				RequestedReasoningEffort: "medium",
				ResolvedReasoningEffort:  "medium",
				RequestedPermissionMode:  "read_only",
				ResolvedPermissionMode:   "read_only",
				RequestedApprovalMode:    "never",
				ResolvedApprovalMode:     "never",
				MaxInputBytes:            1024,
			},
			ProviderRequestID: "master_route_request_test",
			ProviderThreadID:  "master_route_thread_test",
			ProviderTurnID:    "master_route_turn_test",
			StartedAt:         "2026-07-14T19:59:59Z",
			EndedAt:           "2026-07-14T20:00:00Z",
		},
		Decision: decision,
		ResultingCommand: master.RouteCommand{
			Kind: master.RouteDecisionKindAskNarrator,
			AskNarrator: &master.MasterAskNarratorRouteCommand{
				Target: master.ConversationPresentationTarget{
					WorkspaceID:    "workspace_test",
					ConversationID: "conversation_test",
					Title:          "Test conversation",
				},
				RequestID: "master_narrator_status_test",
				Question:  "What is the current status?",
			},
		},
		DecidedAt: "2026-07-14T20:00:00Z",
	}
}

type masterRouteCommandExecutorStore struct {
	applied       []bool
	appliedCalls  int
	snapshot      conversation.ConversationSnapshot
	snapshotReads int
}

func (store *masterRouteCommandExecutorStore) MasterRouteCommandApplied(
	_ context.Context,
	_ master.RouteDecisionRecord,
) (bool, error) {
	index := store.appliedCalls
	store.appliedCalls++
	if index >= len(store.applied) {
		return false, errors.New("unexpected master route command effect read")
	}
	return store.applied[index], nil
}

func (store *masterRouteCommandExecutorStore) ReadSnapshot(
	_ context.Context,
	_ string,
	_ string,
) (conversation.ConversationSnapshot, error) {
	store.snapshotReads++
	return store.snapshot, nil
}

type masterRouteCommandExecutorConversations struct{}

func (*masterRouteCommandExecutorConversations) ExecuteMasterRouteCommand(
	context.Context,
	string,
	master.RouteCommand,
	*string,
) (conversation.ConversationSnapshot, error) {
	return conversation.ConversationSnapshot{}, errors.New("unexpected master conversation command")
}
