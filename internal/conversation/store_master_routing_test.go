package conversation

import (
	"bytes"
	"context"
	"encoding/json"
	"slices"
	"testing"
	"time"

	"setta/internal/master"
)

func TestStoreClaimsMasterRoutingInDurableInputSequence(t *testing.T) {
	store := newTestStore(t)
	first := master.MasterInput{
		ID:          "master-input-sequence-first",
		Text:        "First accepted input.",
		Modality:    master.MasterInputModalityText,
		Source:      master.MasterInputSourceShell,
		SubmittedAt: "2026-07-11T20:01:00Z",
	}
	second := master.MasterInput{
		ID:          "master-input-sequence-second",
		Text:        "Second accepted input.",
		Modality:    master.MasterInputModalityText,
		Source:      master.MasterInputSourceShell,
		SubmittedAt: "2026-07-11T20:02:00Z",
	}
	if _, err := store.AcceptMasterInput(context.Background(), first, "2026-07-11T20:10:00Z"); err != nil {
		t.Fatalf("accept first master input: %v", err)
	}
	if _, err := store.AcceptMasterInput(context.Background(), second, "2026-07-11T20:03:00Z"); err != nil {
		t.Fatalf("accept second master input: %v", err)
	}
	work, found, err := store.ClaimNextMasterRouteInput(context.Background(), "2026-07-11T20:11:00Z")
	if err != nil || !found || work.Input.Input.ID != first.ID {
		t.Fatalf("sequence claim = %+v found=%t err=%v, want %s", work, found, err, first.ID)
	}
}

func TestStoreListsActiveAndOpenMasterRouteContextConversations(t *testing.T) {
	store := newTestStore(t)
	conversations := []TopicConversation{
		masterRouteContextTestConversation("route-context-waiting", ConversationStatusWaitingForApproval, "2026-07-11T20:05:00Z"),
		masterRouteContextTestConversation("route-context-working", ConversationStatusWorking, "2026-07-11T20:06:00Z"),
		masterRouteContextTestConversation("route-context-failed", ConversationStatusFailed, "2026-07-11T20:07:00Z"),
		masterRouteContextTestConversation("route-context-open-idle", ConversationStatusIdle, "2026-07-11T20:08:00Z"),
		masterRouteContextTestConversation("route-context-closed-idle", ConversationStatusIdle, "2026-07-11T20:09:00Z"),
	}
	_, err := store.Transact(context.Background(), "seed master route context conversations", func(transaction *WriteTransaction) error {
		for _, conversation := range conversations {
			if err := transaction.InsertConversation(conversation); err != nil {
				return err
			}
		}
		_, err := transaction.tx.ExecContext(transaction.ctx, `
INSERT INTO pane_bindings (
  pane_id, workspace_id, conversation_id, created_at, updated_at, last_focused_at
) VALUES (?, ?, ?, ?, ?, ?)
`,
			"route-context-pane",
			"workspace-route-context",
			"route-context-open-idle",
			"2026-07-11T20:00:00Z",
			"2026-07-11T20:08:00Z",
			"2026-07-11T20:08:00Z",
		)
		if err != nil {
			return err
		}
		_, err = transaction.AppendCommittedEvent(transactionTestEventDraft(
			"seed-master-route-context-conversations",
			"master-route-context-test",
			conversations,
		))
		return err
	})
	if err != nil {
		t.Fatalf("seed route context conversations: %v", err)
	}

	conversationIDs, err := store.ListMasterRouteContextConversationIDs(context.Background(), 10)
	if err != nil {
		t.Fatalf("ListMasterRouteContextConversationIDs: %v", err)
	}
	want := []string{
		"route-context-waiting",
		"route-context-working",
		"route-context-failed",
		"route-context-open-idle",
	}
	if !slices.Equal(conversationIDs, want) {
		t.Fatalf("master route context conversations = %v, want %v", conversationIDs, want)
	}
	limited, err := store.ListMasterRouteContextConversationIDs(context.Background(), 2)
	if err != nil || !slices.Equal(limited, want[:2]) {
		t.Fatalf("limited master route context conversations = %v err=%v", limited, err)
	}
}

func masterRouteContextTestConversation(
	id string,
	status ConversationStatus,
	updatedAt string,
) TopicConversation {
	return TopicConversation{
		ID:              id,
		WorkspaceID:     "workspace-route-context",
		Title:           id,
		TopicDescriptor: "Master route context coverage",
		Status:          status,
		CreatedAt:       "2026-07-11T20:00:00Z",
		UpdatedAt:       updatedAt,
	}
}

