package conversation

import (
	"context"
	"database/sql"
	"fmt"
	"testing"
)

const (
	narratorProjectionTime           = "2026-07-11T20:02:00Z"
	narratorStatusTime               = "2026-07-11T20:03:00Z"
	narratorTerminalTime             = "2026-07-11T20:04:00Z"
	narratorTerminalFinalizationTime = "2026-07-11T20:05:00Z"
	narratorWorkingThroughSequence   = 11
	narratorTerminalSourceSequence   = 12
)

func TestNarratorOutputCommitsProjectionStatusAndTerminalChannelsAtomically(t *testing.T) {
	store := newTestStore(t)
	seed := seedNarratorContext(t, store)

	projection, err := store.CommitNarratorProjection(context.Background(), narratorWorkingCommit(seed))
	if err != nil {
		t.Fatalf("commit working narrator projection: %v", err)
	}
	assertWorkingProjectionCommit(t, projection)

	status, err := store.CommitNarratorStatus(
		context.Background(),
		narratorStatusCommit(seed, projection.State),
	)
	if err != nil {
		t.Fatalf("commit narrator status reply: %v", err)
	}
	assertStatusCommitDoesNotAdvanceProjection(t, projection.State, status)

	appendTerminalNarratorSource(t, store, seed)
	terminal, err := store.CommitNarratorProjection(
		context.Background(),
		narratorTerminalCommit(seed, status.State),
	)
	if err != nil {
		t.Fatalf("commit terminal narrator projection: %v", err)
	}
	assertTerminalProjectionCommit(t, terminal)
	assertNarratorOutputSnapshot(t, store, seed, terminal.State)
	assertNarratorOutputPublications(t, store, seed)
}

func TestNarratorProjectionSuppressesWorkingMilestoneWhenTrajectoryAdvanced(t *testing.T) {
	store := newTestStore(t)
	seed := seedNarratorContext(t, store)
	request := narratorWorkingCommit(seed)
	request.ObservedThroughSequence = 8

	projection, err := store.CommitNarratorProjection(context.Background(), request)
	if err != nil {
		t.Fatalf("commit advanced narrator projection: %v", err)
	}
	if projection.State.ObservedThroughSequence != 8 {
		t.Fatalf("advanced narrator state = %+v", projection.State)
	}
	if len(projection.Events) != 0 {
		t.Fatalf("advanced narrator events = %+v, want no stale milestone", projection.Events)
	}
	assertNarratorCursorAndEventCount(t, store, seed.conversationID, 8, 2)
}

func TestTerminalNarratorProjectionCanFinalizeAlreadyObservedBoundary(t *testing.T) {
	store := newTestStore(t)
	seed := seedNarratorContext(t, store)
	projection, err := store.CommitNarratorProjection(context.Background(), narratorWorkingCommit(seed))
	if err != nil {
		t.Fatalf("commit working narrator projection: %v", err)
	}
	appendTerminalNarratorSource(t, store, seed)
	caughtUp := markNarratorOutputStateCaughtUp(t, store, seed.conversationID, projection.State, narratorTerminalSourceSequence)

	finalization, err := store.CommitNarratorProjection(
		context.Background(),
		narratorTerminalFinalizationCommit(seed, caughtUp),
	)
	if err != nil {
		t.Fatalf("commit terminal narrator finalization: %v", err)
	}
	if finalization.State.ObservedThroughSequence != narratorTerminalSourceSequence ||
		finalization.State.CheckpointThroughSequence != narratorTerminalSourceSequence {
		t.Fatalf("terminal finalization state = %+v", finalization.State)
	}
	if len(finalization.Events) != 1 ||
		finalization.Events[0].Kind != NarrationEventKindFinalSummary ||
		finalization.Events[0].SourceSequenceStart != narratorTerminalSourceSequence ||
		finalization.Events[0].SourceSequenceEnd != narratorTerminalSourceSequence {
		t.Fatalf("terminal finalization events = %+v", finalization.Events)
	}

	duplicate := narratorTerminalFinalizationCommit(seed, finalization.State)
	duplicate.NarratorStateCommittedID = "terminal-finalization-duplicate-state"
	duplicate.FinalSummary.NarrationEventID = "terminal-finalization-duplicate"
	duplicate.FinalSummary.CommittedEventID = "terminal-finalization-duplicate-publication"
	duplicate.CommittedAt = "2026-07-11T20:06:00Z"
	_, err = store.CommitNarratorProjection(context.Background(), duplicate)
	if !IsStateConflict(err) {
		t.Fatalf("duplicate terminal finalization error = %T %v, want StateConflictError", err, err)
	}
}

