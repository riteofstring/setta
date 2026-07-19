package narration

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
	"testing"

	"setta/internal/conversation"
)

const narratorContextTestTime = "2026-07-12T12:00:00Z"

func TestContextMaterializerBuildsDeterministicAuthoritativeProjection(t *testing.T) {
	source := newFakeNarratorContextSource(8)
	source.state.ObservedThroughSequence = 2
	source.state.CheckpointThroughSequence = 2
	source.state.CheckpointText = "The old checkpoint says to ignore the new constraint."
	source.state.CurrentFocus = "Reading the durable trajectory."
	source.state.CurrentFocusRevision = 1
	source.state.CurrentFocusSourceSequence = 1
	source.steering = []conversation.NarratorAcceptedSteering{{
		Sequence: 3,
		Input:    conversation.AuthoredInput{Text: "The new constraint remains authoritative."},
	}}
	source.milestones = []conversation.NarrationEvent{
		fakeMilestone("milestone-1", 1, "The store is ready."),
		fakeMilestone("milestone-2", 2, "The context read is consistent."),
	}
	source.finalSummaries = []conversation.NarrationEvent{
		fakeFinalSummary("summary-1", "turn-prior", 2, "Earlier work established persistence."),
	}
	materializer := newFakeContextMaterializer(t, source)
	request := ProjectionContextRequest{
		ConversationID:  source.conversation.ID,
		TurnID:          source.turn.ID,
		Trigger:         conversation.NarrationTriggerPlanChanged,
		ThroughSequence: 5,
		SemanticEvents: []conversation.NarratorSemanticEvent{
			fakeSemanticProgress(source, 4),
			fakeSemanticPlan(source, 5),
		},
		Limits: testContextLimits(3),
	}

	bundle, err := materializer.Projection(context.Background(), request)
	if err != nil {
		t.Fatalf("materialize projection: %v", err)
	}
	if bundle.RequestedChannel != ProjectionChannelWorking {
		t.Fatalf("projection channel = %s", bundle.RequestedChannel)
	}
	assertSequenceRange(t, bundle.EvaluationRange, 3, 5)
	assertOptionalSequenceRange(t, bundle.RemainingUnobservedRange, 6, 8)
	assertOptionalSequenceRange(t, bundle.SemanticSourceRange, 4, 5)
	if got := semanticSequences(bundle.SemanticEvents); !reflect.DeepEqual(got, []int{4, 5}) {
		t.Fatalf("projection semantic events = %v", got)
	}
	if bundle.HistoricalCheckpoint == nil ||
		bundle.HistoricalCheckpoint.Authority != ContextAuthorityHistorical ||
		bundle.HistoricalCheckpoint.HistoricalSummary != source.state.CheckpointText {
		t.Fatalf("historical checkpoint = %+v", bundle.HistoricalCheckpoint)
	}
	instructions := bundle.Authoritative.CurrentInstructions
	if instructions == nil || instructions.Objective.Text != source.turn.AuthoredInput.Text ||
		instructions.Authority != ContextAuthorityCurrentInputs ||
		len(instructions.AcceptedSteering) != 1 ||
		instructions.AcceptedSteering[0].Input.Text != "The new constraint remains authoritative." {
		t.Fatalf("authoritative instructions = %+v", instructions)
	}
	if len(bundle.PriorMilestones) != 2 || len(bundle.PriorFinalSummaries) != 1 {
		t.Fatalf("prior narration = milestones %+v, summaries %+v", bundle.PriorMilestones, bundle.PriorFinalSummaries)
	}
	assertEncodedContextBytes(t, bundle.InputBytes, bundle)

	repeated, err := materializer.Projection(context.Background(), request)
	if err != nil {
		t.Fatalf("repeat materialize projection: %v", err)
	}
	if !reflect.DeepEqual(bundle, repeated) {
		t.Fatalf("repeated projection changed:\nfirst = %#v\nsecond = %#v", bundle, repeated)
	}
}