func TestStoreCommitsMasterRouteDecisionAtomicallyAndIdempotently(t *testing.T) {
	store := newTestStore(t)
	ready := seedMasterRouteState(t, store)
	accepted := acceptMasterRouteTestInput(t, store, "master-input-commit", "2026-07-11T20:02:00Z")
	work := claimMasterRouteCommitWork(t, store, accepted)
	commit := masterRouteTestCommit(t, work, ready, master.RouteDecision{
		Kind: master.RouteDecisionKindFocusConversation,
		FocusConversation: &master.MasterFocusConversationRouteDecision{
			ConversationID: "conversation-master-route",
		},
	})
	record := commitMasterRouteTestDecision(t, store, commit, accepted.Input.ID)
	assertIdempotentMasterRouteCommit(t, store, commit, record)
	assertChangedMasterRouteCommitRejected(t, store, commit)
	assertCommittedMasterRouteState(t, store, accepted.Input.ID)
	assertCommittedMasterRouteEvents(t, store)
}

func TestStoreCompletesMasterCommandBeforePublishingPresentationIntent(t *testing.T) {
	store := newTestStore(t)
	ready := seedMasterRouteState(t, store)
	accepted := acceptMasterRouteTestInput(t, store, "master-input-presentation", "2026-07-11T20:02:00Z")
	work := claimMasterRouteCommitWork(t, store, accepted)
	commit := masterRouteTestCommit(t, work, ready, master.RouteDecision{
		Kind: master.RouteDecisionKindFocusConversation,
		FocusConversation: &master.MasterFocusConversationRouteDecision{
			ConversationID: "conversation-master-route",
		},
	})
	record := commitMasterRouteTestDecision(t, store, commit, accepted.Input.ID)
	pending, resolvedPaneID, found, err := store.ReadPendingMasterRouteCommand(context.Background())
	if err != nil || !found || pending.ID != record.ID {
		t.Fatalf("ReadPendingMasterRouteCommand = %+v found=%t err=%v", pending, found, err)
	}
	if resolvedPaneID != nil {
		t.Fatalf("focus command resolved pane = %q, want nil", *resolvedPaneID)
	}
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
	if pending, _, found, err := store.ReadPendingMasterRouteCommand(context.Background()); err != nil || found {
		t.Fatalf("completed pending command = %+v found=%t err=%v", pending, found, err)
	}
	intent, err := store.WaitForMasterPresentationIntent(context.Background(), accepted.Input.ID)
	if err != nil {
		t.Fatalf("WaitForMasterPresentationIntent: %v", err)
	}
	if intent.Kind != master.PresentationIntentKindOpenConversationPane ||
		intent.OpenConversationPane == nil ||
		intent.OpenConversationPane.Target.ConversationID != "conversation-master-route" {
		t.Fatalf("presentation intent = %+v", intent)
	}
}

func TestStoreWaitsForRendererPaneResolutionBeforeExecutingMasterSideCommand(t *testing.T) {
	store := newTestStore(t)
	ready := seedMasterRouteState(t, store)
	accepted := acceptMasterRouteTestInput(t, store, "master-input-side-presentation", "2026-07-11T20:02:00Z")
	work := claimMasterRouteCommitWork(t, store, accepted)
	commit := masterRouteTestCommit(t, work, ready, master.RouteDecision{
		Kind: master.RouteDecisionKindCreateSideConversation,
		CreateSideConversation: &master.MasterCreateSideConversationRouteDecision{
			ParentConversationID: "conversation-master-route",
			Input:                "Investigate this tangent.",
		},
	})
	commit.Context.TargetAuthorities[0].AllowedDecisionKinds = []master.RouteDecisionKind{
		master.RouteDecisionKindCreateSideConversation,
	}
	record := commitMasterRouteTestDecision(t, store, commit, accepted.Input.ID)
	assertNoPendingMasterRouteCommand(t, store)
	intent := waitForMasterSidePresentationIntent(t, store, accepted.Input.ID)
	assertActiveMasterShellInput(t, store, accepted.Input.ID)
	bindMasterRouteTestPane(t, store)
	resolveMasterRouteTestPresentation(t, store, intent, accepted.Input.ID)
	assertResolvedMasterRouteCommand(t, store, record.ID)
	assertNoActiveMasterShellInteraction(t, store)
}

