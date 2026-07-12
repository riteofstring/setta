package conversation

import (
	"context"
	"database/sql"
	"testing"
)

func TestStoreClaimsAndDispatchesConversationInputsInConversationOrder(t *testing.T) {
	store := newTestStore(t)
	seedConversationInputTargets(t, store, "conversation_alpha")
	first := validConversationInput("input_first")
	second := validConversationInput("input_second")
	second.SubmittedAt = "2026-07-12T18:00:01Z"
	acceptConversationRoutingInput(t, store, first, "2026-07-12T18:00:02Z")
	acceptConversationRoutingInput(t, store, second, "2026-07-12T18:00:03Z")

	work, found, err := store.ClaimNextConversationInput(
		context.Background(),
		first.ConversationID,
		"2026-07-12T18:00:04Z",
	)
	if err != nil {
		t.Fatalf("ClaimNextConversationInput: %v", err)
	}
	assertConversationRoutingClaim(t, work, found, first.ID, 1)
	if _, found, err := store.ClaimNextConversationInput(
		context.Background(),
		first.ConversationID,
		"2026-07-12T18:00:05Z",
	); err != nil || found {
		t.Fatalf("concurrent claim = found=%v err=%v, want blocked", found, err)
	}

	decision, command := validConversationRouteDecisionAndCommand(
		ConversationRouteDecisionKindSendToParent,
		first.Text,
	)
	commit := validConversationRouteDecisionCommit("decision_first", decision, command)
	commit.ConversationID = first.ConversationID
	commit.InputID = first.ID
	commit.DecidedAt = "2026-07-12T18:00:06Z"
	record, err := store.CommitConversationRouteDecision(context.Background(), commit)
	if err != nil {
		t.Fatalf("CommitConversationRouteDecision: %v", err)
	}
	if record.StreamSequence != 1 || record.InputID != first.ID {
		t.Fatalf("decision record = %+v", record)
	}
	duplicate, err := store.CommitConversationRouteDecision(context.Background(), commit)
	if err != nil {
		t.Fatalf("idempotent CommitConversationRouteDecision: %v", err)
	}
	if duplicate.StreamSequence != record.StreamSequence || countRows(t, store, "conversation_route_decisions") != 1 {
		t.Fatalf("duplicate route decision = %+v, want original %+v", duplicate, record)
	}
	changed := commit
	changed.DecidedAt = "2026-07-12T18:00:06.000000001Z"
	if _, err := store.CommitConversationRouteDecision(context.Background(), changed); !IsStateConflict(err) {
		t.Fatalf("changed decision retry error = %T %v, want state conflict", err, err)
	}
	assertConversationInputStatus(t, store, first.ID, ConversationInputStatusDispatched)

	next, found, err := store.ClaimNextConversationInput(
		context.Background(),
		first.ConversationID,
		"2026-07-12T18:00:07Z",
	)
	if err != nil {
		t.Fatalf("claim second input: %v", err)
	}
	assertConversationRoutingClaim(t, next, found, second.ID, 1)

	decisions, err := store.ReadConversationRouteDecisions(context.Background(), first.ID)
	if err != nil {
		t.Fatalf("ReadConversationRouteDecisions: %v", err)
	}
	if len(decisions) != 1 || decisions[0].ResultingCommand.SendToParent.TurnID != "turn_routed" {
		t.Fatalf("stored decisions = %+v", decisions)
	}
	assertConversationInputRoutingEventKinds(t, store, first.ConversationID, []string{
		ConversationInputAcceptedEventKind,
		ConversationInputAcceptedEventKind,
		ConversationInputRoutingStartedEventKind,
		ConversationInputRouteDecidedEventKind,
		ConversationInputRoutingStartedEventKind,
	})
}