func TestContextMaterializerReadsOneAuthoritativeStoreSnapshot(t *testing.T) {
	store, err := conversation.NewStore(t.TempDir())
	if err != nil {
		t.Fatalf("new conversation store: %v", err)
	}
	t.Cleanup(func() {
		if err := store.Close(); err != nil {
			t.Errorf("close conversation store: %v", err)
		}
	})
	conversationID := "conversation-store-context"
	turnID := "turn-store-context"
	topic := conversation.TopicConversation{
		ID:              conversationID,
		WorkspaceID:     "workspace-store-context",
		Title:           "Store-backed narrator context",
		TopicDescriptor: "Read context from the durable aggregate",
		Status:          conversation.ConversationStatusIdle,
		CreatedAt:       narratorContextTestTime,
		UpdatedAt:       narratorContextTestTime,
	}
	turn := conversation.ConversationTurn{
		ID:                   turnID,
		ConversationID:       conversationID,
		AuthoredInput:        conversation.AuthoredInput{Text: "Read the authoritative SQLite snapshot."},
		Delivery:             conversation.TurnDeliveryNormal,
		Status:               conversation.TurnStatusQueued,
		AcceptedAt:           narratorContextTestTime,
		RequestedRoleProfile: conversation.DefaultAgentRoleProfile(),
	}
	events := []conversation.TrajectoryEvent{
		storeContextEvent(conversationID, turnID, 1, conversation.TrajectoryEventUserInputAccepted),
		storeContextEvent(conversationID, turnID, 2, conversation.TrajectoryEventTurnSteered),
		storeContextEvent(conversationID, turnID, 3, conversation.TrajectoryEventPlanChanged),
	}
	events[0].Actor = conversation.TrajectoryActorUser
	events[0].UserInputAccepted = &conversation.TrajectoryUserInputAccepted{
		Input:    turn.AuthoredInput,
		Delivery: turn.Delivery,
	}
	events[1].Actor = conversation.TrajectoryActorUser
	events[1].TurnSteered = &conversation.TrajectoryTurnSteered{
		Input: conversation.AuthoredInput{Text: "Do not replace current steering with checkpoint text."},
	}
	events[2].PlanChanged = &conversation.TrajectoryPlanChanged{
		Steps: []conversation.PlanStep{{
			Text:   "Materialize the durable context.",
			Status: conversation.PlanStepStatusInProgress,
		}},
	}
	state := conversation.NarratorState{
		ConversationID:  conversationID,
		TopicDescriptor: topic.TopicDescriptor,
		Status:          conversation.NarratorStatusReady,
		UpdatedAt:       narratorContextTestTime,
	}
	streamID, err := conversation.ConversationStreamID(conversationID)
	if err != nil {
		t.Fatalf("conversation stream id: %v", err)
	}
	_, err = store.Transact(context.Background(), "seed store-backed narrator context", func(transaction *conversation.WriteTransaction) error {
		if err := transaction.InsertConversation(topic); err != nil {
			return err
		}
		if err := transaction.InsertTurn(turn); err != nil {
			return err
		}
		for _, event := range events {
			if err := transaction.AppendTrajectoryEvent(event); err != nil {
				return err
			}
		}
		if err := transaction.InsertNarratorState(state); err != nil {
			return err
		}
		_, err := transaction.AppendCommittedEvent(conversation.CommittedEventDraft{
			ID:          "store-context-created",
			StreamID:    streamID,
			Kind:        "narrator_context_test_seeded",
			Payload:     topic,
			CommittedAt: narratorContextTestTime,
		})
		return err
	})
	if err != nil {
		t.Fatalf("seed store-backed narrator context: %v", err)
	}

	materializer, err := NewContextMaterializer(store)
	if err != nil {
		t.Fatalf("new store context materializer: %v", err)
	}
	bundle, err := materializer.Projection(context.Background(), ProjectionContextRequest{
		ConversationID:  conversationID,
		TurnID:          turnID,
		Trigger:         conversation.NarrationTriggerPlanChanged,
		ThroughSequence: 3,
		SemanticEvents: []conversation.NarratorSemanticEvent{
			fakeSemanticProgressForIDs(conversationID, turnID, 3),
		},
		Limits: testContextLimits(3),
	})
	if err != nil {
		t.Fatalf("materialize store-backed projection: %v", err)
	}
	assertSequenceRange(t, bundle.EvaluationRange, 1, 3)
	if bundle.Authoritative.CurrentInstructions == nil ||
		bundle.Authoritative.CurrentInstructions.Objective.Text != turn.AuthoredInput.Text ||
		len(bundle.Authoritative.CurrentInstructions.AcceptedSteering) != 1 ||
		bundle.Authoritative.CurrentPlan == nil || bundle.Authoritative.CurrentPlan.Sequence != 3 {
		t.Fatalf("store-backed authoritative context = %+v", bundle.Authoritative)
	}
}

