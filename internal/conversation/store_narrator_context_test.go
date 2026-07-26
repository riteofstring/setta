package conversation

import (
	"context"
	"database/sql"
	"fmt"
	"reflect"
	"testing"
)

const narratorContextCommitTime = "2026-07-11T20:03:00Z"

func TestReadNarratorContextSourceBuildsConsistentTypedWindows(t *testing.T) {
	store := newTestStore(t)
	seed := seedNarratorContext(t, store)

	projection, err := store.ReadNarratorContextSource(context.Background(), NarratorContextReadRequest{
		ConversationID:            seed.conversationID,
		TurnID:                    &seed.turnID,
		Kind:                      NarratorContextReadProjection,
		ProjectionThroughSequence: 11,
		MaxTrajectoryEvents:       4,
		MaxFinalSummaries:         2,
	})
	if err != nil {
		t.Fatalf("read projection narrator context: %v", err)
	}
	assertProjectionNarratorSource(t, projection)

	status, err := store.ReadNarratorContextSource(context.Background(), NarratorContextReadRequest{
		ConversationID:      seed.conversationID,
		Kind:                NarratorContextReadStatus,
		MaxTrajectoryEvents: 3,
		MaxFinalSummaries:   1,
	})
	if err != nil {
		t.Fatalf("read status narrator context: %v", err)
	}
	assertStatusNarratorSource(t, status, seed.turnID)

	checkpoint, err := store.ReadNarratorContextSource(context.Background(), NarratorContextReadRequest{
		ConversationID:      seed.conversationID,
		Kind:                NarratorContextReadCheckpoint,
		MaxTrajectoryEvents: 2,
		MaxFinalSummaries:   0,
	})
	if err != nil {
		t.Fatalf("read checkpoint narrator context: %v", err)
	}
	assertCheckpointNarratorSource(t, checkpoint)

	repeated, err := store.ReadNarratorContextSource(context.Background(), NarratorContextReadRequest{
		ConversationID:            seed.conversationID,
		TurnID:                    &seed.turnID,
		Kind:                      NarratorContextReadProjection,
		ProjectionThroughSequence: 11,
		MaxTrajectoryEvents:       4,
		MaxFinalSummaries:         2,
	})
	if err != nil {
		t.Fatalf("repeat projection narrator context: %v", err)
	}
	if !reflect.DeepEqual(projection, repeated) {
		t.Fatalf("repeated narrator context changed:\nfirst = %#v\nsecond = %#v", projection, repeated)
	}

	cutoff, err := store.ReadNarratorContextSource(context.Background(), NarratorContextReadRequest{
		ConversationID:            seed.conversationID,
		TurnID:                    &seed.turnID,
		Kind:                      NarratorContextReadProjection,
		ProjectionThroughSequence: 8,
		MaxTrajectoryEvents:       10,
		MaxFinalSummaries:         2,
	})
	if err != nil {
		t.Fatalf("read cutoff projection narrator context: %v", err)
	}
	assertNarratorSourceRange(
		t,
		cutoff.Trajectory,
		TrajectorySequenceRange{Start: 3, End: 8},
		3,
		8,
		false,
		false,
	)
}

func assertProjectionNarratorSource(t *testing.T, source NarratorContextSource) {
	t.Helper()
	assertNarratorSourceRange(t, source.Trajectory, TrajectorySequenceRange{Start: 3, End: 11}, 3, 6, false, true)
	if source.CurrentTurn.Turn == nil || source.CurrentTurn.Turn.AuthoredInput.Text != "Implement durable narrator context." {
		t.Fatalf("projection objective = %+v", source.CurrentTurn.Turn)
	}
	if got := source.CurrentTurn.AcceptedSteering; len(got) != 1 || got[0].Sequence != 3 || got[0].Input.Text != "Keep the current constraint authoritative." {
		t.Fatalf("accepted steering = %+v", got)
	}
	if got := source.CurrentTurn.LatestAssistantMessage; got == nil ||
		got.ProviderItemID != "provider-message-1" ||
		got.Text != "The narrator context now includes the final assistant message." {
		t.Fatalf("latest assistant message = %+v", got)
	}
	if source.CurrentTurn.Plan == nil || source.CurrentTurn.Plan.Sequence != 4 {
		t.Fatalf("current plan = %+v", source.CurrentTurn.Plan)
	}
	assertProjectionNarratorActors(t, source)
	assertProjectionNarratorOutputs(t, source)
}