func TestStoreValidatesAndCommitsEveryConversationRouteCommandFamily(t *testing.T) {
	kinds := []ConversationRouteDecisionKind{
		ConversationRouteDecisionKindSendToParent,
		ConversationRouteDecisionKindQueueParentTurn,
		ConversationRouteDecisionKindSteerParentTurn,
		ConversationRouteDecisionKindAnswerAsNarrator,
		ConversationRouteDecisionKindCreateSideConversation,
		ConversationRouteDecisionKindForkConversation,
		ConversationRouteDecisionKindEscalateToMaster,
		ConversationRouteDecisionKindClarify,
	}
	for _, kind := range kinds {
		t.Run(string(kind), func(t *testing.T) {
			store := newTestStore(t)
			conversationID := "conversation_" + string(kind)
			seedConversationInputTargets(t, store, conversationID)
			input := validConversationInput("input_" + string(kind))
			input.ConversationID = conversationID
			if kind == ConversationRouteDecisionKindCreateSideConversation {
				paneID := "pane_origin"
				input.SourcePaneID = &paneID
				seedConversationRoutePaneBinding(t, store, conversationID, paneID)
			}
			switch kind {
			case ConversationRouteDecisionKindQueueParentTurn, ConversationRouteDecisionKindSteerParentTurn:
				seedConversationRouteRunningTurn(t, store, conversationID)
			case ConversationRouteDecisionKindForkConversation:
				seedConversationRouteCompletedTurn(t, store, conversationID)
			}
			acceptConversationRoutingInput(t, store, input, "2026-07-12T18:00:01Z")
			work := claimConversationRoutingInput(t, store, conversationID, "2026-07-12T18:00:02Z")
			decision, command := validConversationRouteDecisionAndCommand(kind, input.Text)
			commit := validConversationRouteDecisionCommit("decision_"+string(kind), decision, command)
			commit.ConversationID = conversationID
			commit.InputID = input.ID
			commit.RoutingAttempt = work.RoutingAttempt
			commit.DecidedAt = "2026-07-12T18:00:03Z"
			record, err := store.CommitConversationRouteDecision(context.Background(), commit)
			if err != nil {
				t.Fatalf("CommitConversationRouteDecision(%s): %v", kind, err)
			}
			if record.Decision.Kind != kind || record.ResultingCommand.Kind != kind {
				t.Fatalf("committed route record = %+v", record)
			}
			wantStatus := ConversationInputStatusDispatched
			if kind == ConversationRouteDecisionKindClarify {
				wantStatus = ConversationInputStatusAwaitingClarification
			}
			assertConversationInputStatus(t, store, input.ID, wantStatus)
		})
	}
}

func TestStoreExplicitConversationInputModesConstrainDecisionWithoutRewriting(t *testing.T) {
	tests := []struct {
		name   string
		mutate func(*ConversationRouteDecisionCommit)
	}{
		{
			name: "router source",
			mutate: func(commit *ConversationRouteDecisionCommit) {
				commit.Source = ConversationRouteDecisionSourceRouter
			},
		},
		{
			name: "wrong decision family",
			mutate: func(commit *ConversationRouteDecisionCommit) {
				commit.Decision, commit.ResultingCommand = validConversationRouteDecisionAndCommand(
					ConversationRouteDecisionKindAnswerAsNarrator,
					"Route this request",
				)
			},
		},
		{
			name: "rewritten input",
			mutate: func(commit *ConversationRouteDecisionCommit) {
				commit.Decision, commit.ResultingCommand = validConversationRouteDecisionAndCommand(
					ConversationRouteDecisionKindSendToParent,
					"A rewritten request",
				)
			},
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			store := newTestStore(t)
			seedConversationInputTargets(t, store, "conversation_alpha")
			input := validConversationInput("input_explicit")
			input.RequestedMode = ConversationInputModeSend
			acceptConversationRoutingInput(t, store, input, "2026-07-12T18:00:01Z")
			work := claimConversationRoutingInput(t, store, input.ConversationID, "2026-07-12T18:00:02Z")
			decision, command := validConversationRouteDecisionAndCommand(
				ConversationRouteDecisionKindSendToParent,
				input.Text,
			)
			commit := validConversationRouteDecisionCommit("decision_explicit", decision, command)
			commit.InputID = input.ID
			commit.Source = ConversationRouteDecisionSourceExplicit
			commit.RoutingAttempt = work.RoutingAttempt
			commit.DecidedAt = "2026-07-12T18:00:03Z"
			test.mutate(&commit)
			if _, err := store.CommitConversationRouteDecision(context.Background(), commit); !IsStateConflict(err) {
				t.Fatalf("CommitConversationRouteDecision error = %T %v, want state conflict", err, err)
			}
			assertConversationInputStatus(t, store, input.ID, ConversationInputStatusRouting)
		})
	}

	store := newTestStore(t)
	seedConversationInputTargets(t, store, "conversation_alpha")
	input := validConversationInput("input_explicit_success")
	input.RequestedMode = ConversationInputModeSend
	acceptConversationRoutingInput(t, store, input, "2026-07-12T18:00:01Z")
	work := claimConversationRoutingInput(t, store, input.ConversationID, "2026-07-12T18:00:02Z")
	decision, command := validConversationRouteDecisionAndCommand(
		ConversationRouteDecisionKindSendToParent,
		input.Text,
	)
	commit := validConversationRouteDecisionCommit("decision_explicit_success", decision, command)
	commit.InputID = input.ID
	commit.Source = ConversationRouteDecisionSourceExplicit
	commit.RoutingAttempt = work.RoutingAttempt
	commit.DecidedAt = "2026-07-12T18:00:03Z"
	if _, err := store.CommitConversationRouteDecision(context.Background(), commit); err != nil {
		t.Fatalf("valid explicit decision: %v", err)
	}
	assertConversationInputStatus(t, store, input.ID, ConversationInputStatusDispatched)
}