func TestProjectionContextDoesNotConsumeLaterTurnBeyondRequestedCutoff(t *testing.T) {
	source := newFakeNarratorContextSource(8)
	laterTurnID := "turn-later"
	for index := 5; index < len(source.events); index++ {
		source.events[index].TurnID = &laterTurnID
	}
	source.state.ObservedThroughSequence = 2
	source.state.CheckpointThroughSequence = 2
	source.state.CheckpointText = "Events one and two are historical."
	materializer := newFakeContextMaterializer(t, source)

	bundle, err := materializer.Projection(context.Background(), ProjectionContextRequest{
		ConversationID:  source.conversation.ID,
		TurnID:          source.turn.ID,
		Trigger:         conversation.NarrationTriggerPlanChanged,
		ThroughSequence: 5,
		SemanticEvents: []conversation.NarratorSemanticEvent{
			fakeSemanticProgress(source, 5),
		},
		Limits: testContextLimits(8),
	})
	if err != nil {
		t.Fatalf("materialize cutoff projection: %v", err)
	}
	if bundle.RequestedThroughSequence != 5 ||
		bundle.Authoritative.Conversation.LatestTrajectorySequence != 8 {
		t.Fatalf("projection cutoff/latest = %d/%d", bundle.RequestedThroughSequence, bundle.Authoritative.Conversation.LatestTrajectorySequence)
	}
	assertSequenceRange(t, bundle.EvaluationRange, 3, 5)
	assertOptionalSequenceRange(t, bundle.RemainingUnobservedRange, 6, 8)
	if err := bundle.ValidateObservedAdvance(6); err == nil {
		t.Fatal("observed advance beyond requested cutoff error = nil")
	}
}

func TestContextMaterializerProjectionUsesSemanticEventsWithoutCheckpointCatchUp(t *testing.T) {
	source := newFakeNarratorContextSource(9)
	source.state.ObservedThroughSequence = 3
	source.state.CheckpointThroughSequence = 0
	materializer := newFakeContextMaterializer(t, source)
	projectionRequest := ProjectionContextRequest{
		ConversationID:  source.conversation.ID,
		TurnID:          source.turn.ID,
		Trigger:         conversation.NarrationTriggerPhaseActivityCompleted,
		ThroughSequence: 9,
		SemanticEvents: []conversation.NarratorSemanticEvent{
			fakeSemanticProgress(source, 9),
		},
		Limits: testContextLimits(2),
	}

	projection, err := materializer.Projection(context.Background(), projectionRequest)
	if err != nil {
		t.Fatalf("materialize semantic projection without checkpoint catch-up: %v", err)
	}
	assertSequenceRange(t, projection.EvaluationRange, 4, 9)
	assertOptionalSequenceRange(t, projection.SemanticSourceRange, 9, 9)
	if got := semanticSequences(projection.SemanticEvents); !reflect.DeepEqual(got, []int{9}) {
		t.Fatalf("semantic projection events = %v", got)
	}

	checkpoint, err := materializer.Checkpoint(context.Background(), CheckpointContextRequest{
		ConversationID: source.conversation.ID,
		TurnID:         &source.turn.ID,
		Limits:         testContextLimits(2),
	})
	if err != nil {
		t.Fatalf("materialize checkpoint catch-up: %v", err)
	}
	assertSequenceRange(t, checkpoint.RequestedRange, 1, 2)
	assertOptionalSequenceRange(t, checkpoint.RemainingEligibleRange, 3, 3)
}

func TestContextMaterializerBuildsTerminalProjectionWithoutCheckpointCatchUp(t *testing.T) {
	source := newFakeNarratorContextSource(9)
	source.state.ObservedThroughSequence = 3
	source.state.CheckpointThroughSequence = 0
	endedAt := "2026-07-12T12:01:00Z"
	source.conversation.Status = conversation.ConversationStatusIdle
	source.turn.Status = conversation.TurnStatusCompleted
	source.turn.EndedAt = &endedAt
	source.events[8].Kind = conversation.TrajectoryEventTurnCompleted
	source.events[8].Actor = conversation.TrajectoryActorProvider
	source.events[8].AgentPublicTextDelta = nil
	source.events[8].TurnCompleted = &conversation.TrajectoryTurnCompleted{}
	materializer := newFakeContextMaterializer(t, source)

	bundle, err := materializer.Projection(context.Background(), ProjectionContextRequest{
		ConversationID:  source.conversation.ID,
		TurnID:          source.turn.ID,
		Trigger:         conversation.NarrationTriggerTurnTerminal,
		ThroughSequence: 9,
		SemanticEvents: []conversation.NarratorSemanticEvent{
			fakeTerminalSemantic(source, 9, conversation.NarratorSemanticEventTaskCompleted),
		},
		Limits: testContextLimits(2),
	})
	if err != nil {
		t.Fatalf("materialize terminal projection without checkpoint catch-up: %v", err)
	}
	if bundle.RequestedChannel != ProjectionChannelTerminal {
		t.Fatalf("terminal channel = %s", bundle.RequestedChannel)
	}
	assertSequenceRange(t, bundle.EvaluationRange, 4, 9)
	if got := semanticSequences(bundle.SemanticEvents); !reflect.DeepEqual(got, []int{9}) {
		t.Fatalf("terminal semantic events = %v", got)
	}
	if bundle.RemainingUnobservedRange != nil {
		t.Fatalf("terminal projection left remaining range: %+v", bundle.RemainingUnobservedRange)
	}
	if err := bundle.ValidateObservedAdvance(9); err != nil {
		t.Fatalf("terminal observed advance validation: %v", err)
	}
	if len(source.requests) != 1 ||
		source.requests[0].Kind != conversation.NarratorContextReadProjection ||
		source.requests[0].ProjectionThroughSequence != 9 {
		t.Fatalf("terminal context requests = %+v", source.requests)
	}
}