func TestNarratorProjectionRollsBackStateOutputsAndTopicOnPublicationFailure(t *testing.T) {
	store := newTestStore(t)
	seed := seedNarratorContext(t, store)
	appendTestOutboxEvents(t, store, []CommittedEventDraft{
		transactionTestEventDraft(
			"projection-state-publication",
			"conversation:"+seed.conversationID,
			map[string]string{"state": "existing"},
		),
	})

	request := narratorWorkingCommit(seed)
	request.NarratorStateCommittedID = "projection-state-publication"
	_, err := store.CommitNarratorProjection(context.Background(), request)
	if err == nil || !IsPersistenceError(err) {
		t.Fatalf("duplicate narrator publication error = %T %v, want PersistenceError", err, err)
	}
	state := readTestNarratorState(t, store, seed.conversationID)
	if state.ObservedThroughSequence != 6 || state.CurrentFocusRevision != 1 ||
		state.TopicDescriptor != "Durable narrator context and checkpointing" || state.UpdatedAt != testTimeStarted {
		t.Fatalf("narrator state changed after publication rollback: %+v", state)
	}
	conversationRecord, _, narration := readNarratorOutputProjection(t, store, seed.conversationID)
	if conversationRecord.TopicDescriptor != "Durable narrator context and checkpointing" {
		t.Fatalf("conversation topic descriptor changed after rollback: %q", conversationRecord.TopicDescriptor)
	}
	if len(narration.Events) != 2 {
		t.Fatalf("narration count after rollback = %d, want seeded 2", len(narration.Events))
	}
}

func TestNarratorFocusCommitUpdatesOnlyFromAcceptedInputOrSteering(t *testing.T) {
	store := newTestStore(t)
	seed := seedNarratorContext(t, store)
	before := readTestNarratorState(t, store, seed.conversationID)

	focus, err := store.CommitNarratorFocus(context.Background(), narratorFocusCommit(seed, before))
	if err != nil {
		t.Fatalf("commit narrator focus: %v", err)
	}
	if focus.State.ObservedThroughSequence != before.ObservedThroughSequence ||
		focus.State.CurrentFocusRevision != before.CurrentFocusRevision+1 ||
		focus.State.CurrentFocusSourceSequence != 3 ||
		focus.State.CurrentFocus != "Preserving the authoritative durable-context objective." ||
		focus.State.TopicDescriptor != "Stable durable narrator context" {
		t.Fatalf("focus state = %+v, before %+v", focus.State, before)
	}
	if focus.Conversation != nil {
		t.Fatalf("focus conversation = %+v", focus.Conversation)
	}
	conversationRecord, _, _ := readNarratorOutputProjection(t, store, seed.conversationID)
	if conversationRecord.TopicDescriptor != "Durable narrator context and checkpointing" {
		t.Fatalf("conversation topic descriptor changed after narrator focus: %q", conversationRecord.TopicDescriptor)
	}
	if focus.Event == nil || focus.Event.Kind != NarrationEventKindTopicDescriptor ||
		focus.Event.Trigger != NarrationTriggerUserSteered ||
		focus.Event.SourceSequenceStart != 3 || focus.Event.SourceSequenceEnd != 3 {
		t.Fatalf("focus topic event = %+v", focus.Event)
	}

	stale := narratorFocusCommit(seed, before)
	stale.NarratorStateCommittedID = "focus-state-stale"
	stale.TopicDescriptor.NarrationEventID = "focus-topic-stale"
	stale.TopicDescriptor.CommittedEventID = "focus-topic-publication-stale"
	stale.CommittedAt = narratorStatusTime
	_, err = store.CommitNarratorFocus(context.Background(), stale)
	if !IsStateConflict(err) {
		t.Fatalf("stale focus error = %T %v, want StateConflictError", err, err)
	}

	badSource := narratorFocusCommit(seed, focus.State)
	badSource.NarratorStateCommittedID = "focus-state-bad-source"
	badSource.SourceThroughSequence = 4
	badSource.CommittedAt = narratorTerminalTime
	_, err = store.CommitNarratorFocus(context.Background(), badSource)
	if !IsStateConflict(err) {
		t.Fatalf("bad focus source error = %T %v, want StateConflictError", err, err)
	}
}