func TestStoreKeepsClarificationLinkedAndBlocksLaterInputsUntilResolution(t *testing.T) {
	store := newTestStore(t)
	seedConversationInputTargets(t, store, "conversation_alpha")
	root := validConversationInput("input_needs_clarification")
	later := validConversationInput("input_later")
	later.SubmittedAt = "2026-07-12T18:00:01Z"
	acceptConversationRoutingInput(t, store, root, "2026-07-12T18:00:02Z")
	acceptConversationRoutingInput(t, store, later, "2026-07-12T18:00:03Z")

	work := claimConversationRoutingInput(t, store, root.ConversationID, "2026-07-12T18:00:04Z")
	decision, command := validConversationRouteDecisionAndCommand(
		ConversationRouteDecisionKindClarify,
		"Should this remain temporary or become a durable fork?",
	)
	clarification := validConversationRouteDecisionCommit("decision_clarify", decision, command)
	clarification.ConversationID = root.ConversationID
	clarification.InputID = root.ID
	clarification.DecidedAt = "2026-07-12T18:00:05Z"
	clarification.RoutingAttempt = work.RoutingAttempt
	if _, err := store.CommitConversationRouteDecision(context.Background(), clarification); err != nil {
		t.Fatalf("commit clarification: %v", err)
	}
	assertConversationInputStatus(t, store, root.ID, ConversationInputStatusAwaitingClarification)
	if _, found, err := store.ClaimNextConversationInput(
		context.Background(),
		root.ConversationID,
		"2026-07-12T18:00:06Z",
	); err != nil || found {
		t.Fatalf("claim while awaiting clarification = found=%v err=%v", found, err)
	}

	reply := validConversationInput("input_clarification_reply")
	reply.ReplyToInputID = &root.ID
	reply.Text = "Make it a durable fork."
	reply.SubmittedAt = "2026-07-12T18:00:07Z"
	reply.RequestedMode = ConversationInputModeQueue
	if _, err := store.AcceptConversationInput(context.Background(), reply, "2026-07-12T18:00:08Z"); !IsStateConflict(err) {
		t.Fatalf("non-route clarification reply error = %T %v, want state conflict", err, err)
	}
	reply.RequestedMode = ConversationInputModeRoute
	acceptConversationRoutingInput(t, store, reply, "2026-07-12T18:00:08Z")
	duplicateReply := cloneConversationInput(reply)
	duplicateReply.ID = "input_second_clarification_reply"
	if _, err := store.AcceptConversationInput(context.Background(), duplicateReply, "2026-07-12T18:00:09Z"); !IsStateConflict(err) {
		t.Fatalf("second clarification reply error = %T %v, want state conflict", err, err)
	}

	combined := claimConversationRoutingInput(t, store, root.ConversationID, "2026-07-12T18:00:10Z")
	assertClarifiedConversationRoutingWork(t, combined, root.ID, reply.ID, clarification.ID)
	finalDecision, finalCommand := validConversationRouteDecisionAndCommand(
		ConversationRouteDecisionKindAnswerAsNarrator,
		"I’ll keep the parent unchanged and prepare the durable fork.",
	)
	final := validConversationRouteDecisionCommit("decision_after_clarification", finalDecision, finalCommand)
	final.ConversationID = root.ConversationID
	final.InputID = root.ID
	final.ClarificationInputID = &reply.ID
	final.RoutingAttempt = combined.RoutingAttempt
	final.DecidedAt = "2026-07-12T18:00:11Z"
	if _, err := store.CommitConversationRouteDecision(context.Background(), final); err != nil {
		t.Fatalf("commit clarified decision: %v", err)
	}
	assertConversationInputStatus(t, store, root.ID, ConversationInputStatusDispatched)
	assertConversationInputStatus(t, store, reply.ID, ConversationInputStatusDispatched)
	decisions, err := store.ReadConversationRouteDecisions(context.Background(), root.ID)
	if err != nil {
		t.Fatalf("ReadConversationRouteDecisions: %v", err)
	}
	assertClarifiedConversationRouteDecisions(t, decisions, reply.ID)
	state, err := store.ReadConversationInputRoutingState(
		context.Background(),
		"workspace",
		root.ConversationID,
		reply.ID,
	)
	if err != nil {
		t.Fatalf("ReadConversationInputRoutingState: %v", err)
	}
	assertClarifiedConversationInputRoutingState(t, state, root.ID, reply.ID)
	next := claimConversationRoutingInput(t, store, root.ConversationID, "2026-07-12T18:00:12Z")
	if next.Input.Input.ID != later.ID {
		t.Fatalf("next input after clarification = %+v", next)
	}
}