func TestProjectionContextConstrainsObservedCursorToSuppliedWindow(t *testing.T) {
	source := newFakeNarratorContextSource(6)
	source.state.ObservedThroughSequence = 2
	source.state.CheckpointThroughSequence = 2
	source.state.CheckpointText = "Events one and two are historical."
	materializer := newFakeContextMaterializer(t, source)
	bundle, err := materializer.Projection(context.Background(), ProjectionContextRequest{
		ConversationID:  source.conversation.ID,
		TurnID:          source.turn.ID,
		Trigger:         conversation.NarrationTriggerPlanChanged,
		ThroughSequence: 6,
		SemanticEvents: []conversation.NarratorSemanticEvent{
			fakeSemanticProgress(source, 6),
		},
		Limits: testContextLimits(3),
	})
	if err != nil {
		t.Fatalf("materialize projection cursor window: %v", err)
	}
	if err := bundle.ValidateObservedAdvance(4); err != nil {
		t.Fatalf("validate partial observed advance: %v", err)
	}
	for _, invalid := range []int{2, 7} {
		if err := bundle.ValidateObservedAdvance(invalid); err == nil {
			t.Errorf("ValidateObservedAdvance(%d) error = nil", invalid)
		}
	}
}

func TestContextMaterializerBuildsTerminalFinalizationAtObservedCursor(t *testing.T) {
	source := newFakeNarratorContextSource(6)
	source.state.ObservedThroughSequence = 6
	source.state.CheckpointThroughSequence = 6
	source.state.CheckpointText = "The failed terminal event is already represented in the checkpoint."
	source.turn.Status = conversation.TurnStatusFailed
	endedAt := "2026-07-12T12:01:00Z"
	source.turn.EndedAt = &endedAt
	source.turn.Error = &conversation.Failure{
		Code:    "provider_turn_failed",
		Message: "scripted terminal failure",
	}
	materializer := newFakeContextMaterializer(t, source)

	bundle, err := materializer.Projection(context.Background(), ProjectionContextRequest{
		ConversationID:  source.conversation.ID,
		TurnID:          source.turn.ID,
		Trigger:         conversation.NarrationTriggerTurnTerminal,
		ThroughSequence: 6,
		Limits:          testContextLimits(3),
	})
	if err != nil {
		t.Fatalf("materialize observed terminal finalization: %v", err)
	}
	if bundle.RequestedChannel != ProjectionChannelTerminal {
		t.Fatalf("terminal finalization channel = %s", bundle.RequestedChannel)
	}
	assertSequenceRange(t, bundle.EvaluationRange, 6, 6)
	if len(bundle.SemanticEvents) != 0 || bundle.SemanticSourceRange != nil {
		t.Fatalf("terminal finalization semantic events = %+v range=%+v", bundle.SemanticEvents, bundle.SemanticSourceRange)
	}

	source.currentTurnFinalSummary = fakeFinalSummaryEvent(source.conversation.ID, source.turn.ID, 6)
	_, err = materializer.Projection(context.Background(), ProjectionContextRequest{
		ConversationID:  source.conversation.ID,
		TurnID:          source.turn.ID,
		Trigger:         conversation.NarrationTriggerTurnTerminal,
		ThroughSequence: 6,
		Limits:          testContextLimits(3),
	})
	if !errors.Is(err, ErrNoProjectionWork) {
		t.Fatalf("terminal finalization with existing final summary error = %T %v, want ErrNoProjectionWork", err, err)
	}
}

func TestContextMaterializerBudgetsRequiredSemanticProjectionContext(t *testing.T) {
	source := newFakeNarratorContextSource(7)
	materializer := newFakeContextMaterializer(t, source)
	request := ProjectionContextRequest{
		ConversationID:  source.conversation.ID,
		TurnID:          source.turn.ID,
		Trigger:         conversation.NarrationTriggerPlanChanged,
		ThroughSequence: 7,
		SemanticEvents: []conversation.NarratorSemanticEvent{
			fakeSemanticProgress(source, 7),
		},
		Limits: testContextLimits(2),
	}
	full, err := materializer.Projection(context.Background(), request)
	if err != nil {
		t.Fatalf("materialize semantic projection: %v", err)
	}

	boundedRequest := request
	boundedRequest.Limits.MaxTrajectoryEvents = 7
	boundedRequest.Limits.MaxInputBytes = full.InputBytes
	bounded, err := materializer.Projection(context.Background(), boundedRequest)
	if err != nil {
		t.Fatalf("materialize byte-bounded semantic projection: %v", err)
	}
	if got := semanticSequences(bounded.SemanticEvents); !reflect.DeepEqual(got, []int{7}) {
		t.Fatalf("byte-bounded semantic events = %v", got)
	}
	if bounded.InputBytes != full.InputBytes {
		t.Fatalf("bounded input bytes = %d, want %d", bounded.InputBytes, full.InputBytes)
	}

	tooSmall := boundedRequest
	tooSmall.Limits.MaxInputBytes = 1
	_, err = materializer.Projection(context.Background(), tooSmall)
	var budgetError *ContextBudgetError
	if !errors.Is(err, ErrContextBudgetExceeded) || !errors.As(err, &budgetError) {
		t.Fatalf("required context error = %T %v, want ContextBudgetError", err, err)
	}
	if budgetError.RequiredBytes <= budgetError.MaxInputBytes {
		t.Fatalf("budget error = %+v", budgetError)
	}
}