func TestNarratorFocusCommitAdvancesRevisionForDescriptorOnlyChange(t *testing.T) {
	store := newTestStore(t)
	seed := seedNarratorContext(t, store)
	before := readTestNarratorState(t, store, seed.conversationID)
	request := narratorFocusCommit(seed, before)
	request.NarratorStateCommittedID = "focus-state-descriptor-only"
	request.CurrentFocus = before.CurrentFocus
	request.TopicDescriptor.NarrationEventID = "focus-topic-descriptor-only"
	request.TopicDescriptor.CommittedEventID = "focus-topic-descriptor-only-publication"
	request.TopicDescriptor.Text = "Descriptor-only narrator routing update"

	focus, err := store.CommitNarratorFocus(context.Background(), request)
	if err != nil {
		t.Fatalf("commit descriptor-only narrator focus: %v", err)
	}
	if focus.State.CurrentFocus != before.CurrentFocus ||
		focus.State.CurrentFocusRevision != before.CurrentFocusRevision+1 ||
		focus.State.CurrentFocusSourceSequence != request.SourceThroughSequence ||
		focus.State.TopicDescriptor != request.TopicDescriptor.Text {
		t.Fatalf("descriptor-only focus state = %+v, before %+v", focus.State, before)
	}
	if focus.Event == nil || focus.Event.TopicDescriptor == nil ||
		focus.Event.TopicDescriptor.Text != request.TopicDescriptor.Text {
		t.Fatalf("descriptor-only focus event = %+v", focus.Event)
	}
}

func TestNarratorProjectionRejectsGappedOrStaleCoverageWithoutPartialOutput(t *testing.T) {
	t.Run("gapped trajectory", func(t *testing.T) {
		store := newTestStore(t)
		seed := seedNarratorContext(t, store)
		err := store.write(context.Background(), "corrupt narrator output coverage", func(ctx context.Context, transaction *sql.Tx) error {
			_, err := transaction.ExecContext(ctx, `
DELETE FROM trajectory_events WHERE conversation_id = ? AND sequence = 7
`, seed.conversationID)
			return err
		})
		if err != nil {
			t.Fatalf("delete trajectory event: %v", err)
		}
		_, err = store.CommitNarratorProjection(context.Background(), narratorWorkingCommit(seed))
		if !IsStateConflict(err) {
			t.Fatalf("gapped projection error = %T %v, want StateConflictError", err, err)
		}
		assertNarratorCursorAndEventCount(t, store, seed.conversationID, 6, 2)
	})

	t.Run("stale cursor", func(t *testing.T) {
		store := newTestStore(t)
		seed := seedNarratorContext(t, store)
		request := narratorWorkingCommit(seed)
		if _, err := store.CommitNarratorProjection(context.Background(), request); err != nil {
			t.Fatalf("commit first narrator projection: %v", err)
		}
		request.NarratorStateCommittedID = "stale-projection-state"
		for index := range request.Milestones {
			request.Milestones[index].NarrationEventID = fmt.Sprintf("stale-milestone-%d", index)
			request.Milestones[index].CommittedEventID = fmt.Sprintf("stale-milestone-event-%d", index)
		}
		request.CommittedAt = narratorStatusTime
		_, err := store.CommitNarratorProjection(context.Background(), request)
		if !IsStateConflict(err) {
			t.Fatalf("stale projection error = %T %v, want StateConflictError", err, err)
		}
		assertNarratorCursorAndEventCount(t, store, seed.conversationID, narratorWorkingThroughSequence, 3)
	})
}