func assertProjectionNarratorActors(t *testing.T, source NarratorContextSource) {
	t.Helper()
	if got := source.CurrentTurn.ActiveActivities; len(got) != 1 || got[0].Activity.ID != "activity-1" || got[0].LatestProgress != "Halfway complete." {
		t.Fatalf("active activities = %+v", got)
	}
	if got := source.CurrentTurn.PendingApprovals; len(got) != 1 || got[0].Approval.ID != "approval-1" {
		t.Fatalf("pending approvals = %+v", got)
	}
	if got := source.CurrentTurn.ActiveSubagents; len(got) != 1 || got[0].Subagent.ID != "subagent-1" {
		t.Fatalf("active subagents = %+v", got)
	}
	if got := source.CurrentTurn.Artifacts; len(got) != 1 || got[0].ID != "artifact-1" {
		t.Fatalf("artifacts = %+v", got)
	}
}

func assertProjectionNarratorOutputs(t *testing.T, source NarratorContextSource) {
	t.Helper()
	if got := source.PriorMilestones; len(got) != 1 || got[0].Milestone.Text != "The durable read boundary is ready." {
		t.Fatalf("prior milestones = %+v", got)
	}
	if got := source.RecentFinalSummaries; len(got) != 1 || got[0].FinalSummary.Text != "The earlier turn established the store." {
		t.Fatalf("recent final summaries = %+v", got)
	}
}

func assertStatusNarratorSource(t *testing.T, source NarratorContextSource, turnID string) {
	t.Helper()
	assertNarratorSourceRange(t, source.Trajectory, TrajectorySequenceRange{Start: 3, End: 11}, 9, 11, true, false)
	if source.CurrentTurn.Turn == nil || source.CurrentTurn.Turn.ID != turnID {
		t.Fatalf("status target turn = %+v", source.CurrentTurn.Turn)
	}
}

func assertCheckpointNarratorSource(t *testing.T, source NarratorContextSource) {
	t.Helper()
	assertNarratorSourceRange(t, source.Trajectory, TrajectorySequenceRange{Start: 3, End: 6}, 3, 4, false, true)
	if len(source.RecentFinalSummaries) != 0 {
		t.Fatalf("checkpoint final summaries = %+v, want none", source.RecentFinalSummaries)
	}
}

func TestCommitNarratorCheckpointIsAtomicOptimisticAndObservedBounded(t *testing.T) {
	store := newTestStore(t)
	seed := seedNarratorContext(t, store)
	expected := NarratorStateExpectation{
		ObservedThroughSequence:   6,
		CheckpointThroughSequence: 2,
		CurrentFocusRevision:      1,
		UpdatedAt:                 testTimeStarted,
	}
	committed, err := store.CommitNarratorCheckpoint(context.Background(), NarratorCheckpointCommit{
		ConversationID:         seed.conversationID,
		Expected:               expected,
		CoveredThroughSequence: 4,
		HistoricalSummary:      "Events three and four preserve the evaluated history.",
		CommittedEventID:       "checkpoint-event-1",
		CommittedAt:            testTimeLater,
	})
	if err != nil {
		t.Fatalf("commit narrator checkpoint: %v", err)
	}
	if committed.ObservedThroughSequence != 6 || committed.CheckpointThroughSequence != 4 ||
		committed.CheckpointText != "Events three and four preserve the evaluated history." ||
		committed.LastInvocationAt == nil || *committed.LastInvocationAt != testTimeLater {
		t.Fatalf("committed narrator checkpoint = %+v", committed)
	}

	afterCommit, err := store.ReadNarratorContextSource(context.Background(), NarratorContextReadRequest{
		ConversationID:      seed.conversationID,
		Kind:                NarratorContextReadCheckpoint,
		MaxTrajectoryEvents: 10,
	})
	if err != nil {
		t.Fatalf("read context after checkpoint: %v", err)
	}
	assertNarratorSourceRange(t, afterCommit.Trajectory, TrajectorySequenceRange{Start: 5, End: 6}, 5, 6, false, false)

	streamID, err := ConversationStreamID(seed.conversationID)
	if err != nil {
		t.Fatalf("conversation stream id: %v", err)
	}
	events, err := store.ReadCommittedStreamEvents(context.Background(), streamID, 0, MaxCommittedEventReadLimit)
	if err != nil {
		t.Fatalf("read committed checkpoint event: %v", err)
	}
	if got := events[len(events)-1].Kind; got != string(ConversationEventTypeNarratorStateUpdated) {
		t.Fatalf("checkpoint committed event kind = %s", got)
	}

	rollbackExpected := NarratorStateExpectation{
		ObservedThroughSequence:   6,
		CheckpointThroughSequence: 4,
		CurrentFocusRevision:      1,
		UpdatedAt:                 testTimeLater,
	}
	_, err = store.CommitNarratorCheckpoint(context.Background(), NarratorCheckpointCommit{
		ConversationID:         seed.conversationID,
		Expected:               rollbackExpected,
		CoveredThroughSequence: 5,
		HistoricalSummary:      "This state mutation must roll back when publication fails.",
		CommittedEventID:       "checkpoint-event-1",
		CommittedAt:            narratorContextCommitTime,
	})
	if err == nil {
		t.Fatal("duplicate checkpoint publication error = nil")
	}
	state := readTestNarratorState(t, store, seed.conversationID)
	if state.CheckpointThroughSequence != 4 || state.CheckpointText != committed.CheckpointText || state.UpdatedAt != testTimeLater {
		t.Fatalf("checkpoint after publication rollback = %+v", state)
	}

	_, err = store.CommitNarratorCheckpoint(context.Background(), NarratorCheckpointCommit{
		ConversationID:         seed.conversationID,
		Expected:               expected,
		CoveredThroughSequence: 5,
		HistoricalSummary:      "A stale response cannot overwrite the committed checkpoint.",
		CommittedEventID:       "checkpoint-event-stale",
		CommittedAt:            narratorContextCommitTime,
	})
	if !IsStateConflict(err) {
		t.Fatalf("stale checkpoint error = %T %v, want StateConflictError", err, err)
	}

	invalid := NarratorCheckpointCommit{
		ConversationID:         seed.conversationID,
		Expected:               rollbackExpected,
		CoveredThroughSequence: 7,
		HistoricalSummary:      "Must not cross the observed cursor.",
		CommittedEventID:       "checkpoint-event-invalid",
		CommittedAt:            narratorContextCommitTime,
	}
	if err := invalid.Validate(); err == nil {
		t.Fatal("checkpoint beyond observed cursor validation error = nil")
	}
}