func TestStatusContextUsesLatestSuffixAndReportsOmittedUnobservedRange(t *testing.T) {
	source := newFakeNarratorContextSource(10)
	source.state.ObservedThroughSequence = 3
	source.state.CheckpointThroughSequence = 2
	source.state.CheckpointText = "The first two events are historical."
	materializer := newFakeContextMaterializer(t, source)

	bundle, err := materializer.Status(context.Background(), StatusContextRequest{
		ConversationID: source.conversation.ID,
		Question:       "What is happening now?",
		Limits:         testContextLimits(3),
	})
	if err != nil {
		t.Fatalf("materialize status: %v", err)
	}
	if got := trajectorySequences(bundle.LatestEvents); !reflect.DeepEqual(got, []int{8, 9, 10}) {
		t.Fatalf("status latest events = %v", got)
	}
	assertOptionalSequenceRange(t, bundle.IncludedRange, 8, 10)
	assertOptionalSequenceRange(t, bundle.OmittedTrajectoryRange, 3, 7)
	assertOptionalSequenceRange(t, bundle.OmittedUnobservedRange, 4, 7)
	if bundle.PreCallCursor.ObservedThroughSequence != 3 || bundle.SourceThroughSequence != 10 {
		t.Fatalf("status cursors = pre %+v, source %d", bundle.PreCallCursor, bundle.SourceThroughSequence)
	}
	if source.state.ObservedThroughSequence != 3 {
		t.Fatalf("status materialization mutated observed cursor to %d", source.state.ObservedThroughSequence)
	}
	assertEncodedContextBytes(t, bundle.InputBytes, bundle)
}

func TestStatusContextFailsWhenLatestCompleteEventDoesNotFit(t *testing.T) {
	source := newFakeNarratorContextSource(1)
	materializer := newFakeContextMaterializer(t, source)
	request := StatusContextRequest{
		ConversationID: source.conversation.ID,
		Question:       "What is happening now?",
		Limits:         testContextLimits(1),
	}

	full, err := materializer.Status(context.Background(), request)
	if err != nil {
		t.Fatalf("materialize full status: %v", err)
	}
	withoutLatest := full
	withoutLatest.LatestEvents = []conversation.TrajectoryEvent{}
	available := conversation.TrajectorySequenceRange{Start: 1, End: 1}
	setStatusRanges(&withoutLatest, &available, source.state.ObservedThroughSequence)
	baseBytes, err := contextBytes(withoutLatest)
	if err != nil {
		t.Fatalf("measure status required fields: %v", err)
	}
	request.Limits.MaxInputBytes = baseBytes

	_, err = materializer.Status(context.Background(), request)
	var budgetErr *ContextBudgetError
	if !errors.Is(err, ErrContextBudgetExceeded) || !errors.As(err, &budgetErr) {
		t.Fatalf("latest status event error = %T %v, want ContextBudgetError", err, err)
	}
	if budgetErr.RequiredBytes <= budgetErr.MaxInputBytes {
		t.Fatalf("latest status event budget error = %+v", budgetErr)
	}
}

func TestCheckpointOutputRequiresExactMaterializedCoverage(t *testing.T) {
	source := newFakeNarratorContextSource(8)
	source.state.ObservedThroughSequence = 5
	source.state.CheckpointThroughSequence = 2
	source.state.CheckpointText = "Events one and two are historical."
	materializer := newFakeContextMaterializer(t, source)
	bundle, err := materializer.Checkpoint(context.Background(), CheckpointContextRequest{
		ConversationID: source.conversation.ID,
		TurnID:         &source.turn.ID,
		Limits:         testContextLimits(2),
	})
	if err != nil {
		t.Fatalf("materialize checkpoint: %v", err)
	}
	assertSequenceRange(t, bundle.RequestedRange, 3, 4)
	assertOptionalSequenceRange(t, bundle.RemainingEligibleRange, 5, 5)
	if got := trajectorySequences(bundle.Trajectory); !reflect.DeepEqual(got, []int{3, 4}) {
		t.Fatalf("checkpoint trajectory = %v", got)
	}

	output := CheckpointOutput{
		CoveredThroughSequence: 4,
		HistoricalSummary:      "Events three and four preserve only evaluated historical facts.",
	}
	if err := output.Validate(bundle); err != nil {
		t.Fatalf("validate exact checkpoint output: %v", err)
	}

	invalid := output
	invalid.CoveredThroughSequence = 3
	if err := invalid.Validate(bundle); err == nil {
		t.Fatal("partial checkpoint coverage validation error = nil")
	}
	invalid = output
	invalid.HistoricalSummary = string(make([]byte, bundle.MaxHistoricalSummaryBytes+1))
	if err := invalid.Validate(bundle); err == nil {
		t.Fatal("oversized checkpoint summary validation error = nil")
	}
}