func assertNoPendingMasterRouteCommand(t *testing.T, store *Store) {
	t.Helper()
	pending, _, found, err := store.ReadPendingMasterRouteCommand(context.Background())
	if err != nil || found {
		t.Fatalf("unresolved side command = %+v found=%t err=%v", pending, found, err)
	}
}

func waitForMasterSidePresentationIntent(t *testing.T, store *Store, inputID string) master.PresentationIntent {
	t.Helper()
	intent, err := store.WaitForMasterPresentationIntent(context.Background(), inputID)
	if err != nil || intent.Kind != master.PresentationIntentKindOpenSideConversation ||
		intent.OpenSideConversation == nil ||
		intent.OpenSideConversation.Target.ConversationID != "conversation-master-route" {
		t.Fatalf("side presentation intent = %+v err=%v", intent, err)
	}
	return intent
}

func assertActiveMasterShellInput(t *testing.T, store *Store, inputID string) {
	t.Helper()
	interaction, err := store.ReadActiveMasterShellInteraction(context.Background())
	if err != nil || interaction.State == nil || interaction.State.Input.ID != inputID {
		t.Fatalf("unresolved side active interaction = %+v err=%v", interaction, err)
	}
}

func bindMasterRouteTestPane(t *testing.T, store *Store) {
	t.Helper()
	if err := store.ReplaceWorkspacePaneBindings(
		context.Background(),
		"workspace-1",
		[]WorkspacePaneBinding{{
			PaneID: "master-route-resolved-pane", ConversationID: "conversation-master-route", Focused: true,
		}},
		"2026-07-11T20:04:04Z",
	); err != nil {
		t.Fatalf("bind resolved master side pane: %v", err)
	}
}

func resolveMasterRouteTestPresentation(
	t *testing.T,
	store *Store,
	intent master.PresentationIntent,
	inputID string,
) {
	t.Helper()
	resolution, err := store.ResolveMasterPresentationIntent(
		context.Background(),
		master.PresentationResolutionRequest{
			IntentID: intent.ID,
			InputID:  inputID,
			PaneID:   "master-route-resolved-pane",
		},
		"2026-07-11T20:04:05Z",
	)
	if err != nil || resolution.PaneID != "master-route-resolved-pane" {
		t.Fatalf("ResolveMasterPresentationIntent = %+v err=%v", resolution, err)
	}
}

func assertResolvedMasterRouteCommand(t *testing.T, store *Store, recordID string) {
	t.Helper()
	pending, resolvedPaneID, found, err := store.ReadPendingMasterRouteCommand(context.Background())
	if err != nil || !found || pending.ID != recordID || resolvedPaneID == nil ||
		*resolvedPaneID != "master-route-resolved-pane" {
		t.Fatalf("resolved side command = %+v pane=%v found=%t err=%v", pending, resolvedPaneID, found, err)
	}
}

func assertNoActiveMasterShellInteraction(t *testing.T, store *Store) {
	t.Helper()
	interaction, err := store.ReadActiveMasterShellInteraction(context.Background())
	if err != nil || interaction.State != nil {
		t.Fatalf("resolved side active interaction = %+v err=%v, want empty", interaction, err)
	}
}

func TestStoreProjectsOnlyRestorableActiveShellInteraction(t *testing.T) {
	store := newTestStore(t)
	ready := seedMasterRouteState(t, store)
	first := acceptMasterRouteTestInput(t, store, "master-input-clarify", "2026-07-11T20:02:00Z")

	interaction, err := store.ReadActiveMasterShellInteraction(context.Background())
	if err != nil || interaction.State == nil || interaction.State.Input.ID != first.Input.ID ||
		interaction.State.Status != master.InputRoutingStatusAccepted {
		t.Fatalf("accepted active interaction = %+v err=%v", interaction, err)
	}
	work := claimMasterRouteCommitWork(t, store, first)
	commit := masterRouteTestCommit(t, work, ready, master.RouteDecision{
		Kind:    master.RouteDecisionKindClarify,
		Clarify: &master.MasterClarifyRouteDecision{Question: "Which topic should I focus?"},
	})
	commitMasterRouteTestDecision(t, store, commit, first.Input.ID)

	interaction, err = store.ReadActiveMasterShellInteraction(context.Background())
	if err != nil || interaction.State == nil || interaction.State.Decision == nil ||
		interaction.State.Decision.Kind != master.RouteDecisionKindClarify {
		t.Fatalf("clarification active interaction = %+v err=%v", interaction, err)
	}
	encoded, err := json.Marshal(interaction)
	if err != nil {
		t.Fatalf("marshal active interaction: %v", err)
	}
	for _, hiddenAuditField := range [][]byte{
		[]byte("masterSessionId"),
		[]byte("resolvedInvocation"),
		[]byte("providerThreadId"),
		[]byte("targetAuthorities"),
	} {
		if bytes.Contains(encoded, hiddenAuditField) {
			t.Fatalf("active interaction exposed audit field %q: %s", hiddenAuditField, encoded)
		}
	}

	second := acceptMasterRouteTestInput(t, store, "master-input-answer", "2026-07-11T20:05:00Z")
	work = claimMasterRouteCommitWork(t, store, second)
	commit = masterRouteTestCommit(t, work, ready, master.RouteDecision{
		Kind:         master.RouteDecisionKindAnswerGlobal,
		AnswerGlobal: &master.MasterAnswerGlobalRouteDecision{Text: "The router is ready."},
	})
	record, err := store.CommitMasterRouteDecision(context.Background(), commit)
	if err != nil || record.StreamSequence != 2 || record.InputID != second.Input.ID {
		t.Fatalf("second master route decision = %+v err=%v", record, err)
	}

	interaction, err = store.ReadActiveMasterShellInteraction(context.Background())
	if err != nil || interaction.State != nil {
		t.Fatalf("completed active interaction = %+v err=%v, want empty", interaction, err)
	}
}