func TestTerminalNarratorProjectionRequiresTerminalTurnAndSourceEvent(t *testing.T) {
	store := newTestStore(t)
	seed := seedNarratorContext(t, store)
	request := narratorWorkingCommit(seed)
	request.Trigger = NarrationTriggerTurnTerminal
	request.ObservedThroughSequence = narratorWorkingThroughSequence
	request.FinalSummary = &NarrationTextCommit{
		NarrationEventID: "premature-final",
		CommittedEventID: "premature-final-publication",
		Text:             "This final summary must not commit before the primary turn is terminal.",
	}
	_, err := store.CommitNarratorProjection(context.Background(), request)
	if !IsStateConflict(err) {
		t.Fatalf("premature terminal projection error = %T %v, want StateConflictError", err, err)
	}
	assertNarratorCursorAndEventCount(t, store, seed.conversationID, 6, 2)
}

func TestTerminalNarratorProjectionRequiresSourceEventMatchingTurnOutcome(t *testing.T) {
	store := newTestStore(t)
	seed := seedNarratorContext(t, store)
	appendMismatchedTerminalNarratorSource(t, store, seed)

	state := readTestNarratorState(t, store, seed.conversationID)
	_, err := store.CommitNarratorProjection(
		context.Background(),
		narratorTerminalCommit(seed, state),
	)
	if !IsStateConflict(err) {
		t.Fatalf("mismatched terminal projection error = %T %v, want StateConflictError", err, err)
	}
	assertNarratorCursorAndEventCount(t, store, seed.conversationID, 6, 2)
}

func narratorWorkingCommit(seed narratorContextSeed) NarratorProjectionCommit {
	return NarratorProjectionCommit{
		ConversationID: seed.conversationID,
		TurnID:         seed.turnID,
		Expected: NarratorStateExpectation{
			ObservedThroughSequence:   6,
			CheckpointThroughSequence: 2,
			CurrentFocusRevision:      1,
			UpdatedAt:                 testTimeStarted,
		},
		ObservedThroughSequence: narratorWorkingThroughSequence,
		Milestones: []NarrationTextCommit{
			{
				NarrationEventID: "projection-milestone-1",
				CommittedEventID: "projection-milestone-publication-1",
				Text:             "The narrator output transaction is ready.",
			},
		},
		Trigger:                  NarrationTriggerPlanChanged,
		ResolvedInvocation:       validInvocation(RoleNarrator, InvocationOutcomeSucceeded),
		NarratorStateCommittedID: "projection-state-publication",
		CommittedAt:              narratorProjectionTime,
	}
}

func narratorFocusCommit(seed narratorContextSeed, state NarratorState) NarratorFocusCommit {
	return NarratorFocusCommit{
		ConversationID:        seed.conversationID,
		TurnID:                seed.turnID,
		Expected:              narratorExpectation(state),
		SourceThroughSequence: 3,
		CurrentFocus:          "Preserving the authoritative durable-context objective.",
		TopicDescriptor: &NarrationTextCommit{
			NarrationEventID: "focus-topic-descriptor",
			CommittedEventID: "focus-topic-publication",
			Text:             "Stable durable narrator context",
		},
		Trigger:                  NarrationTriggerUserSteered,
		ResolvedInvocation:       validInvocation(RoleNarrator, InvocationOutcomeSucceeded),
		NarratorStateCommittedID: "focus-state-publication",
		CommittedAt:              narratorProjectionTime,
	}
}

func narratorStatusCommit(seed narratorContextSeed, state NarratorState) NarratorStatusCommit {
	return NarratorStatusCommit{
		ConversationID:        seed.conversationID,
		TurnID:                stringPointer(seed.turnID),
		Expected:              narratorExpectation(state),
		SourceSequenceStart:   9,
		SourceThroughSequence: narratorWorkingThroughSequence,
		Question:              "What is happening now?",
		Reply: NarrationTextCommit{
			NarrationEventID: "status-reply",
			CommittedEventID: "status-reply-publication",
			Text:             "The output transaction is being verified while the primary turn continues.",
		},
		ResolvedInvocation:       validInvocation(RoleNarrator, InvocationOutcomeSucceeded),
		NarratorStateCommittedID: "status-state-publication",
		CommittedAt:              narratorStatusTime,
	}
}