type fakeNarratorContextSource struct {
	conversation            conversation.TopicConversation
	state                   conversation.NarratorState
	turn                    conversation.ConversationTurn
	events                  []conversation.TrajectoryEvent
	steering                []conversation.NarratorAcceptedSteering
	milestones              []conversation.NarrationEvent
	currentTurnFinalSummary *conversation.NarrationEvent
	finalSummaries          []conversation.NarrationEvent
	requests                []conversation.NarratorContextReadRequest
}

func newFakeNarratorContextSource(eventCount int) *fakeNarratorContextSource {
	conversationID := "conversation-context"
	turnID := "turn-current"
	events := make([]conversation.TrajectoryEvent, 0, eventCount)
	for sequence := 1; sequence <= eventCount; sequence++ {
		events = append(events, fakeTrajectoryEvent(conversationID, turnID, sequence))
	}
	return &fakeNarratorContextSource{
		conversation: conversation.TopicConversation{
			ID:                     conversationID,
			WorkspaceID:            "workspace-context",
			Title:                  "Narrator context",
			TopicDescriptor:        "Durable narrator materialization",
			Status:                 conversation.ConversationStatusWorking,
			CreatedAt:              narratorContextTestTime,
			UpdatedAt:              narratorContextTestTime,
			LastTrajectorySequence: eventCount,
		},
		state: conversation.NarratorState{
			ConversationID:  conversationID,
			TopicDescriptor: "Durable narrator materialization",
			Status:          conversation.NarratorStatusReady,
			UpdatedAt:       narratorContextTestTime,
		},
		turn: conversation.ConversationTurn{
			ID:             turnID,
			ConversationID: conversationID,
			AuthoredInput:  conversation.AuthoredInput{Text: "Materialize the next narrator window."},
			Status:         conversation.TurnStatusRunning,
		},
		events:         events,
		steering:       []conversation.NarratorAcceptedSteering{},
		milestones:     []conversation.NarrationEvent{},
		finalSummaries: []conversation.NarrationEvent{},
	}
}

func (source *fakeNarratorContextSource) ReadNarratorContextSource(
	_ context.Context,
	request conversation.NarratorContextReadRequest,
) (conversation.NarratorContextSource, error) {
	source.requests = append(source.requests, request)
	start := source.state.CheckpointThroughSequence + 1
	end := source.conversation.LastTrajectorySequence
	switch request.Kind {
	case conversation.NarratorContextReadProjection:
		end = request.ProjectionThroughSequence
	case conversation.NarratorContextReadCheckpoint:
		end = source.state.ObservedThroughSequence
	}
	window := conversation.NarratorTrajectoryWindow{Events: []conversation.TrajectoryEvent{}}
	if start <= end {
		window.AvailableRange = &conversation.TrajectorySequenceRange{Start: start, End: end}
		available := append([]conversation.TrajectoryEvent{}, source.events[start-1:end]...)
		if request.Kind == conversation.NarratorContextReadStatus {
			if len(available) > request.MaxTrajectoryEvents {
				window.HasEarlier = true
				available = available[len(available)-request.MaxTrajectoryEvents:]
			}
		} else if len(available) > request.MaxTrajectoryEvents {
			window.HasLater = true
			available = available[:request.MaxTrajectoryEvents]
		}
		window.Events = append([]conversation.TrajectoryEvent{}, available...)
		if len(available) > 0 {
			window.IncludedRange = &conversation.TrajectorySequenceRange{
				Start: available[0].Sequence,
				End:   available[len(available)-1].Sequence,
			}
		}
	}
	finalSummaries := source.finalSummaries
	if len(finalSummaries) > request.MaxFinalSummaries {
		finalSummaries = finalSummaries[len(finalSummaries)-request.MaxFinalSummaries:]
	}
	return conversation.NarratorContextSource{
		Conversation:  source.conversation,
		NarratorState: source.state,
		CurrentTurn: conversation.NarratorCurrentTurnProjection{
			Turn:             &source.turn,
			AcceptedSteering: append([]conversation.NarratorAcceptedSteering{}, source.steering...),
			ActiveActivities: []conversation.NarratorActiveActivity{},
			PendingApprovals: []conversation.NarratorPendingApproval{},
			ActiveSubagents:  []conversation.NarratorActiveSubagent{},
			Artifacts:        []conversation.Artifact{},
		},
		Trajectory:              window,
		PriorMilestones:         append([]conversation.NarrationEvent{}, source.milestones...),
		CurrentTurnFinalSummary: cloneNarrationEventPointer(source.currentTurnFinalSummary),
		RecentFinalSummaries:    append([]conversation.NarrationEvent{}, finalSummaries...),
	}, nil
}