func TestStoreFailsRetriesAndRecoversConversationInputRouting(t *testing.T) {
	store := newTestStore(t)
	seedConversationInputTargets(t, store, "conversation_alpha")
	input := validConversationInput("input_retry")
	later := validConversationInput("input_after_discard")
	later.SubmittedAt = "2026-07-12T18:00:00.000000001Z"
	acceptConversationRoutingInput(t, store, input, "2026-07-12T18:00:01Z")
	acceptConversationRoutingInput(t, store, later, "2026-07-12T18:00:01.000000001Z")
	work := claimConversationRoutingInput(t, store, input.ConversationID, "2026-07-12T18:00:02Z")
	failure := ConversationInputRoutingFailure{
		ConversationID: input.ConversationID,
		InputID:        input.ID,
		RoutingAttempt: work.RoutingAttempt,
		Failure: Failure{
			Code:                "router_unavailable",
			Message:             "The local router is temporarily unavailable.",
			Retryable:           true,
			DiagnosticReference: "routing-diagnostic-1",
		},
		FailedAt: "2026-07-12T18:00:03Z",
	}
	if err := store.FailConversationInputRouting(context.Background(), failure); err != nil {
		t.Fatalf("FailConversationInputRouting: %v", err)
	}
	assertConversationInputStatus(t, store, input.ID, ConversationInputStatusFailed)
	if _, found, err := store.ClaimNextConversationInput(
		context.Background(),
		input.ConversationID,
		"2026-07-12T18:00:04Z",
	); err != nil || found {
		t.Fatalf("claim failed input = found=%v err=%v", found, err)
	}
	if _, err := store.RetryConversationInputRouting(
		context.Background(),
		input.ID,
		"2026-07-12T18:00:05Z",
	); err != nil {
		t.Fatalf("RetryConversationInputRouting: %v", err)
	}
	retried := claimConversationRoutingInput(t, store, input.ConversationID, "2026-07-12T18:00:06Z")
	if retried.RoutingAttempt != 2 {
		t.Fatalf("retried routing attempt = %d, want 2", retried.RoutingAttempt)
	}

	recovered, err := store.RecoverConversationInputRouting(context.Background(), "2026-07-12T18:00:07Z")
	if err != nil {
		t.Fatalf("RecoverConversationInputRouting: %v", err)
	}
	if recovered != 1 {
		t.Fatalf("recovered inputs = %d, want 1", recovered)
	}
	assertConversationInputStatus(t, store, input.ID, ConversationInputStatusAccepted)
	restarted := claimConversationRoutingInput(t, store, input.ConversationID, "2026-07-12T18:00:08Z")
	if restarted.RoutingAttempt != 3 {
		t.Fatalf("recovered routing attempt = %d, want 3", restarted.RoutingAttempt)
	}
	assertNonRetryableRoutingDiscardUnblocksNext(t, store, input, later, restarted.RoutingAttempt)
}