func TestCommitNarratorCheckpointRejectsMissingTrajectoryInRequestedPrefix(t *testing.T) {
	store := newTestStore(t)
	seed := seedNarratorContext(t, store)
	err := store.write(context.Background(), "corrupt narrator trajectory", func(ctx context.Context, transaction *sql.Tx) error {
		_, err := transaction.ExecContext(ctx, `DELETE FROM trajectory_events WHERE conversation_id = ? AND sequence = 3`, seed.conversationID)
		return err
	})
	if err != nil {
		t.Fatalf("delete narrator trajectory event: %v", err)
	}

	_, err = store.CommitNarratorCheckpoint(context.Background(), NarratorCheckpointCommit{
		ConversationID: seed.conversationID,
		Expected: NarratorStateExpectation{
			ObservedThroughSequence:   6,
			CheckpointThroughSequence: 2,
			CurrentFocusRevision:      1,
			UpdatedAt:                 testTimeStarted,
		},
		CoveredThroughSequence: 4,
		HistoricalSummary:      "A missing event makes this prefix invalid.",
		CommittedEventID:       "checkpoint-event-gap",
		CommittedAt:            testTimeLater,
	})
	if !IsStateConflict(err) {
		t.Fatalf("gapped checkpoint error = %T %v, want StateConflictError", err, err)
	}
	if state := readTestNarratorState(t, store, seed.conversationID); state.CheckpointThroughSequence != 2 {
		t.Fatalf("checkpoint cursor after rejected gap = %d, want 2", state.CheckpointThroughSequence)
	}
}

type narratorContextSeed struct {
	conversationID string
	turnID         string
}