func TestStoreWaitsForMasterInputTerminalStateWithoutPolling(t *testing.T) {
	store := newTestStore(t)
	ready := seedMasterRouteState(t, store)
	accepted := acceptMasterRouteTestInput(t, store, "master-input-wait", "2026-07-11T20:02:00Z")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	result := make(chan master.InputRoutingState, 1)
	errs := make(chan error, 1)
	go func() {
		state, err := store.WaitForMasterInputRoutingState(ctx, accepted.Input.ID)
		if err != nil {
			errs <- err
			return
		}
		result <- state
	}()

	work := claimMasterRouteCommitWork(t, store, accepted)
	commit := masterRouteTestCommit(t, work, ready, master.RouteDecision{
		Kind:         master.RouteDecisionKindAnswerGlobal,
		AnswerGlobal: &master.MasterAnswerGlobalRouteDecision{Text: "Done."},
	})
	commitMasterRouteTestDecision(t, store, commit, accepted.Input.ID)

	select {
	case err := <-errs:
		t.Fatalf("WaitForMasterInputRoutingState: %v", err)
	case state := <-result:
		if state.Status != master.InputRoutingStatusDecided || state.Decision == nil ||
			state.Decision.Decision.Kind != master.RouteDecisionKindAnswerGlobal {
			t.Fatalf("waited state = %+v", state)
		}
	case <-ctx.Done():
		t.Fatal("timed out waiting for terminal master input state")
	}
}