func narratorTerminalCommit(seed narratorContextSeed, state NarratorState) NarratorProjectionCommit {
	return NarratorProjectionCommit{
		ConversationID:          seed.conversationID,
		TurnID:                  seed.turnID,
		Expected:                narratorExpectation(state),
		ObservedThroughSequence: narratorTerminalSourceSequence,
		Milestones: []NarrationTextCommit{
			{
				NarrationEventID: "terminal-milestone",
				CommittedEventID: "terminal-milestone-publication",
				Text:             "All narration channels now persist atomically.",
			},
		},
		FinalSummary: &NarrationTextCommit{
			NarrationEventID: "terminal-final-summary",
			CommittedEventID: "terminal-final-publication",
			Text:             "Milestones, status replies, final summaries, and topic descriptors now publish from durable state.",
		},
		Trigger:                  NarrationTriggerTurnTerminal,
		ResolvedInvocation:       validInvocation(RoleNarrator, InvocationOutcomeSucceeded),
		NarratorStateCommittedID: "terminal-state-publication",
		CommittedAt:              narratorTerminalTime,
	}
}

func narratorTerminalFinalizationCommit(seed narratorContextSeed, state NarratorState) NarratorProjectionCommit {
	return NarratorProjectionCommit{
		ConversationID:          seed.conversationID,
		TurnID:                  seed.turnID,
		Expected:                narratorExpectation(state),
		ObservedThroughSequence: state.ObservedThroughSequence,
		Milestones:              []NarrationTextCommit{},
		FinalSummary: &NarrationTextCommit{
			NarrationEventID: "terminal-finalization-final-summary",
			CommittedEventID: "terminal-finalization-final-publication",
			Text:             "The already observed terminal boundary now has a final summary.",
		},
		Trigger:                  NarrationTriggerTurnTerminal,
		ResolvedInvocation:       validInvocation(RoleNarrator, InvocationOutcomeSucceeded),
		NarratorStateCommittedID: "terminal-finalization-state-publication",
		CommittedAt:              narratorTerminalFinalizationTime,
	}
}

func narratorExpectation(state NarratorState) NarratorStateExpectation {
	return NarratorStateExpectation{
		ObservedThroughSequence:   state.ObservedThroughSequence,
		CheckpointThroughSequence: state.CheckpointThroughSequence,
		CurrentFocusRevision:      state.CurrentFocusRevision,
		UpdatedAt:                 state.UpdatedAt,
	}
}

func markNarratorOutputStateCaughtUp(
	t *testing.T,
	store *Store,
	conversationID string,
	state NarratorState,
	sequence int,
) NarratorState {
	t.Helper()
	updated := state
	updated.ObservedThroughSequence = sequence
	updated.CheckpointThroughSequence = sequence
	updated.CheckpointText = "History through the terminal source is already checkpointed."
	updated.UpdatedAt = narratorTerminalTime
	_, err := store.Transact(context.Background(), "mark narrator output state caught up", func(transaction *WriteTransaction) error {
		if err := transaction.UpdateNarratorState(narratorExpectation(state), updated); err != nil {
			return err
		}
		_, err := transaction.AppendCommittedEvent(transactionTestEventDraft(
			"terminal-caught-up-state-publication",
			"conversation:"+conversationID,
			map[string]string{"conversationId": conversationID},
		))
		return err
	})
	if err != nil {
		t.Fatalf("mark narrator output state caught up: %v", err)
	}
	return updated
}