func seedNarratorContext(t *testing.T, store *Store) narratorContextSeed {
	t.Helper()
	conversationRecord := transactionTestConversation("conversation-narrator-context")
	conversationRecord.Title = "Narrator context"
	conversationRecord.TopicDescriptor = "Durable narrator context and checkpointing"
	conversationRecord.Status = ConversationStatusWorking
	turn := validConversationTurn(TurnStatusRunning)
	turn.ID = "turn-current"
	turn.ConversationID = conversationRecord.ID
	turn.AuthoredInput = AuthoredInput{Text: "Implement durable narrator context."}
	priorTurn := validConversationTurn(TurnStatusCompleted)
	priorTurn.ID = "turn-prior"
	priorTurn.ConversationID = conversationRecord.ID
	events := narratorContextTrajectory(conversationRecord.ID, turn)
	state := NarratorState{
		ConversationID:             conversationRecord.ID,
		ObservedThroughSequence:    6,
		CheckpointThroughSequence:  2,
		CheckpointText:             "Historical text that must not override current steering.",
		CurrentFocus:               "Materializing the authoritative narrator bundle.",
		CurrentFocusRevision:       1,
		CurrentFocusSourceSequence: 1,
		TopicDescriptor:            conversationRecord.TopicDescriptor,
		Status:                     NarratorStatusReady,
		UpdatedAt:                  testTimeStarted,
	}
	artifactSequence := 9
	artifact := Artifact{
		ID:                 "artifact-1",
		ConversationID:     conversationRecord.ID,
		TurnID:             &turn.ID,
		TrajectorySequence: &artifactSequence,
		Title:              "Narrator context report",
		Kind:               "Report",
		Summary:            "The context the narrator was given for this turn.",
		CreatedAt:          testTimeEnded,
		Document:           testArtifactDocument(),
	}
	milestone := narratorContextNarration(
		"narration-milestone-context",
		turn.ID,
		NarrationEventKindMilestone,
		3,
		6,
	)
	milestone.Trigger = NarrationTriggerPhaseActivityCompleted
	milestone.Milestone = &NarrationMilestone{Text: "The durable read boundary is ready."}
	finalSummary := narratorContextNarration(
		"narration-final-prior",
		priorTurn.ID,
		NarrationEventKindFinalSummary,
		1,
		2,
	)
	finalSummary.Trigger = NarrationTriggerTurnTerminal
	finalSummary.FinalSummary = &NarrationFinalSummary{Text: "The earlier turn established the store."}
	_, err := store.Transact(context.Background(), "seed narrator context", func(transaction *WriteTransaction) error {
		if err := transaction.InsertConversation(conversationRecord); err != nil {
			return err
		}
		if err := transaction.InsertTurn(turn); err != nil {
			return err
		}
		if err := transaction.InsertTurn(priorTurn); err != nil {
			return err
		}
		for _, event := range events {
			if err := transaction.AppendTrajectoryEvent(event); err != nil {
				return err
			}
		}
		if err := transaction.InsertArtifact(artifact); err != nil {
			return err
		}
		if err := transaction.InsertNarratorState(state); err != nil {
			return err
		}
		if _, err := transaction.AppendNarrationEvent(finalSummary); err != nil {
			return err
		}
		if _, err := transaction.AppendNarrationEvent(milestone); err != nil {
			return err
		}
		_, err := transaction.AppendCommittedEvent(transactionTestEventDraft(
			"seed-narrator-context",
			"conversation:"+conversationRecord.ID,
			conversationRecord,
		))
		return err
	})
	if err != nil {
		t.Fatalf("seed narrator context: %v", err)
	}
	return narratorContextSeed{conversationID: conversationRecord.ID, turnID: turn.ID}
}

