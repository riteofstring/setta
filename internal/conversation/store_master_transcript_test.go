package conversation

import (
	"context"
	"testing"

	"setta/internal/master"
)

func TestStoreProjectsShellMasterInputAndAnswerIntoTranscript(t *testing.T) {
	store := newTestStore(t)
	ready := seedMasterRouteState(t, store)
	accepted := acceptMasterRouteTestInput(
		t,
		store,
		"master-input-transcript-answer",
		"2026-07-11T20:02:00Z",
	)
	work := claimMasterRouteCommitWork(t, store, accepted)
	commit := masterRouteTestCommit(t, work, ready, master.RouteDecision{
		Kind: master.RouteDecisionKindAnswerGlobal,
		AnswerGlobal: &master.MasterAnswerGlobalRouteDecision{
			Text: "Setta can answer this without a topic.",
		},
	})
	record := commitMasterRouteTestDecision(t, store, commit, accepted.Input.ID)
	if err := store.CompleteMasterRouteCommand(
		context.Background(),
		record.ID,
		"2026-07-11T20:04:04Z",
	); err != nil {
		t.Fatalf("CompleteMasterRouteCommand: %v", err)
	}

	transcript := readMasterTranscript(t, store, 20)
	if len(transcript.Entries) != 2 {
		t.Fatalf("transcript entries = %+v, want user and answer", transcript.Entries)
	}
	assertTranscriptUserEntry(t, transcript.Entries[0], accepted.Input.ID, accepted.Input.Text)
	answer := transcript.Entries[1].Payload
	if answer.Kind != master.TranscriptEntryKindAssistantReply ||
		answer.AssistantReply == nil ||
		answer.AssistantReply.ReplyKind != master.MasterReplyKindAnswer ||
		answer.AssistantReply.Text != "Setta can answer this without a topic." {
		t.Fatalf("answer transcript payload = %+v", answer)
	}
}

func TestStoreProjectsCompletedMasterActionIntoTranscript(t *testing.T) {
	store := newTestStore(t)
	ready := seedMasterRouteState(t, store)
	accepted := acceptMasterRouteTestInput(
		t,
		store,
		"master-input-transcript-action",
		"2026-07-11T20:02:00Z",
	)
	work := claimMasterRouteCommitWork(t, store, accepted)
	commit := masterRouteTestCommit(t, work, ready, master.RouteDecision{
		Kind: master.RouteDecisionKindFocusConversation,
		FocusConversation: &master.MasterFocusConversationRouteDecision{
			ConversationID: "conversation-master-route",
		},
	})
	record := commitMasterRouteTestDecision(t, store, commit, accepted.Input.ID)
	if err := store.CompleteMasterRouteCommand(
		context.Background(),
		record.ID,
		"2026-07-11T20:04:04Z",
	); err != nil {
		t.Fatalf("CompleteMasterRouteCommand: %v", err)
	}
	if err := store.CompleteMasterRouteCommand(
		context.Background(),
		record.ID,
		"2026-07-11T20:04:04Z",
	); err != nil {
		t.Fatalf("idempotent CompleteMasterRouteCommand: %v", err)
	}

	transcript := readMasterTranscript(t, store, 20)
	if len(transcript.Entries) != 2 {
		t.Fatalf("transcript entries = %+v, want user and receipt", transcript.Entries)
	}
	receipt := transcript.Entries[1].Payload
	if receipt.Kind != master.TranscriptEntryKindActionReceipt ||
		receipt.ActionReceipt == nil ||
		receipt.ActionReceipt.DecisionKind != master.RouteDecisionKindFocusConversation ||
		receipt.ActionReceipt.Text != `Setta focused "Master routing".` {
		t.Fatalf("action transcript payload = %+v", receipt)
	}
}

func TestStoreProjectsMasterCancellationAndFailureIntoTranscript(t *testing.T) {
	store := newTestStore(t)
	cancelled := acceptMasterRouteTestInput(
		t,
		store,
		"master-input-transcript-cancel",
		"2026-07-11T20:02:00Z",
	)
	if _, err := store.CancelMasterInputRouting(
		context.Background(),
		cancelled.Input.ID,
		"2026-07-11T20:03:00Z",
	); err != nil {
		t.Fatalf("CancelMasterInputRouting: %v", err)
	}
	failed := acceptMasterRouteTestInput(
		t,
		store,
		"master-input-transcript-failure",
		"2026-07-11T20:04:00Z",
	)
	work := claimMasterRouteCommitWork(t, store, failed)
	if err := store.FailMasterInputRouting(context.Background(), master.InputRoutingFailure{
		InputID:        failed.Input.ID,
		RoutingAttempt: work.RoutingAttempt,
		Failure: master.RouteFailure{
			Code:                "master_route_provider_unavailable",
			Message:             "Global routing is temporarily unavailable.",
			Retryable:           true,
			DiagnosticReference: "master_route:failure:1",
		},
		FailedAt: "2026-07-11T20:05:00Z",
	}); err != nil {
		t.Fatalf("FailMasterInputRouting: %v", err)
	}

	transcript := readMasterTranscript(t, store, 20)
	if len(transcript.Entries) != 4 {
		t.Fatalf("transcript entries = %+v, want two inputs plus terminal records", transcript.Entries)
	}
	assertTranscriptUserEntry(t, transcript.Entries[0], cancelled.Input.ID, cancelled.Input.Text)
	if payload := transcript.Entries[1].Payload; payload.Kind != master.TranscriptEntryKindCancellation ||
		payload.Cancellation == nil {
		t.Fatalf("cancellation transcript payload = %+v", payload)
	}
	assertTranscriptUserEntry(t, transcript.Entries[2], failed.Input.ID, failed.Input.Text)
	if payload := transcript.Entries[3].Payload; payload.Kind != master.TranscriptEntryKindFailure ||
		payload.Failure == nil ||
		payload.Failure.Code != "master_route_provider_unavailable" ||
		payload.Failure.Message != "Global routing is temporarily unavailable." ||
		!payload.Failure.Retryable {
		t.Fatalf("failure transcript payload = %+v", payload)
	}
}

func readMasterTranscript(t *testing.T, store *Store, limit int) master.Transcript {
	t.Helper()
	transcript, err := store.ReadMasterTranscript(context.Background(), limit)
	if err != nil {
		t.Fatalf("ReadMasterTranscript: %v", err)
	}
	return transcript
}

func assertTranscriptUserEntry(
	t *testing.T,
	entry master.TranscriptEntry,
	inputID string,
	text string,
) {
	t.Helper()
	payload := entry.Payload
	if payload.Kind != master.TranscriptEntryKindUserInput ||
		payload.InputID != inputID ||
		payload.UserInput == nil ||
		payload.UserInput.Text != text {
		t.Fatalf("user transcript payload = %+v", payload)
	}
}