func appendTerminalNarratorSource(t *testing.T, store *Store, seed narratorContextSeed) {
	t.Helper()
	turn := readNarratorOutputTurn(t, store, seed.turnID)
	turn.Status = TurnStatusCompleted
	turn.EndedAt = stringPointer(narratorStatusTime)
	turn.ResolvedInvocation = invocationPointer(
		terminalInvocation(*turn.ResolvedInvocation, InvocationOutcomeSucceeded, narratorStatusTime, nil),
	)
	terminal := contextTrajectoryEvent(seed.conversationID, seed.turnID, narratorTerminalSourceSequence, TrajectoryEventTurnCompleted)
	terminal.EmittedAt = narratorStatusTime
	terminal.Actor = TrajectoryActorProvider
	terminal.TurnCompleted = &TrajectoryTurnCompleted{}
	_, err := store.Transact(context.Background(), "append terminal narrator source", func(transaction *WriteTransaction) error {
		if err := transaction.UpdateTurn(TurnStatusRunning, turn); err != nil {
			return err
		}
		if err := transaction.AppendTrajectoryEvent(terminal); err != nil {
			return err
		}
		_, err := transaction.AppendCommittedEvent(transactionTestEventDraft(
			"terminal-source-publication",
			"conversation:"+seed.conversationID,
			terminal,
		))
		return err
	})
	if err != nil {
		t.Fatalf("append terminal narrator source: %v", err)
	}
}

func appendMismatchedTerminalNarratorSource(t *testing.T, store *Store, seed narratorContextSeed) {
	t.Helper()
	turn := readNarratorOutputTurn(t, store, seed.turnID)
	turn.Status = TurnStatusCompleted
	turn.EndedAt = stringPointer(narratorStatusTime)
	turn.ResolvedInvocation = invocationPointer(
		terminalInvocation(*turn.ResolvedInvocation, InvocationOutcomeSucceeded, narratorStatusTime, nil),
	)
	terminal := contextTrajectoryEvent(seed.conversationID, seed.turnID, narratorTerminalSourceSequence, TrajectoryEventTurnInterrupted)
	terminal.EmittedAt = narratorStatusTime
	terminal.Actor = TrajectoryActorProvider
	terminal.TurnInterrupted = &TrajectoryTurnInterrupted{Reason: TurnInterruptionProviderInterrupted}
	_, err := store.Transact(context.Background(), "append mismatched terminal narrator source", func(transaction *WriteTransaction) error {
		if err := transaction.UpdateTurn(TurnStatusRunning, turn); err != nil {
			return err
		}
		if err := transaction.AppendTrajectoryEvent(terminal); err != nil {
			return err
		}
		_, err := transaction.AppendCommittedEvent(transactionTestEventDraft(
			"mismatched-terminal-source-publication",
			"conversation:"+seed.conversationID,
			terminal,
		))
		return err
	})
	if err != nil {
		t.Fatalf("append mismatched terminal narrator source: %v", err)
	}
}

func assertWorkingProjectionCommit(t *testing.T, result NarratorProjectionCommitResult) {
	t.Helper()
	if result.State.ObservedThroughSequence != narratorWorkingThroughSequence || result.State.CurrentFocusRevision != 1 ||
		result.State.CurrentFocus != "Materializing the authoritative narrator bundle." ||
		result.State.TopicDescriptor != "Durable narrator context and checkpointing" ||
		result.State.LastInvocationAt == nil || *result.State.LastInvocationAt != narratorProjectionTime {
		t.Fatalf("working narrator state = %+v", result.State)
	}
	if result.Conversation != nil {
		t.Fatalf("working conversation projection = %+v", result.Conversation)
	}
	if len(result.Events) != 1 || result.Events[0].Kind != NarrationEventKindMilestone {
		t.Fatalf("working narration events = %+v", result.Events)
	}
	for _, event := range result.Events {
		if event.SourceSequenceStart != 7 || event.SourceSequenceEnd != narratorWorkingThroughSequence {
			t.Fatalf("working narration source range = %d..%d", event.SourceSequenceStart, event.SourceSequenceEnd)
		}
	}
}

func assertStatusCommitDoesNotAdvanceProjection(
	t *testing.T,
	before NarratorState,
	result NarratorStatusCommitResult,
) {
	t.Helper()
	after := result.State
	if after.ObservedThroughSequence != before.ObservedThroughSequence ||
		after.CheckpointThroughSequence != before.CheckpointThroughSequence ||
		after.CurrentFocusRevision != before.CurrentFocusRevision ||
		after.CurrentFocus != before.CurrentFocus || after.TopicDescriptor != before.TopicDescriptor {
		t.Fatalf("status reply changed projection state:\nbefore = %+v\nafter = %+v", before, after)
	}
	if result.Event.Kind != NarrationEventKindStatusReply || result.Event.StatusReply == nil ||
		result.Event.SourceSequenceStart != 9 || result.Event.SourceSequenceEnd != narratorWorkingThroughSequence {
		t.Fatalf("status narration event = %+v", result.Event)
	}
}

