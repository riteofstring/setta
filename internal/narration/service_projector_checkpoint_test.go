package narration

import (
	"context"
	"testing"

	"setta/internal/conversation"
)

func TestServiceContinuesProjectionBeforeCheckpointMaintenance(t *testing.T) {
	store := newProjectorTestStore(t)
	conversationID := "conversation-projection-before-checkpoint"
	seedStatusServiceConversation(t, store, conversationID)
	turnID := "primary-agent-turn"
	plan := appendProjectorPlanTrajectory(t, store, conversationID, turnID)
	markNarratorObservedThrough(t, store, conversationID, plan.Sequence-1)
	provider := &projectorTestAgentRuntime{emitProjectionMilestones: true}
	service := newProjectorTestService(t, store, provider)
	service.checkpointWindowEvents = 1
	operation := ProjectionOperation{
		WorkspaceID:     "workspace-status-service",
		TurnID:          turnID,
		ThroughSequence: plan.Sequence,
		SemanticEvents: []conversation.NarratorSemanticEvent{
			projectorPlanSemantic(conversationID, turnID, plan),
		},
	}

	service.handleCompletion(Completion{Request: Request{
		ID:             "projection-continuation",
		ConversationID: conversationID,
		Kind:           RequestKindProjection,
		Trigger:        conversation.NarrationTriggerPlanChanged,
		Projection:     &operation,
	}})

	snapshot := waitForProjectorSnapshot(t, store, conversationID, func(current conversation.ConversationSnapshot) bool {
		return current.NarratorState.ObservedThroughSequence == plan.Sequence &&
			current.NarratorState.CheckpointThroughSequence == plan.Sequence
	})
	if milestone := latestNarrationOfKind(snapshot, conversation.NarrationEventKindMilestone); milestone == nil ||
		milestone.SourceSequenceEnd != plan.Sequence {
		t.Fatalf("working projection milestone = %+v", milestone)
	}
	calls := provider.snapshotCalls()
	if len(calls) < 2 {
		t.Fatalf("projector calls = %+v, want working projection then checkpoint", calls)
	}
	if calls[0].kind != ContextKindProjection ||
		calls[0].requestedChannel != ProjectionChannelWorking ||
		calls[0].evaluationStart != plan.Sequence ||
		calls[0].evaluationEnd != plan.Sequence ||
		calls[0].preCallObserved != plan.Sequence-1 {
		t.Fatalf("first projector call = %+v, want working projection through %d", calls[0], plan.Sequence)
	}
	if calls[1].kind != ContextKindCheckpoint ||
		calls[1].checkpointRangeStart != 1 ||
		calls[1].checkpointRangeEnd != plan.Sequence {
		t.Fatalf("second projector call = %+v, want checkpoint maintenance through %d", calls[1], plan.Sequence)
	}
}

func appendProjectorPlanTrajectory(
	t *testing.T,
	store *conversation.Store,
	conversationID string,
	turnID string,
) conversation.TrajectoryEvent {
	t.Helper()
	return appendProjectorPlanTrajectoryAt(
		t,
		store,
		conversationID,
		turnID,
		"projector-plan-before-checkpoint",
		"Keep projection ahead of checkpoint maintenance.",
		"2026-07-12T12:00:20Z",
	)
}

func appendProjectorPlanTrajectoryAt(
	t *testing.T,
	store *conversation.Store,
	conversationID string,
	turnID string,
	id string,
	text string,
	emittedAt string,
) conversation.TrajectoryEvent {
	t.Helper()
	snapshot, err := store.ReadSnapshot(context.Background(), "workspace-status-service", conversationID)
	if err != nil {
		t.Fatalf("read projector plan seed snapshot: %v", err)
	}
	plan := conversation.TrajectoryEvent{
		ID:             id,
		ConversationID: conversationID,
		TurnID:         &turnID,
		Sequence:       snapshot.Conversation.LastTrajectorySequence + 1,
		EmittedAt:      emittedAt,
		Kind:           conversation.TrajectoryEventPlanChanged,
		Actor:          conversation.TrajectoryActorAgent,
		PlanChanged: &conversation.TrajectoryPlanChanged{Steps: []conversation.PlanStep{{
			Text:   text,
			Status: conversation.PlanStepStatusCompleted,
		}}},
	}
	_, err = store.Transact(context.Background(), "append projector plan trajectory", func(tx *conversation.WriteTransaction) error {
		if err := tx.AppendTrajectoryEvent(plan); err != nil {
			return err
		}
		_, err := tx.AppendCommittedEvent(conversation.CommittedEventDraft{
			ID:          id + "-publication",
			StreamID:    "conversation:" + conversationID,
			Kind:        string(conversation.ConversationEventTypeConversationUpdated),
			Payload:     map[string]string{"conversationId": conversationID},
			CommittedAt: emittedAt,
		})
		return err
	})
	if err != nil {
		t.Fatalf("append projector plan before checkpoint: %v", err)
	}
	return plan
}

func markNarratorObservedThrough(
	t *testing.T,
	store *conversation.Store,
	conversationID string,
	observedThrough int,
) {
	t.Helper()
	state, err := store.ReadNarratorState(context.Background(), conversationID)
	if err != nil {
		t.Fatalf("read narrator state before observed marker: %v", err)
	}
	updated := state
	updated.ObservedThroughSequence = observedThrough
	updated.UpdatedAt = "2026-07-12T12:00:15Z"
	_, err = store.Transact(context.Background(), "mark narrator observed before checkpoint", func(tx *conversation.WriteTransaction) error {
		if err := tx.UpdateNarratorState(projectorNarratorExpectation(state), updated); err != nil {
			return err
		}
		_, err := tx.AppendCommittedEvent(conversation.CommittedEventDraft{
			ID:          "projector-observed-before-checkpoint-publication",
			StreamID:    "conversation:" + conversationID,
			Kind:        string(conversation.ConversationEventTypeConversationUpdated),
			Payload:     map[string]string{"conversationId": conversationID},
			CommittedAt: updated.UpdatedAt,
		})
		return err
	})
	if err != nil {
		t.Fatalf("mark narrator observed before checkpoint: %v", err)
	}
}