func assertNonRetryableRoutingDiscardUnblocksNext(
	t *testing.T,
	store *Store,
	input ConversationInput,
	later ConversationInput,
	routingAttempt int,
) {
	t.Helper()
	failure := ConversationInputRoutingFailure{
		ConversationID: input.ConversationID,
		InputID:        input.ID,
		RoutingAttempt: routingAttempt,
		Failure: Failure{
			Code:                "router_unavailable",
			Message:             "The local router is temporarily unavailable.",
			Retryable:           false,
			DiagnosticReference: "routing-diagnostic-1",
		},
		FailedAt: "2026-07-12T18:00:09Z",
	}
	if err := store.FailConversationInputRouting(context.Background(), failure); err == nil {
		t.Fatal("non-retryable router failure succeeded without explicit discard")
	}
	assertConversationInputStatus(t, store, input.ID, ConversationInputStatusRouting)
	if _, err := store.RecoverConversationInputRouting(
		context.Background(),
		"2026-07-12T18:00:10Z",
	); err != nil {
		t.Fatalf("recover before discard: %v", err)
	}
	if err := store.DiscardConversationInputRouting(
		context.Background(),
		"workspace",
		input.ConversationID,
		input.ID,
		"2026-07-12T18:00:11Z",
	); err != nil {
		t.Fatalf("DiscardConversationInputRouting: %v", err)
	}
	if err := store.DiscardConversationInputRouting(
		context.Background(),
		"workspace",
		input.ConversationID,
		input.ID,
		"2026-07-12T18:00:12Z",
	); err != nil {
		t.Fatalf("idempotent DiscardConversationInputRouting: %v", err)
	}
	state, err := store.ReadConversationInputRoutingState(
		context.Background(),
		"workspace",
		input.ConversationID,
		input.ID,
	)
	if err != nil {
		t.Fatalf("ReadConversationInputRoutingState after discard: %v", err)
	}
	if state.Input.Status != ConversationInputStatusFailed || state.Input.Failure == nil ||
		state.Input.Failure.Retryable || state.Input.Failure.Code != "conversation_input_discarded" {
		t.Fatalf("discarded routing state = %+v", state)
	}
	if _, err := store.RetryConversationInputRouting(
		context.Background(),
		input.ID,
		"2026-07-12T18:00:13Z",
	); !IsStateConflict(err) {
		t.Fatalf("discarded retry error = %T %v, want state conflict", err, err)
	}
	next := claimConversationRoutingInput(t, store, input.ConversationID, "2026-07-12T18:00:14Z")
	if next.Input.Input.ID != later.ID {
		t.Fatalf("next input after discard = %+v", next)
	}
}

func TestStoreDiscardsAClarificationExchangeAsOneOrderedInput(t *testing.T) {
	store := newTestStore(t)
	seedConversationInputTargets(t, store, "conversation_alpha")
	root := validConversationInput("input_discard_clarification")
	later := validConversationInput("input_after_clarification_discard")
	later.SubmittedAt = "2026-07-12T18:00:01Z"
	acceptConversationRoutingInput(t, store, root, "2026-07-12T18:00:02Z")
	acceptConversationRoutingInput(t, store, later, "2026-07-12T18:00:03Z")

	work := claimConversationRoutingInput(t, store, root.ConversationID, "2026-07-12T18:00:04Z")
	decision, command := validConversationRouteDecisionAndCommand(
		ConversationRouteDecisionKindClarify,
		"Which outcome should I use?",
	)
	commit := validConversationRouteDecisionCommit("decision_discard_clarification", decision, command)
	commit.InputID = root.ID
	commit.RoutingAttempt = work.RoutingAttempt
	commit.DecidedAt = "2026-07-12T18:00:05Z"
	if _, err := store.CommitConversationRouteDecision(context.Background(), commit); err != nil {
		t.Fatalf("commit clarification before discard: %v", err)
	}
	reply := validConversationInput("input_discard_clarification_reply")
	reply.ReplyToInputID = &root.ID
	reply.SubmittedAt = "2026-07-12T18:00:06Z"
	acceptConversationRoutingInput(t, store, reply, "2026-07-12T18:00:07Z")

	if err := store.DiscardConversationInputRouting(
		context.Background(),
		"workspace",
		root.ConversationID,
		reply.ID,
		"2026-07-12T18:00:08Z",
	); err != nil {
		t.Fatalf("discard clarification exchange: %v", err)
	}
	state, err := store.ReadConversationInputRoutingState(
		context.Background(),
		"workspace",
		root.ConversationID,
		root.ID,
	)
	if err != nil {
		t.Fatalf("read discarded clarification exchange: %v", err)
	}
	assertDiscardedClarificationRoutingState(t, state, reply.ID)
	next := claimConversationRoutingInput(t, store, root.ConversationID, "2026-07-12T18:00:09Z")
	if next.Input.Input.ID != later.ID {
		t.Fatalf("next input after clarification discard = %+v", next)
	}
}