func assertTerminalProjectionCommit(t *testing.T, result NarratorProjectionCommitResult) {
	t.Helper()
	if result.State.ObservedThroughSequence != narratorTerminalSourceSequence || result.State.CurrentFocusRevision != 1 {
		t.Fatalf("terminal narrator state = %+v", result.State)
	}
	if result.Conversation != nil {
		t.Fatalf("terminal projection unexpectedly updated conversation: %+v", result.Conversation)
	}
	if len(result.Events) != 2 || result.Events[0].Kind != NarrationEventKindMilestone ||
		result.Events[1].Kind != NarrationEventKindFinalSummary || result.Events[1].FinalSummary == nil {
		t.Fatalf("terminal narration events = %+v", result.Events)
	}
	for _, event := range result.Events {
		if event.SourceSequenceStart != narratorTerminalSourceSequence || event.SourceSequenceEnd != narratorTerminalSourceSequence {
			t.Fatalf("terminal narration source range = %d..%d", event.SourceSequenceStart, event.SourceSequenceEnd)
		}
	}
}

func assertNarratorOutputSnapshot(
	t *testing.T,
	store *Store,
	seed narratorContextSeed,
	wantState NarratorState,
) {
	t.Helper()
	_, state, narration := readNarratorOutputProjection(t, store, seed.conversationID)
	if state.ObservedThroughSequence != wantState.ObservedThroughSequence ||
		state.CurrentFocus != wantState.CurrentFocus {
		t.Fatalf("snapshot narrator state = %+v, want %+v", state, wantState)
	}
	wantKinds := []NarrationEventKind{
		NarrationEventKindFinalSummary,
		NarrationEventKindMilestone,
		NarrationEventKindMilestone,
		NarrationEventKindStatusReply,
		NarrationEventKindMilestone,
		NarrationEventKindFinalSummary,
	}
	if len(narration.Events) != len(wantKinds) {
		t.Fatalf("snapshot narration count = %d, want %d", len(narration.Events), len(wantKinds))
	}
	for index, kind := range wantKinds {
		if narration.Events[index].Kind != kind {
			t.Fatalf("snapshot narration kind %d = %s, want %s", index, narration.Events[index].Kind, kind)
		}
	}
}

func assertNarratorOutputPublications(t *testing.T, store *Store, seed narratorContextSeed) {
	t.Helper()
	streamID, err := ConversationStreamID(seed.conversationID)
	if err != nil {
		t.Fatalf("conversation stream id: %v", err)
	}
	committed, err := store.ReadCommittedStreamEvents(context.Background(), streamID, 1, MaxCommittedEventReadLimit)
	if err != nil {
		t.Fatalf("read narrator output publications: %v", err)
	}
	wantKinds := []ConversationEventType{
		ConversationEventTypeNarratorStateUpdated,
		ConversationEventTypeNarrationCreated,
		ConversationEventTypeNarratorStateUpdated,
		ConversationEventTypeNarrationCreated,
		ConversationEventTypeNarratorStateUpdated,
		ConversationEventTypeNarrationCreated,
		ConversationEventTypeNarrationCreated,
	}
	// The terminal trajectory fixture adds one non-conversation-contract test
	// publication between status and terminal output. Ignore it explicitly.
	contractEvents := make([]CommittedEvent, 0, len(committed))
	for _, event := range committed {
		if event.ID != "terminal-source-publication" {
			contractEvents = append(contractEvents, event)
		}
	}
	if len(contractEvents) != len(wantKinds) {
		t.Fatalf("narrator contract publication count = %d, want %d", len(contractEvents), len(wantKinds))
	}
	for index, event := range contractEvents {
		if event.Kind != string(wantKinds[index]) {
			t.Fatalf("publication kind %d = %s, want %s", index, event.Kind, wantKinds[index])
		}
		decoded, err := conversationEventFromCommitted(event, stringPointer("workspace-1"), seed.conversationID)
		if err != nil {
			t.Fatalf("decode narrator publication %s: %v", event.ID, err)
		}
		if decoded.Sequence != event.StreamSequence || decoded.ConversationID != seed.conversationID {
			t.Fatalf("decoded narrator publication = %+v", decoded)
		}
	}
}