func newFakeContextMaterializer(t *testing.T, source ContextSource) *ContextMaterializer {
	t.Helper()
	materializer, err := NewContextMaterializer(source)
	if err != nil {
		t.Fatalf("new context materializer: %v", err)
	}
	return materializer
}

func fakeFinalSummaryEvent(conversationID string, turnID string, sequence int) *conversation.NarrationEvent {
	return &conversation.NarrationEvent{
		ID:                  "final-summary-existing",
		ConversationID:      conversationID,
		TurnID:              &turnID,
		StreamSequence:      1,
		Kind:                conversation.NarrationEventKindFinalSummary,
		SourceSequenceStart: sequence,
		SourceSequenceEnd:   sequence,
		Trigger:             conversation.NarrationTriggerTurnTerminal,
		ResolvedInvocation: conversation.ResolvedInvocation{
			ID:        "final-summary-invocation",
			Role:      conversation.RoleNarrator,
			StartedAt: narratorContextTestTime,
			EndedAt:   stringPointerForContextTest(narratorContextTestTime),
			Outcome:   conversation.InvocationOutcomeSucceeded,
		},
		CreatedAt:    narratorContextTestTime,
		FinalSummary: &conversation.NarrationFinalSummary{Text: "The turn already has a final summary."},
	}
}

func cloneNarrationEventPointer(event *conversation.NarrationEvent) *conversation.NarrationEvent {
	if event == nil {
		return nil
	}
	clone := *event
	return &clone
}

func stringPointerForContextTest(value string) *string {
	return &value
}

func fakeTrajectoryEvent(conversationID string, turnID string, sequence int) conversation.TrajectoryEvent {
	return conversation.TrajectoryEvent{
		ID:             "trajectory-" + string(rune('a'+sequence-1)),
		ConversationID: conversationID,
		TurnID:         &turnID,
		Sequence:       sequence,
		EmittedAt:      narratorContextTestTime,
		Kind:           conversation.TrajectoryEventAgentPublicTextDelta,
		Actor:          conversation.TrajectoryActorAgent,
		AgentPublicTextDelta: &conversation.TrajectoryAgentPublicTextDelta{
			ProviderItemID: "provider-item",
			Delta:          "complete deterministic event payload",
		},
	}
}

func storeContextEvent(
	conversationID string,
	turnID string,
	sequence int,
	kind conversation.TrajectoryEventKind,
) conversation.TrajectoryEvent {
	return conversation.TrajectoryEvent{
		ID:             "store-context-trajectory-" + string(rune('a'+sequence-1)),
		ConversationID: conversationID,
		TurnID:         &turnID,
		Sequence:       sequence,
		EmittedAt:      narratorContextTestTime,
		Kind:           kind,
		Actor:          conversation.TrajectoryActorAgent,
	}
}

func fakeMilestone(id string, sequence int, text string) conversation.NarrationEvent {
	turnID := "turn-current"
	return conversation.NarrationEvent{
		ID:                  id,
		ConversationID:      "conversation-context",
		TurnID:              &turnID,
		SourceSequenceStart: sequence,
		SourceSequenceEnd:   sequence,
		Milestone:           &conversation.NarrationMilestone{Text: text},
		CreatedAt:           narratorContextTestTime,
	}
}

func fakeFinalSummary(id string, turnID string, sequence int, text string) conversation.NarrationEvent {
	return conversation.NarrationEvent{
		ID:                  id,
		ConversationID:      "conversation-context",
		TurnID:              &turnID,
		SourceSequenceStart: sequence,
		SourceSequenceEnd:   sequence,
		FinalSummary:        &conversation.NarrationFinalSummary{Text: text},
		CreatedAt:           narratorContextTestTime,
	}
}

func fakeSemanticProgress(
	source *fakeNarratorContextSource,
	sequence int,
) conversation.NarratorSemanticEvent {
	return fakeSemanticProgressForIDs(source.conversation.ID, source.turn.ID, sequence)
}