func TestStoreRollsBackConversationRouteDecisionAndStatusTogether(t *testing.T) {
	store := newTestStore(t)
	seedConversationInputTargets(t, store, "conversation_alpha")
	input := validConversationInput("input_atomic")
	acceptConversationRoutingInput(t, store, input, "2026-07-12T18:00:01Z")
	claimConversationRoutingInput(t, store, input.ConversationID, "2026-07-12T18:00:02Z")
	decision, command := validConversationRouteDecisionAndCommand(
		ConversationRouteDecisionKindSendToParent,
		input.Text,
	)
	commit := validConversationRouteDecisionCommit("decision_collision", decision, command)
	commit.ConversationID = input.ConversationID
	commit.InputID = input.ID
	commit.DecidedAt = "2026-07-12T18:00:03Z"
	appendTestOutboxEvents(t, store, []CommittedEventDraft{
		transactionTestEventDraft(
			"conversation-route-decision:"+commit.ID,
			"test:decision-collision",
			map[string]string{"state": "existing"},
		),
	})

	if _, err := store.CommitConversationRouteDecision(context.Background(), commit); err == nil {
		t.Fatal("CommitConversationRouteDecision succeeded despite event collision")
	}
	if got := countRows(t, store, "conversation_route_decisions"); got != 0 {
		t.Fatalf("route decisions after rollback = %d, want 0", got)
	}
	assertConversationInputStatus(t, store, input.ID, ConversationInputStatusRouting)
}

func TestStoreRecoversInFlightConversationInputAfterRestart(t *testing.T) {
	appDataDir := t.TempDir()
	store, err := NewStore(appDataDir)
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	seedConversationInputTargets(t, store, "conversation_alpha")
	input := validConversationInput("input_restart_routing")
	acceptConversationRoutingInput(t, store, input, "2026-07-12T18:00:01Z")
	claimConversationRoutingInput(t, store, input.ConversationID, "2026-07-12T18:00:02Z")
	if err := store.Close(); err != nil {
		t.Fatalf("close store: %v", err)
	}

	reopened, err := NewStore(appDataDir)
	if err != nil {
		t.Fatalf("reopen store: %v", err)
	}
	t.Cleanup(func() {
		if err := reopened.Close(); err != nil {
			t.Errorf("close reopened store: %v", err)
		}
	})
	if recovered, err := reopened.RecoverConversationInputRouting(
		context.Background(),
		"2026-07-12T18:01:00Z",
	); err != nil || recovered != 1 {
		t.Fatalf("RecoverConversationInputRouting after restart = %d, %v", recovered, err)
	}
	work := claimConversationRoutingInput(t, reopened, input.ConversationID, "2026-07-12T18:01:01Z")
	if work.RoutingAttempt != 2 || work.Input.Input.ID != input.ID {
		t.Fatalf("restarted routing work = %+v", work)
	}
}

func acceptConversationRoutingInput(
	t *testing.T,
	store *Store,
	input ConversationInput,
	acceptedAt string,
) AcceptedConversationInput {
	t.Helper()
	accepted, err := store.AcceptConversationInput(context.Background(), input, acceptedAt)
	if err != nil {
		t.Fatalf("AcceptConversationInput(%s): %v", input.ID, err)
	}
	return accepted
}

