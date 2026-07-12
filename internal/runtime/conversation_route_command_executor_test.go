package runtime

import (
	"context"
	"errors"
	"testing"

	"setta/internal/conversation"
	"setta/internal/narration"
)

func TestConversationRouteCommandExecutorCompletesPersistedNarratorDegradation(t *testing.T) {
	degradation := conversation.NarratorDegradation{
		Code:                "provider_unavailable",
		Message:             "Narrator status is temporarily unavailable.",
		Retryable:           true,
		DiagnosticReference: "narrator_diagnostic_test",
		DegradedAt:          "2026-07-13T20:00:01Z",
	}
	store := &routeCommandExecutorStore{
		applied: []bool{false, false},
		snapshot: conversation.ConversationSnapshot{
			NarratorState: conversation.NarratorState{
				Status:      conversation.NarratorStatusDegraded,
				Degradation: &degradation,
			},
		},
		workspaceID: "workspace_test",
	}
	narratorService := &routeCommandExecutorNarrator{
		err: &narration.DegradedError{
			RequestID:   "narrator_status_test",
			Generation:  1,
			Degradation: degradation,
			Cause:       errors.New("provider unavailable"),
		},
	}
	executor, err := newConversationRouteCommandExecutor(
		store,
		&routeCommandExecutorConversations{},
		narratorService,
	)
	if err != nil {
		t.Fatalf("newConversationRouteCommandExecutor: %v", err)
	}

	if err := executor.ExecuteConversationRouteCommand(
		context.Background(),
		routedNarratorStatusDecisionRecord(),
	); err != nil {
		t.Fatalf("ExecuteConversationRouteCommand: %v", err)
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

func TestConversationRouteCommandExecutorRejectsMissingAtomicMasterEffect(t *testing.T) {
	store := &routeCommandExecutorStore{
		applied:     []bool{false, false},
		workspaceID: "workspace_test",
	}
	executor, err := newConversationRouteCommandExecutor(
		store,
		&routeCommandExecutorConversations{},
		&routeCommandExecutorNarrator{},
	)
	if err != nil {
		t.Fatalf("newConversationRouteCommandExecutor: %v", err)
	}
	record := routedNarratorStatusDecisionRecord()
	record.Decision = conversation.ConversationRouteDecision{
		Kind: conversation.ConversationRouteDecisionKindEscalateToMaster,
		EscalateToMaster: &conversation.EscalateToMasterConversationRouteDecision{
			Input: conversation.AuthoredInput{Text: "Escalate this request."},
		},
	}
	record.ResultingCommand = conversation.ConversationRouteCommand{
		Kind: conversation.ConversationRouteDecisionKindEscalateToMaster,
		EscalateToMaster: &conversation.EscalateToMasterConversationRouteCommand{
			MasterInputID: "master_input_test",
			Input:         conversation.AuthoredInput{Text: "Escalate this request."},
		},
	}

	err = executor.ExecuteConversationRouteCommand(context.Background(), record)
	if err == nil {
		t.Fatal("ExecuteConversationRouteCommand succeeded without the atomic master effect")
	}
}

func routedNarratorStatusDecisionRecord() conversation.ConversationRouteDecisionRecord {
	invocation := routedNarratorInvocation()
	return conversation.ConversationRouteDecisionRecord{
		StreamSequence: 1,
		ID:             "conversation_route_decision_test",
		ConversationID: "conversation_test",
		InputID:        "conversation_input_test",
		RoutingAttempt: 1,
		RouterContext: &conversation.ConversationRouteContextAudit{
			InputSequence:        1,
			AllowedDecisionKinds: []conversation.ConversationRouteDecisionKind{conversation.ConversationRouteDecisionKindAnswerAsNarrator},
		},
		ResolvedInvocation: &invocation,
		Decision: conversation.ConversationRouteDecision{
			Kind: conversation.ConversationRouteDecisionKindAnswerAsNarrator,
			AnswerAsNarrator: &conversation.AnswerAsNarratorConversationRouteDecision{
				Question: "What is the current status?",
			},
		},
		ResultingCommand: conversation.ConversationRouteCommand{
			Kind: conversation.ConversationRouteDecisionKindAnswerAsNarrator,
			AnswerAsNarrator: &conversation.AnswerAsNarratorConversationRouteCommand{
				RequestID: "narrator_status_test",
				Question:  "What is the current status?",
			},
		},
		DecidedAt: "2026-07-13T20:00:00Z",
	}
}

func routedNarratorInvocation() conversation.ResolvedInvocation {
	profile := conversation.DefaultNarratorRoleProfile()
	threadID := "provider_thread_test"
	turnID := "provider_turn_test"
	requestID := "provider_request_test"
	responseID := "provider_response_test"
	endedAt := "2026-07-13T20:00:00Z"
	return conversation.ResolvedInvocation{
		ID:        "invocation_route_decision_test",
		Role:      conversation.RoleNarrator,
		Provider:  conversation.ProviderCodex,
		Requested: profile,
		Resolved: conversation.ResolvedInvocationSettings{
			ModelID:           "gpt-5.4-mini",
			ReasoningEffort:   profile.ReasoningEffort,
			PermissionProfile: profile.PermissionProfile,
		},
		ContextUsage: conversation.InvocationContextUsage{
			InputBytes:            100,
			EstimatedInputTokens:  25,
			OutputBytes:           40,
			EstimatedOutputTokens: 10,
		},
		ProviderReferences: conversation.InvocationProviderReferences{
			ThreadID:   &threadID,
			TurnID:     &turnID,
			RequestID:  &requestID,
			ResponseID: &responseID,
		},
		ModelReroutes: []conversation.InvocationModelReroute{},
		StartedAt:     "2026-07-13T19:59:59Z",
		EndedAt:       &endedAt,
		Outcome:       conversation.InvocationOutcomeSucceeded,
	}
}

type routeCommandExecutorStore struct {
	applied       []bool
	appliedCalls  int
	snapshot      conversation.ConversationSnapshot
	snapshotReads int
	workspaceID   string
}

func (store *routeCommandExecutorStore) ConversationRouteCommandApplied(
	_ context.Context,
	_ conversation.ConversationRouteDecisionRecord,
) (bool, error) {
	index := store.appliedCalls
	store.appliedCalls++
	if index >= len(store.applied) {
		return false, errors.New("unexpected route command effect read")
	}
	return store.applied[index], nil
}

func (store *routeCommandExecutorStore) ReadConversationWorkspaceID(
	_ context.Context,
	_ string,
) (string, error) {
	return store.workspaceID, nil
}

func (store *routeCommandExecutorStore) ReadSnapshot(
	_ context.Context,
	_ string,
	_ string,
) (conversation.ConversationSnapshot, error) {
	store.snapshotReads++
	return store.snapshot, nil
}

type routeCommandExecutorConversations struct{}

func (*routeCommandExecutorConversations) ExecuteRouteCommand(
	context.Context,
	string,
	string,
	string,
	conversation.ConversationRouteCommand,
) (conversation.ConversationSnapshot, error) {
	return conversation.ConversationSnapshot{}, errors.New("unexpected conversation command")
}

type routeCommandExecutorNarrator struct {
	calls int
	err   error
}

func (service *routeCommandExecutorNarrator) AskRoutedStatus(
	context.Context,
	string,
	string,
	string,
	string,
) (conversation.ConversationSnapshot, error) {
	service.calls++
	return conversation.ConversationSnapshot{}, service.err
}