func fakeSemanticProgressForIDs(
	conversationID string,
	turnID string,
	sequence int,
) conversation.NarratorSemanticEvent {
	return conversation.NarratorSemanticEvent{
		ConversationID:   conversationID,
		TurnID:           turnID,
		SemanticSequence: sequence,
		Kind:             conversation.NarratorSemanticEventMeaningfulProgress,
		SourceTrajectoryRange: conversation.TrajectorySequenceRange{
			Start: sequence,
			End:   sequence,
		},
		CreatedAt: narratorContextTestTime,
		MeaningfulProgress: &conversation.NarratorSemanticProgress{
			AssistantMessage: &conversation.NarratorSemanticAssistantMessage{
				ProviderItemID: fmt.Sprintf("semantic-provider-message-%d", sequence),
				Text:           fmt.Sprintf("Semantic progress %d completed.", sequence),
			},
		},
	}
}

func fakeSemanticPlan(
	source *fakeNarratorContextSource,
	sequence int,
) conversation.NarratorSemanticEvent {
	event := fakeSemanticProgress(source, sequence)
	event.MeaningfulProgress = &conversation.NarratorSemanticProgress{
		Plan: &conversation.TrajectoryPlanChanged{
			Steps: []conversation.PlanStep{{
				Text:   fmt.Sprintf("Plan step %d is underway.", sequence),
				Status: conversation.PlanStepStatusInProgress,
			}},
		},
	}
	return event
}

func fakeTerminalSemantic(
	source *fakeNarratorContextSource,
	sequence int,
	kind conversation.NarratorSemanticEventKind,
) conversation.NarratorSemanticEvent {
	event := conversation.NarratorSemanticEvent{
		ConversationID:   source.conversation.ID,
		TurnID:           source.turn.ID,
		SemanticSequence: sequence,
		Kind:             kind,
		SourceTrajectoryRange: conversation.TrajectorySequenceRange{
			Start: sequence,
			End:   sequence,
		},
		CreatedAt: narratorContextTestTime,
	}
	switch kind {
	case conversation.NarratorSemanticEventTaskCompleted:
		event.TaskCompleted = &conversation.NarratorSemanticTaskCompleted{
			Objective: source.turn.AuthoredInput,
			Status:    conversation.TurnStatusCompleted,
			Artifacts: []conversation.ArtifactMetadata{},
		}
	case conversation.NarratorSemanticEventTaskFailed:
		event.TaskFailed = &conversation.NarratorSemanticTaskFailed{
			Objective: source.turn.AuthoredInput,
			Status:    conversation.TurnStatusFailed,
			Failure: conversation.Failure{
				Code:    "semantic_terminal_failed",
				Message: "Semantic terminal failure.",
			},
			Artifacts: []conversation.ArtifactMetadata{},
		}
	case conversation.NarratorSemanticEventTaskCanceled:
		event.TaskCanceled = &conversation.NarratorSemanticTaskCanceled{
			Objective: source.turn.AuthoredInput,
			Status:    conversation.TurnStatusCancelled,
			Reason:    conversation.TurnInterruptionUserRequested,
			Artifacts: []conversation.ArtifactMetadata{},
		}
	}
	return event
}

func testContextLimits(maxEvents int) ContextLimits {
	return ContextLimits{
		MaxInputBytes:             1 << 20,
		MaxTrajectoryEvents:       maxEvents,
		RecentFinalSummaries:      4,
		MaxCheckpointSummaryBytes: 256,
	}
}

func semanticSequences(events []conversation.NarratorSemanticEvent) []int {
	result := make([]int, len(events))
	for index, event := range events {
		result[index] = event.SemanticSequence
	}
	return result
}

func trajectorySequences(events []conversation.TrajectoryEvent) []int {
	result := make([]int, len(events))
	for index, event := range events {
		result[index] = event.Sequence
	}
	return result
}

func assertSequenceRange(
	t *testing.T,
	sequenceRange conversation.TrajectorySequenceRange,
	wantStart int,
	wantEnd int,
) {
	t.Helper()
	if sequenceRange.Start != wantStart || sequenceRange.End != wantEnd {
		t.Fatalf("sequence range = %d..%d, want %d..%d", sequenceRange.Start, sequenceRange.End, wantStart, wantEnd)
	}
}

func assertOptionalSequenceRange(
	t *testing.T,
	sequenceRange *conversation.TrajectorySequenceRange,
	wantStart int,
	wantEnd int,
) {
	t.Helper()
	if sequenceRange == nil {
		t.Fatalf("sequence range = nil, want %d..%d", wantStart, wantEnd)
	}
	assertSequenceRange(t, *sequenceRange, wantStart, wantEnd)
}

func assertEncodedContextBytes(t *testing.T, want int, value any) {
	t.Helper()
	encoded, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("encode context: %v", err)
	}
	if len(encoded) != want {
		t.Fatalf("encoded context bytes = %d, want recorded %d", len(encoded), want)
	}
}