func claimConversationRoutingInput(
	t *testing.T,
	store *Store,
	conversationID string,
	startedAt string,
) ConversationInputRoutingWork {
	t.Helper()
	work, found, err := store.ClaimNextConversationInput(context.Background(), conversationID, startedAt)
	if err != nil {
		t.Fatalf("ClaimNextConversationInput: %v", err)
	}
	if !found {
		t.Fatal("ClaimNextConversationInput returned no work")
	}
	return work
}

func assertConversationRoutingClaim(
	t *testing.T,
	work ConversationInputRoutingWork,
	found bool,
	inputID string,
	routingAttempt int,
) {
	t.Helper()
	if !found || work.Input.Input.ID != inputID || work.RoutingAttempt != routingAttempt {
		t.Fatalf("routing work = %+v found=%v, want input %s attempt %d", work, found, inputID, routingAttempt)
	}
}

func assertClarifiedConversationRoutingWork(
	t *testing.T,
	work ConversationInputRoutingWork,
	rootInputID string,
	replyInputID string,
	clarificationDecisionID string,
) {
	t.Helper()
	if work.Input.Input.ID != rootInputID || work.Input.Status != ConversationInputStatusAwaitingClarification {
		t.Fatalf("clarification root routing work = %+v", work)
	}
	if work.ClarificationReply == nil || work.ClarificationReply.Input.ID != replyInputID {
		t.Fatalf("clarification reply routing work = %+v", work)
	}
	if work.PriorClarification == nil || work.PriorClarification.ID != clarificationDecisionID {
		t.Fatalf("prior clarification routing work = %+v", work)
	}
}

func assertClarifiedConversationRouteDecisions(
	t *testing.T,
	decisions []ConversationRouteDecisionRecord,
	replyInputID string,
) {
	t.Helper()
	if len(decisions) != 2 || decisions[0].Decision.Kind != ConversationRouteDecisionKindClarify {
		t.Fatalf("clarification decisions = %+v", decisions)
	}
	if decisions[1].ClarificationInputID == nil || *decisions[1].ClarificationInputID != replyInputID {
		t.Fatalf("final clarification decision = %+v", decisions[1])
	}
}

func assertClarifiedConversationInputRoutingState(
	t *testing.T,
	state ConversationInputRoutingState,
	rootInputID string,
	replyInputID string,
) {
	t.Helper()
	if state.Input.Input.ID != rootInputID || len(state.Decisions) != 2 {
		t.Fatalf("conversation input routing state = %+v", state)
	}
	if state.ClarificationReply == nil || state.ClarificationReply.Input.ID != replyInputID {
		t.Fatalf("conversation input clarification reply state = %+v", state)
	}
}

func assertDiscardedClarificationRoutingState(
	t *testing.T,
	state ConversationInputRoutingState,
	replyInputID string,
) {
	t.Helper()
	if state.Input.Status != ConversationInputStatusFailed || state.Input.Failure == nil || state.Input.Failure.Retryable {
		t.Fatalf("discarded clarification root state = %+v", state)
	}
	if state.ClarificationReply == nil || state.ClarificationReply.Input.ID != replyInputID ||
		state.ClarificationReply.Status != ConversationInputStatusFailed {
		t.Fatalf("discarded clarification reply state = %+v", state)
	}
	if len(state.Decisions) != 1 || state.Decisions[0].Decision.Kind != ConversationRouteDecisionKindClarify {
		t.Fatalf("discarded clarification decisions = %+v", state.Decisions)
	}
}

func assertConversationInputStatus(
	t *testing.T,
	store *Store,
	inputID string,
	want ConversationInputStatus,
) {
	t.Helper()
	input, found, err := store.ReadConversationInput(context.Background(), inputID)
	if err != nil {
		t.Fatalf("ReadConversationInput(%s): %v", inputID, err)
	}
	if !found || input.Status != want {
		t.Fatalf("conversation input %s = %+v found=%v, want status %s", inputID, input, found, want)
	}
}