func narratorContextTrajectory(conversationID string, turn ConversationTurn) []TrajectoryEvent {
	command := "./check_quality.sh --git-changes"
	cwd := "/workspace"
	activity := TrajectoryActivity{
		ID:      "activity-1",
		Kind:    TrajectoryActivityCommand,
		Title:   "Run focused verification",
		Command: &command,
		CWD:     &cwd,
	}
	approval := TrajectoryApprovalRequest{
		ID:             "approval-1",
		ProviderItemID: "provider-approval-1",
		Kind:           TrajectoryApprovalKindCommand,
		Title:          "Run verification",
		Body:           "Allow the focused quality command.",
		Command:        &command,
		CWD:            &cwd,
		FilePaths:      []string{},
		Questions:      []TrajectoryApprovalQuestion{},
		RequestedAt:    testTimeStarted,
	}
	planExplanation := "Persist and materialize narrator context."
	events := []TrajectoryEvent{
		contextTrajectoryEvent(conversationID, turn.ID, 1, TrajectoryEventUserInputAccepted),
		contextTrajectoryEvent(conversationID, turn.ID, 2, TrajectoryEventTurnStarted),
		contextTrajectoryEvent(conversationID, turn.ID, 3, TrajectoryEventTurnSteered),
		contextTrajectoryEvent(conversationID, turn.ID, 4, TrajectoryEventPlanChanged),
		contextTrajectoryEvent(conversationID, turn.ID, 5, TrajectoryEventActivityStarted),
		contextTrajectoryEvent(conversationID, turn.ID, 6, TrajectoryEventActivityProgressed),
		contextTrajectoryEvent(conversationID, turn.ID, 7, TrajectoryEventApprovalRequested),
		contextTrajectoryEvent(conversationID, turn.ID, 8, TrajectoryEventSubagentStarted),
		contextTrajectoryEvent(conversationID, turn.ID, 9, TrajectoryEventArtifactEmitted),
		contextTrajectoryEvent(conversationID, turn.ID, 10, TrajectoryEventAgentPublicTextDelta),
		contextTrajectoryEvent(conversationID, turn.ID, 11, TrajectoryEventAgentMessageCompleted),
	}
	events[0].Actor = TrajectoryActorUser
	events[0].UserInputAccepted = &TrajectoryUserInputAccepted{Input: turn.AuthoredInput, Delivery: turn.Delivery}
	events[1].TurnStarted = &TrajectoryTurnStarted{Invocation: *turn.ResolvedInvocation}
	events[2].Actor = TrajectoryActorUser
	events[2].TurnSteered = &TrajectoryTurnSteered{Input: AuthoredInput{Text: "Keep the current constraint authoritative."}}
	events[3].PlanChanged = &TrajectoryPlanChanged{
		Explanation: &planExplanation,
		Steps: []PlanStep{
			{Text: "Read durable state.", Status: PlanStepStatusCompleted},
			{Text: "Materialize ordered context.", Status: PlanStepStatusInProgress},
		},
	}
	events[4].ActivityStarted = &TrajectoryActivityStarted{Activity: activity}
	events[5].ActivityProgressed = &TrajectoryActivityProgressed{ActivityID: activity.ID, Progress: "Halfway complete."}
	events[6].ApprovalRequested = &TrajectoryApprovalRequested{Approval: approval}
	events[7].SubagentStarted = &TrajectorySubagentStarted{Subagent: Subagent{
		ID:     "subagent-1",
		Status: SubagentStatusRunning,
	}}
	events[8].ArtifactEmitted = &TrajectoryArtifactEmitted{
		ArtifactID: "artifact-1",
		Title:      "Narrator context artifact",
	}
	events[9].AgentPublicTextDelta = &TrajectoryAgentPublicTextDelta{
		ProviderItemID: "provider-message-1",
		Delta:          "Materializing context.",
	}
	events[10].AgentMessageCompleted = &TrajectoryAgentMessageCompleted{
		ProviderItemID: "provider-message-1",
		Text:           "The narrator context now includes the final assistant message.",
	}
	return events
}

func contextTrajectoryEvent(
	conversationID string,
	turnID string,
	sequence int,
	kind TrajectoryEventKind,
) TrajectoryEvent {
	return TrajectoryEvent{
		ID:             "narrator-context-event-" + fmt.Sprint(sequence),
		ConversationID: conversationID,
		TurnID:         &turnID,
		Sequence:       sequence,
		EmittedAt:      testTimeStarted,
		Kind:           kind,
		Actor:          TrajectoryActorAgent,
	}
}

func narratorContextNarration(
	id string,
	turnID string,
	kind NarrationEventKind,
	start int,
	end int,
) NarrationEvent {
	return NarrationEvent{
		ID:                  id,
		ConversationID:      "conversation-narrator-context",
		TurnID:              &turnID,
		Kind:                kind,
		SourceSequenceStart: start,
		SourceSequenceEnd:   end,
		ResolvedInvocation:  validInvocation(RoleNarrator, InvocationOutcomeSucceeded),
		CreatedAt:           testTimeEnded,
	}
}

func assertNarratorSourceRange(
	t *testing.T,
	window NarratorTrajectoryWindow,
	available TrajectorySequenceRange,
	includedStart int,
	includedEnd int,
	hasEarlier bool,
	hasLater bool,
) {
	t.Helper()
	if window.AvailableRange == nil || *window.AvailableRange != available {
		t.Fatalf("available range = %+v, want %+v", window.AvailableRange, available)
	}
	wantIncluded := TrajectorySequenceRange{Start: includedStart, End: includedEnd}
	if window.IncludedRange == nil || *window.IncludedRange != wantIncluded {
		t.Fatalf("included range = %+v, want %+v", window.IncludedRange, wantIncluded)
	}
	if window.HasEarlier != hasEarlier || window.HasLater != hasLater {
		t.Fatalf("continuation flags = (%t, %t), want (%t, %t)", window.HasEarlier, window.HasLater, hasEarlier, hasLater)
	}
	if len(window.Events) != includedEnd-includedStart+1 {
		t.Fatalf("window event count = %d", len(window.Events))
	}
}

func readTestNarratorState(t *testing.T, store *Store, conversationID string) NarratorState {
	t.Helper()
	var state NarratorState
	err := store.read(context.Background(), "read narrator state in test", func(ctx context.Context, reader *sql.Conn) error {
		var err error
		state, err = readSnapshotNarrator(ctx, reader, conversationID)
		return err
	})
	if err != nil {
		t.Fatalf("read narrator state: %v", err)
	}
	return state
}