func TestStoreCancelsAcceptedAndActiveMasterRoutingIdempotently(t *testing.T) {
	store := newTestStore(t)
	accepted := acceptMasterRouteTestInput(
		t,
		store,
		"master-input-cancel-accepted",
		"2026-07-11T20:01:00Z",
	)
	acceptedState, err := store.CancelMasterInputRouting(
		context.Background(),
		accepted.Input.ID,
		"2026-07-11T20:03:00Z",
	)
	if err != nil {
		t.Fatalf("cancel accepted master input: %v", err)
	}
	assertCancelledMasterRoutingState(t, acceptedState, accepted.Input.ID, 0)
	idempotent, err := store.CancelMasterInputRouting(
		context.Background(),
		accepted.Input.ID,
		"2026-07-11T20:04:00Z",
	)
	if err != nil {
		t.Fatalf("idempotent accepted cancellation: %v", err)
	}
	assertCancelledMasterRoutingState(t, idempotent, accepted.Input.ID, 0)
	if idempotent.Cancellation.CancelledAt != "2026-07-11T20:03:00Z" {
		t.Fatalf("idempotent cancellation changed durable time: %+v", idempotent.Cancellation)
	}

	active := acceptMasterRouteTestInput(
		t,
		store,
		"master-input-cancel-active",
		"2026-07-11T20:02:00Z",
	)
	work, found, err := store.ClaimNextMasterRouteInput(
		context.Background(),
		"2026-07-11T20:05:00Z",
	)
	if err != nil || !found || work.Input.Input.ID != active.Input.ID {
		t.Fatalf("active cancellation claim=%+v found=%t err=%v", work, found, err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	waited := make(chan master.InputRoutingState, 1)
	go func() {
		state, waitErr := store.WaitForMasterInputRoutingState(ctx, active.Input.ID)
		if waitErr == nil {
			waited <- state
		}
	}()
	activeState, err := store.CancelMasterInputRouting(
		context.Background(),
		active.Input.ID,
		"2026-07-11T20:06:00Z",
	)
	if err != nil {
		t.Fatalf("cancel active master input: %v", err)
	}
	assertCancelledMasterRoutingState(t, activeState, active.Input.ID, work.RoutingAttempt)
	select {
	case state := <-waited:
		assertCancelledMasterRoutingState(t, state, active.Input.ID, work.RoutingAttempt)
	case <-ctx.Done():
		t.Fatal("terminal master input wait did not observe cancellation")
	}
	interaction, err := store.ReadActiveMasterShellInteraction(context.Background())
	if err != nil || interaction.State != nil {
		t.Fatalf("cancelled shell interaction=%+v err=%v, want empty", interaction, err)
	}
	events, err := store.ReadCommittedStreamEvents(
		context.Background(),
		master.RouteDecisionCommittedStream,
		0,
		10,
	)
	if err != nil {
		t.Fatalf("read master cancellation events: %v", err)
	}
	if len(events) != 3 || events[0].Kind != master.RouteInputRoutingCancelledKind ||
		events[1].Kind != master.RouteInputRoutingStartedKind ||
		events[2].Kind != master.RouteInputRoutingCancelledKind {
		t.Fatalf("master cancellation events=%+v", events)
	}
}

func assertCancelledMasterRoutingState(
	t *testing.T,
	state master.InputRoutingState,
	inputID string,
	routingAttempt int,
) {
	t.Helper()
	if state.Status != master.InputRoutingStatusCancelled || state.Cancellation == nil ||
		state.Cancellation.InputID != inputID ||
		state.Cancellation.RoutingAttempt != routingAttempt ||
		state.RoutingAttempt != routingAttempt || state.RoutingStartedAt != nil ||
		state.Decision != nil || state.Failure != nil {
		t.Fatalf("cancelled routing state=%+v", state)
	}
}

func claimMasterRouteCommitWork(
	t *testing.T,
	store *Store,
	accepted master.AcceptedMasterInput,
) master.InputRoutingWork {
	t.Helper()
	work, found, err := store.ClaimNextMasterRouteInput(context.Background(), "2026-07-11T20:04:00Z")
	if err != nil || !found || work.Input.Sequence != accepted.Sequence || work.RoutingAttempt != 1 {
		t.Fatalf("ClaimNextMasterRouteInput = %+v found=%t err=%v", work, found, err)
	}
	if _, found, err := store.ClaimNextMasterRouteInput(context.Background(), "2026-07-11T20:04:01Z"); err != nil || found {
		t.Fatalf("second claim found=%t err=%v", found, err)
	}
	return work
}

func commitMasterRouteTestDecision(
	t *testing.T,
	store *Store,
	commit master.RouteDecisionCommit,
	inputID string,
) master.RouteDecisionRecord {
	t.Helper()
	record, err := store.CommitMasterRouteDecision(context.Background(), commit)
	if err != nil {
		t.Fatalf("CommitMasterRouteDecision: %v", err)
	}
	if record.StreamSequence != 1 || record.InputID != inputID {
		t.Fatalf("route record = %+v", record)
	}
	return record
}

func assertIdempotentMasterRouteCommit(
	t *testing.T,
	store *Store,
	commit master.RouteDecisionCommit,
	record master.RouteDecisionRecord,
) {
	t.Helper()
	duplicate, err := store.CommitMasterRouteDecision(context.Background(), commit)
	if err != nil || duplicate.StreamSequence != record.StreamSequence {
		t.Fatalf("idempotent route commit = %+v err=%v", duplicate, err)
	}
}

func assertChangedMasterRouteCommitRejected(
	t *testing.T,
	store *Store,
	commit master.RouteDecisionCommit,
) {
	t.Helper()
	changed := commit
	changed.Decision = master.RouteDecision{
		Kind:         master.RouteDecisionKindAnswerGlobal,
		AnswerGlobal: &master.MasterAnswerGlobalRouteDecision{Text: "Changed answer."},
	}
	changed.ResultingCommand = masterRouteTestCommand(changed.Decision)
	if _, err := store.CommitMasterRouteDecision(context.Background(), changed); !IsStateConflict(err) {
		t.Fatalf("changed route commit error = %T %v, want state conflict", err, err)
	}
}

func assertCommittedMasterRouteState(t *testing.T, store *Store, inputID string) {
	t.Helper()
	state, err := store.ReadMasterInputRoutingState(context.Background(), inputID)
	if err != nil {
		t.Fatalf("ReadMasterInputRoutingState: %v", err)
	}
	if state.Status != master.InputRoutingStatusDecided || state.Decision == nil ||
		state.Decision.Decision.Kind != master.RouteDecisionKindFocusConversation || state.RoutingStartedAt != nil {
		t.Fatalf("routing state = %+v", state)
	}
}

func assertCommittedMasterRouteEvents(t *testing.T, store *Store) {
	t.Helper()
	events, err := store.ReadCommittedStreamEvents(
		context.Background(),
		master.RouteDecisionCommittedStream,
		0,
		10,
	)
	if err != nil {
		t.Fatalf("ReadCommittedStreamEvents: %v", err)
	}
	if len(events) != 2 || events[0].Kind != master.RouteInputRoutingStartedKind ||
		events[1].Kind != master.RouteDecisionCommittedKind {
		t.Fatalf("master route events = %+v", events)
	}
}

func TestStoreRecoversAndFailsMasterRoutingWithoutLosingAttemptHistory(t *testing.T) {
	store := newTestStore(t)
	seedMasterRouteState(t, store)
	accepted := acceptMasterRouteTestInput(t, store, "master-input-recovery", "2026-07-11T20:02:00Z")
	first, found, err := store.ClaimNextMasterRouteInput(context.Background(), "2026-07-11T20:03:00Z")
	if err != nil || !found {
		t.Fatalf("first claim found=%t err=%v", found, err)
	}
	if err := store.RecoverMasterInputRouting(context.Background(), "2026-07-11T20:04:00Z"); err != nil {
		t.Fatalf("RecoverMasterInputRouting: %v", err)
	}
	recovered, err := store.ReadMasterInputRoutingState(context.Background(), accepted.Input.ID)
	if err != nil || recovered.Status != master.InputRoutingStatusAccepted || recovered.RoutingAttempt != first.RoutingAttempt {
		t.Fatalf("recovered state = %+v err=%v", recovered, err)
	}
	second, found, err := store.ClaimNextMasterRouteInput(context.Background(), "2026-07-11T20:05:00Z")
	if err != nil || !found || second.RoutingAttempt != first.RoutingAttempt+1 {
		t.Fatalf("second claim = %+v found=%t err=%v", second, found, err)
	}
	failure := master.InputRoutingFailure{
		InputID:        accepted.Input.ID,
		RoutingAttempt: second.RoutingAttempt,
		Failure: master.RouteFailure{
			Code:                "master_route_provider_unavailable",
			Message:             "Global routing is temporarily unavailable.",
			Retryable:           true,
			DiagnosticReference: "master_route:recovery:2",
		},
		FailedAt: "2026-07-11T20:06:00Z",
	}
	if err := store.FailMasterInputRouting(context.Background(), failure); err != nil {
		t.Fatalf("FailMasterInputRouting: %v", err)
	}
	failed, err := store.ReadMasterInputRoutingState(context.Background(), accepted.Input.ID)
	if err != nil || failed.Status != master.InputRoutingStatusFailed || failed.Failure == nil ||
		failed.Failure.DiagnosticReference != failure.Failure.DiagnosticReference {
		t.Fatalf("failed state = %+v err=%v", failed, err)
	}
}

func TestStoreRejectsMasterDecisionWhenCurrentTargetAuthorityChanged(t *testing.T) {
	store := newTestStore(t)
	ready := seedMasterRouteState(t, store)
	acceptMasterRouteTestInput(t, store, "master-input-stale-target", "2026-07-11T20:02:00Z")
	work, found, err := store.ClaimNextMasterRouteInput(context.Background(), "2026-07-11T20:03:00Z")
	if err != nil || !found {
		t.Fatalf("claim found=%t err=%v", found, err)
	}
	commit := masterRouteTestCommit(t, work, ready, master.RouteDecision{
		Kind: master.RouteDecisionKindSendToAgent,
		SendToAgent: &master.MasterSendToAgentRouteDecision{
			ConversationID: "conversation-master-route",
			AuthoredInput:  "Continue the work.",
		},
	})
	commit.Context.TargetAuthorities[0].AllowedDecisionKinds = append(
		commit.Context.TargetAuthorities[0].AllowedDecisionKinds,
		master.RouteDecisionKindSendToAgent,
	)
	if _, err := store.writer.ExecContext(context.Background(), `
UPDATE agent_thread_bindings
SET status = ?
WHERE conversation_id = ?
`, ThreadBindingStatusMissing, "conversation-master-route"); err != nil {
		t.Fatalf("change target authority: %v", err)
	}
	if _, err := store.CommitMasterRouteDecision(context.Background(), commit); !IsStateConflict(err) {
		t.Fatalf("stale authority error = %T %v, want state conflict", err, err)
	}
	state, err := store.ReadMasterInputRoutingState(context.Background(), work.Input.Input.ID)
	if err != nil || state.Status != master.InputRoutingStatusRouting || state.Decision != nil {
		t.Fatalf("state after rejected commit = %+v err=%v", state, err)
	}
}

func seedMasterRouteState(t *testing.T, store *Store) master.Session {
	t.Helper()
	conversation := TopicConversation{
		ID:              "conversation-master-route",
		WorkspaceID:     "workspace-1",
		Title:           "Master routing",
		TopicDescriptor: "Strict global routing",
		Status:          ConversationStatusIdle,
		CreatedAt:       testTimeStarted,
		UpdatedAt:       testTimeStarted,
	}
	binding := AgentThreadBinding{
		ConversationID:   conversation.ID,
		Provider:         ProviderCodex,
		ThreadID:         "provider-conversation-thread",
		Status:           ThreadBindingStatusLinked,
		CreatedAt:        testTimeStarted,
		ProviderMetadata: map[string]string{"model": "gpt-agent-test"},
	}
	narrator := NarratorState{
		ConversationID:  conversation.ID,
		TopicDescriptor: conversation.TopicDescriptor,
		Status:          NarratorStatusReady,
		UpdatedAt:       testTimeStarted,
	}
	_, err := store.Transact(context.Background(), "seed master route target", func(transaction *WriteTransaction) error {
		if err := transaction.InsertConversation(conversation); err != nil {
			return err
		}
		if err := transaction.UpsertAgentThreadBinding(binding); err != nil {
			return err
		}
		if err := transaction.InsertNarratorState(narrator); err != nil {
			return err
		}
		_, err := transaction.AppendCommittedEvent(transactionTestEventDraft(
			"seed-master-route-target",
			"conversation:"+conversation.ID,
			conversation,
		))
		return err
	})
	if err != nil {
		t.Fatalf("seed route target: %v", err)
	}
	candidate := persistentMasterSession(t)
	created, _, err := store.CreateMasterSession(context.Background(), candidate)
	if err != nil {
		t.Fatalf("CreateMasterSession: %v", err)
	}
	threadID := "provider-master-thread"
	ready := master.CloneSession(created)
	ready.ProviderThreadID = &threadID
	ready.Status = master.SessionStatusReady
	ready.UpdatedAt = testTimeEnded
	if err := store.UpdateMasterSession(context.Background(), created.UpdatedAt, ready); err != nil {
		t.Fatalf("UpdateMasterSession: %v", err)
	}
	return ready
}

func acceptMasterRouteTestInput(
	t *testing.T,
	store *Store,
	inputID string,
	submittedAt string,
) master.AcceptedMasterInput {
	t.Helper()
	conversationID := "conversation-master-route"
	workspaceID := "workspace-1"
	input := master.MasterInput{
		ID:                    inputID,
		Text:                  "Focus the master routing topic.",
		Modality:              master.MasterInputModalityText,
		Source:                master.MasterInputSourceShell,
		SubmittedAt:           submittedAt,
		FocusedWorkspaceID:    &workspaceID,
		FocusedConversationID: &conversationID,
	}
	accepted, err := store.AcceptMasterInput(context.Background(), input, "2026-07-11T20:02:30Z")
	if err != nil {
		t.Fatalf("AcceptMasterInput: %v", err)
	}
	return accepted
}

func masterRouteTestCommit(
	t *testing.T,
	work master.InputRoutingWork,
	session master.Session,
	decision master.RouteDecision,
) master.RouteDecisionCommit {
	t.Helper()
	configuration, err := master.NewRouteModelConfigurationAudit(session.Configuration)
	if err != nil {
		t.Fatalf("NewRouteModelConfigurationAudit: %v", err)
	}
	return master.RouteDecisionCommit{
		ID:              "master-route-decision-" + work.Input.Input.ID,
		MasterSessionID: session.ID,
		InputID:         work.Input.Input.ID,
		RoutingAttempt:  work.RoutingAttempt,
		Context: master.RouteContextAudit{
			InputSequence:         work.Input.Sequence,
			CandidateQuery:        "focus master routing topic",
			RetrievedCandidates:   []master.RouteCandidateAudit{},
			IncludedCandidateIDs:  []string{},
			ActiveWorkspaceIDs:    []string{"workspace-1"},
			FocusedWorkspaceID:    cloneStringPointer(work.Input.Input.FocusedWorkspaceID),
			FocusedConversationID: cloneStringPointer(work.Input.Input.FocusedConversationID),
			TargetAuthorities: []master.RouteTargetAuthority{{
				ConversationID:       "conversation-master-route",
				WorkspaceID:          "workspace-1",
				AllowedDecisionKinds: []master.RouteDecisionKind{master.RouteDecisionKindFocusConversation},
				CompletedForkTurnIDs: []string{},
			}},
		},
		ResolvedInvocation: master.RouteInvocationAudit{
			Configuration:     configuration,
			ProviderRequestID: "master-route-call",
			ProviderThreadID:  *session.ProviderThreadID,
			ProviderTurnID:    "master-route-provider-turn",
			InputBytes:        128,
			OutputBytes:       64,
			StartedAt:         "2026-07-11T20:04:01Z",
			EndedAt:           "2026-07-11T20:04:02Z",
		},
		Decision:         decision,
		ResultingCommand: masterRouteTestCommand(decision),
		DecidedAt:        "2026-07-11T20:04:03Z",
	}
}

func masterRouteTestCommand(decision master.RouteDecision) master.RouteCommand {
	target := master.ConversationPresentationTarget{
		WorkspaceID:    "workspace-1",
		ConversationID: "conversation-master-route",
		Title:          "Master routing",
	}
	command := master.RouteCommand{Kind: decision.Kind}
	switch decision.Kind {
	case master.RouteDecisionKindSendToAgent:
		command.SendToAgent = &master.MasterSendToAgentRouteCommand{
			Target: target, TurnID: "master-route-turn", AuthoredInput: decision.SendToAgent.AuthoredInput,
		}
	case master.RouteDecisionKindQueueAgentTurn:
		command.QueueAgentTurn = &master.MasterQueueAgentTurnRouteCommand{
			Target: target, TurnID: "master-route-turn", AuthoredInput: decision.QueueAgentTurn.AuthoredInput,
		}
	case master.RouteDecisionKindSteerActiveTurn:
		command.SteerActiveTurn = &master.MasterSteerActiveTurnRouteCommand{
			Target: target, TargetTurnID: "master-route-active-turn", AuthoredInput: decision.SteerActiveTurn.AuthoredInput,
		}
	case master.RouteDecisionKindAskNarrator:
		command.AskNarrator = &master.MasterAskNarratorRouteCommand{
			Target: target, RequestID: "master-route-narrator", Question: decision.AskNarrator.Question,
		}
	case master.RouteDecisionKindFocusConversation:
		command.FocusConversation = &master.MasterFocusConversationRouteCommand{Target: target}
	case master.RouteDecisionKindCreateConversation:
		command.CreateConversation = &master.MasterCreateConversationRouteCommand{
			Target: master.ConversationPresentationTarget{
				WorkspaceID:    decision.CreateConversation.WorkspaceID,
				ConversationID: "master-route-created-conversation",
				Title:          decision.CreateConversation.ProposedTitle,
			},
			TurnID: "master-route-turn", InitialInput: decision.CreateConversation.InitialInput,
		}
	case master.RouteDecisionKindCreateSideConversation:
		command.CreateSideConversation = &master.MasterCreateSideConversationRouteCommand{
			Target: target, SideConversationID: "master-route-side", TurnID: "master-route-side-turn", Input: decision.CreateSideConversation.Input,
		}
	case master.RouteDecisionKindForkConversation:
		command.ForkConversation = &master.MasterForkConversationRouteCommand{
			ParentConversationID: target.ConversationID,
			Target: master.ConversationPresentationTarget{
				WorkspaceID: target.WorkspaceID, ConversationID: "master-route-fork", Title: "Fork of Master routing",
			},
			ForkedAtTurnID: decision.ForkConversation.ForkedAtTurnID,
			TurnID:         "master-route-fork-turn",
			Input:          decision.ForkConversation.Input,
		}
	case master.RouteDecisionKindClarify:
		command.Clarify = &master.MasterClarifyRouteCommand{Question: decision.Clarify.Question}
	case master.RouteDecisionKindAnswerGlobal:
		command.AnswerGlobal = &master.MasterAnswerGlobalRouteCommand{Text: decision.AnswerGlobal.Text}
	}
	return command
}