func assertConversationInputRoutingEventKinds(
	t *testing.T,
	store *Store,
	conversationID string,
	want []string,
) {
	t.Helper()
	streamID, err := ConversationInputStreamID(conversationID)
	if err != nil {
		t.Fatalf("ConversationInputStreamID: %v", err)
	}
	events, err := store.ReadCommittedStreamEvents(context.Background(), streamID, 0, 100)
	if err != nil {
		t.Fatalf("ReadCommittedStreamEvents: %v", err)
	}
	if len(events) != len(want) {
		t.Fatalf("conversation input events = %d, want %d: %+v", len(events), len(want), events)
	}
	for index, event := range events {
		if event.Kind != want[index] {
			t.Errorf("conversation input event %d kind = %s, want %s", index, event.Kind, want[index])
		}
	}
}

func seedConversationRouteRunningTurn(t *testing.T, store *Store, conversationID string) {
	t.Helper()
	turn := validConversationTurn(TurnStatusRunning)
	turn.ID = "turn_running"
	turn.ConversationID = conversationID
	turn.ResolvedInvocation.ID = "invocation_running"
	turn.ResolvedInvocation.ProviderReferences.ThreadID = stringPointer("provider_thread")
	turn.ResolvedInvocation.ProviderReferences.TurnID = turn.ProviderTurnID
	err := store.write(context.Background(), "seed conversation route running turn", func(ctx context.Context, tx *sql.Tx) error {
		if _, err := tx.ExecContext(ctx, `UPDATE conversations SET status = ? WHERE id = ?`, ConversationStatusWorking, conversationID); err != nil {
			return err
		}
		return insertConversationRouteTestTurn(ctx, tx, turn)
	})
	if err != nil {
		t.Fatalf("seed running turn: %v", err)
	}
}

func seedConversationRouteCompletedTurn(t *testing.T, store *Store, conversationID string) {
	t.Helper()
	turn := validConversationTurn(TurnStatusCompleted)
	turn.ID = "turn_completed"
	turn.ConversationID = conversationID
	turn.ResolvedInvocation.ID = "invocation_completed"
	turn.ResolvedInvocation.ProviderReferences.ThreadID = stringPointer("provider_thread")
	turn.ResolvedInvocation.ProviderReferences.TurnID = turn.ProviderTurnID
	err := store.write(context.Background(), "seed conversation route completed turn", func(ctx context.Context, tx *sql.Tx) error {
		return insertConversationRouteTestTurn(ctx, tx, turn)
	})
	if err != nil {
		t.Fatalf("seed completed turn: %v", err)
	}
}

func seedConversationRoutePaneBinding(
	t *testing.T,
	store *Store,
	conversationID string,
	paneID string,
) {
	t.Helper()
	err := store.write(context.Background(), "seed conversation route pane binding", func(ctx context.Context, tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `
INSERT INTO pane_bindings(pane_id, workspace_id, conversation_id, created_at, updated_at)
VALUES (?, 'workspace', ?, '2026-07-12T18:00:00Z', '2026-07-12T18:00:00Z')
`, paneID, conversationID)
		return err
	})
	if err != nil {
		t.Fatalf("seed pane binding: %v", err)
	}
}

func insertConversationRouteTestTurn(ctx context.Context, tx *sql.Tx, turn ConversationTurn) error {
	if err := turn.Validate(); err != nil {
		return err
	}
	authoredInputJSON, err := encodeJSONColumn("test turn authored input", turn.AuthoredInput)
	if err != nil {
		return err
	}
	profileJSON, err := encodeJSONColumn("test turn role profile", turn.RequestedRoleProfile)
	if err != nil {
		return err
	}
	invocationJSON, err := encodeOptionalJSONColumn("test turn invocation", turn.ResolvedInvocation)
	if err != nil {
		return err
	}
	failureJSON, err := encodeOptionalJSONColumn("test turn failure", turn.Error)
	if err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, `
INSERT INTO conversation_turns (
  id, conversation_id, authored_input_json, delivery, status, accepted_at,
  started_at, ended_at, requested_role_profile_json, resolved_invocation_json,
  provider_turn_id, error_json
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`,
		turn.ID,
		turn.ConversationID,
		authoredInputJSON,
		turn.Delivery,
		turn.Status,
		turn.AcceptedAt,
		nullableString(turn.StartedAt),
		nullableString(turn.EndedAt),
		profileJSON,
		invocationJSON,
		nullableString(turn.ProviderTurnID),
		failureJSON,
	)
	return err
}
