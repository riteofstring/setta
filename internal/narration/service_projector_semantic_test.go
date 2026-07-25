package narration

import (
	"context"
	"reflect"
	"testing"
	"time"

	"setta/internal/conversation"
)

func TestServiceMergesDeferredProjectionSemanticEvents(t *testing.T) {
	store := newProjectorTestStore(t)
	conversationID, _, firstTerminal := seedTerminalProjectorConversation(t, store)
	secondTurnID, firstPlan, secondPlan := appendRunningProjectorTurnWithPlans(t, store, conversationID)
	firstCallStarted := make(chan struct{})
	releaseFirstCall := make(chan struct{})
	provider := &projectorTestAgentRuntime{
		blockFirstProjection: true,
		firstCallStarted:     firstCallStarted,
		releaseFirstCall:     releaseFirstCall,
	}
	service := newProjectorTestService(t, store, provider)

	service.ObserveCommittedTrajectory(projectorTerminalObservation(conversationID, "primary-agent-turn", firstTerminal))
	select {
	case <-firstCallStarted:
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for blocked terminal projection")
	}
	service.ObserveCommittedTrajectory(projectorPlanObservation(conversationID, secondTurnID, firstPlan))
	service.ObserveCommittedTrajectory(projectorPlanObservation(conversationID, secondTurnID, secondPlan))
	close(releaseFirstCall)

	waitForProjectorSnapshot(t, store, conversationID, func(current conversation.ConversationSnapshot) bool {
		return current.NarratorState.ObservedThroughSequence == secondPlan.Sequence
	})
	for _, call := range provider.snapshotCalls() {
		if call.requestedChannel != ProjectionChannelWorking || call.turnID != secondTurnID {
			continue
		}
		want := []int{firstPlan.Sequence, secondPlan.Sequence}
		if !reflect.DeepEqual(call.semanticSequences, want) {
			t.Fatalf("deferred working semantic events = %v, want %v; call=%+v", call.semanticSequences, want, call)
		}
		return
	}
	t.Fatalf("deferred working projection for %s was not called: %+v", secondTurnID, provider.snapshotCalls())
}

func projectorSemanticSequences(events []conversation.NarratorSemanticEvent) []int {
	result := make([]int, 0, len(events))
	for _, event := range events {
		result = append(result, event.SemanticSequence)
	}
	return result
}

func appendRunningProjectorTurnWithPlans(
	t *testing.T,
	store *conversation.Store,
	conversationID string,
) (string, conversation.TrajectoryEvent, conversation.TrajectoryEvent) {
	t.Helper()
	snapshot, err := store.ReadSnapshot(context.Background(), "workspace-status-service", conversationID)
	if err != nil {
		t.Fatalf("read running projector turn seed: %v", err)
	}
	turn, binding, events := statusServiceActiveTurn(conversationID)
	turn.ID = "primary-agent-turn-two"
	turn.AuthoredInput = conversation.AuthoredInput{Text: "Continue the deferred second turn."}
	turn.AcceptedAt = "2026-07-12T12:02:00Z"
	startedAt := "2026-07-12T12:02:01Z"
	turn.StartedAt = &startedAt
	providerTurnID := "provider-primary-turn-two"
	turn.ProviderTurnID = &providerTurnID
	invocation := *turn.ResolvedInvocation
	invocation.ID = "primary-agent-invocation-two"
	invocation.StartedAt = startedAt
	invocation.ProviderReferences.TurnID = &providerTurnID
	turn.ResolvedInvocation = &invocation
	binding.LastTurnID = &turn.ID
	turnID := turn.ID
	accepted := events[0]
	accepted.ID = "second-deferred-user-input"
	accepted.TurnID = &turnID
	accepted.Sequence = snapshot.Conversation.LastTrajectorySequence + 1
	accepted.EmittedAt = turn.AcceptedAt
	accepted.UserInputAccepted.Input = turn.AuthoredInput
	started := events[1]
	started.ID = "second-deferred-turn-started"
	started.TurnID = &turnID
	started.Sequence = accepted.Sequence + 1
	started.EmittedAt = startedAt
	started.ProviderTurnID = &providerTurnID
	startedInvocation := invocation
	started.TurnStarted.Invocation = startedInvocation
	firstPlan := conversation.TrajectoryEvent{
		ID:             "second-deferred-plan-one",
		ConversationID: conversationID,
		TurnID:         &turnID,
		Sequence:       started.Sequence + 1,
		EmittedAt:      startedAt,
		Kind:           conversation.TrajectoryEventPlanChanged,
		Actor:          conversation.TrajectoryActorAgent,
		PlanChanged: &conversation.TrajectoryPlanChanged{Steps: []conversation.PlanStep{{
			Text:   "Queue the first deferred progress update",
			Status: conversation.PlanStepStatusCompleted,
		}}},
	}
	secondPlan := conversation.TrajectoryEvent{
		ID:             "second-deferred-plan-two",
		ConversationID: conversationID,
		TurnID:         &turnID,
		Sequence:       firstPlan.Sequence + 1,
		EmittedAt:      startedAt,
		Kind:           conversation.TrajectoryEventPlanChanged,
		Actor:          conversation.TrajectoryActorAgent,
		PlanChanged: &conversation.TrajectoryPlanChanged{Steps: []conversation.PlanStep{{
			Text:   "Queue the second deferred progress update",
			Status: conversation.PlanStepStatusCompleted,
		}}},
	}
	updated := snapshot.Conversation
	updated.Status = conversation.ConversationStatusWorking
	updated.UpdatedAt = startedAt
	_, err = store.Transact(context.Background(), "append running projector turn with plans", func(tx *conversation.WriteTransaction) error {
		if err := tx.UpdateConversation(conversation.ConversationExpectation{
			UpdatedAt:              snapshot.Conversation.UpdatedAt,
			LastTrajectorySequence: snapshot.Conversation.LastTrajectorySequence,
		}, updated); err != nil {
			return err
		}
		if err := tx.InsertTurn(turn); err != nil {
			return err
		}
		if err := tx.UpsertAgentThreadBinding(binding); err != nil {
			return err
		}
		for _, event := range []conversation.TrajectoryEvent{accepted, started, firstPlan, secondPlan} {
			if err := tx.AppendTrajectoryEvent(event); err != nil {
				return err
			}
		}
		_, err := tx.AppendCommittedEvent(conversation.CommittedEventDraft{
			ID:          "running-projector-turn-plans-event",
			StreamID:    "conversation:" + conversationID,
			Kind:        string(conversation.ConversationEventTypeConversationUpdated),
			Payload:     map[string]string{"conversationId": conversationID},
			CommittedAt: startedAt,
		})
		return err
	})
	if err != nil {
		t.Fatalf("append running projector turn with plans: %v", err)
	}
	return turnID, firstPlan, secondPlan
}