func TestNarratorOutputCommitValidationRejectsCrossChannelShapes(t *testing.T) {
	seed := narratorContextSeed{conversationID: "conversation", turnID: "turn"}
	projection := narratorWorkingCommit(seed)
	projection.FinalSummary = &NarrationTextCommit{
		NarrationEventID: "unexpected-final",
		CommittedEventID: "unexpected-final-publication",
		Text:             "A working projection cannot persist this summary.",
	}
	if err := projection.Validate(); err == nil {
		t.Fatal("working projection accepted final summary")
	}

	projection = narratorWorkingCommit(seed)
	projection.Trigger = NarrationTriggerTurnTerminal
	if err := projection.Validate(); err == nil {
		t.Fatal("terminal projection accepted missing final summary")
	}

	projection = narratorWorkingCommit(seed)
	projection.Trigger = NarrationTriggerInputAccepted
	if err := projection.Validate(); err == nil {
		t.Fatal("projection accepted focus-only trigger")
	}

	status := narratorStatusCommit(seed, NarratorState{
		ObservedThroughSequence:    8,
		CheckpointThroughSequence:  2,
		CurrentFocus:               "Testing narrator status validation.",
		CurrentFocusRevision:       2,
		CurrentFocusSourceSequence: 1,
		UpdatedAt:                  narratorProjectionTime,
	})
	status.SourceSequenceStart = narratorTerminalSourceSequence
	status.SourceThroughSequence = narratorWorkingThroughSequence
	if err := status.Validate(); err == nil {
		t.Fatal("status reply accepted reversed source range")
	}

	if _, err := (*Store)(nil).CommitNarratorProjection(context.Background(), narratorWorkingCommit(seed)); err == nil {
		t.Fatal("nil store accepted narrator projection")
	}
	if _, err := (*Store)(nil).CommitNarratorStatus(context.Background(), status); err == nil {
		t.Fatal("nil store accepted narrator status")
	}
}

func readNarratorOutputTurn(t *testing.T, store *Store, turnID string) ConversationTurn {
	t.Helper()
	var turn ConversationTurn
	err := store.read(context.Background(), "read narrator output turn", func(ctx context.Context, reader *sql.Conn) error {
		var err error
		turn, err = scanConversationTurn(reader.QueryRowContext(ctx, `
SELECT id, conversation_id, authored_input_json, delivery, status, accepted_at,
       started_at, ended_at, requested_role_profile_json,
       resolved_invocation_json, provider_turn_id, error_json
FROM conversation_turns
WHERE id = ?
`, turnID))
		return err
	})
	if err != nil {
		t.Fatalf("read narrator output turn: %v", err)
	}
	return turn
}

func readNarratorOutputProjection(
	t *testing.T,
	store *Store,
	conversationID string,
) (TopicConversation, NarratorState, ConversationNarrationWindow) {
	t.Helper()
	var conversationRecord TopicConversation
	var state NarratorState
	var narration ConversationNarrationWindow
	err := store.read(context.Background(), "read narrator output projection", func(ctx context.Context, reader *sql.Conn) error {
		var err error
		conversationRecord, err = scanTopicConversation(reader.QueryRowContext(ctx, `
SELECT id, workspace_id, title, topic_descriptor, status, created_at, updated_at,
       archived_at, last_trajectory_sequence
FROM conversations
WHERE id = ?
`, conversationID))
		if err != nil {
			return err
		}
		state, err = readSnapshotNarrator(ctx, reader, conversationID)
		if err != nil {
			return err
		}
		narration, err = readSnapshotNarration(ctx, reader, conversationID)
		return err
	})
	if err != nil {
		t.Fatalf("read narrator output projection: %v", err)
	}
	return conversationRecord, state, narration
}
