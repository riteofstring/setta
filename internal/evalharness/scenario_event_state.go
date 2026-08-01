package evalharness

import (
	"context"
	"errors"
	"fmt"

	"setta/internal/conversation"
)

type evaluationConversationState struct {
	snapshot conversation.ConversationSnapshot
	reader   eventStreamReader[conversation.ConversationEvent]
}

func newEvaluationConversationState(
	snapshot conversation.ConversationSnapshot,
	stream *EventStream[conversation.ConversationEvent],
) *evaluationConversationState {
	snapshot.Turns = conversation.ConversationTurnWindow{
		Turns: []conversation.ConversationTurn{},
	}
	snapshot.Queue = []conversation.QueuedConversationTurn{}
	snapshot.Trajectory = conversation.ConversationTrajectoryWindow{
		Events: []conversation.TrajectoryEvent{},
	}
	snapshot.NarratorState = conversation.NarratorState{}
	snapshot.Narration = conversation.ConversationNarrationWindow{
		Events: []conversation.NarrationEvent{},
	}
	snapshot.SideEvents = conversation.ConversationSideEventWindow{
		Events: []conversation.SideConversationEvent{},
		Limit:  conversation.MaxSnapshotSideEvents,
	}
	snapshot.EventCursor.Sequence = 0
	return &evaluationConversationState{
		snapshot: snapshot,
		reader:   newEventStreamReader("conversation", stream),
	}
}

func (state *evaluationConversationState) replayThrough(
	ctx context.Context,
	target conversation.ConversationEventCursor,
) error {
	if target.StreamID != state.snapshot.EventCursor.StreamID ||
		target.Sequence < state.snapshot.EventCursor.Sequence {
		return fmt.Errorf(
			"conversation replay target %s:%d does not follow %s:%d",
			target.StreamID,
			target.Sequence,
			state.snapshot.EventCursor.StreamID,
			state.snapshot.EventCursor.Sequence,
		)
	}
	for state.snapshot.EventCursor.Sequence < target.Sequence {
		if err := state.next(ctx); err != nil {
			return err
		}
	}
	return nil
}

func (state *evaluationConversationState) next(ctx context.Context) error {
	event, err := state.reader.Next(ctx)
	if err != nil {
		return err
	}
	if event.Type() == conversation.ConversationEventTypeResyncRequired {
		return errors.New("conversation event stream required a snapshot resync")
	}
	wantSequence := state.snapshot.EventCursor.Sequence + 1
	if event.StreamID != state.snapshot.EventCursor.StreamID || event.Sequence != wantSequence {
		return fmt.Errorf(
			"conversation event cursor changed from %s:%d to %s:%d",
			state.snapshot.EventCursor.StreamID,
			state.snapshot.EventCursor.Sequence,
			event.StreamID,
			event.Sequence,
		)
	}
	if err := state.apply(event.Payload); err != nil {
		return err
	}
	state.snapshot.EventCursor.Sequence = event.Sequence
	return nil
}

func (state *evaluationConversationState) apply(
	payload conversation.ConversationEventPayload,
) error {
	switch value := payload.(type) {
	case *conversation.ConversationUpdatedEventPayload:
		state.snapshot.Conversation = value.Conversation
	case *conversation.ConversationTurnUpdatedEventPayload:
		state.applyTurn(value.Turn)
	case *conversation.ConversationQueueUpdatedEventPayload:
		state.snapshot.Queue = append([]conversation.QueuedConversationTurn{}, value.Queue...)
	case *conversation.ConversationTrajectoryAppendedEventPayload:
		state.snapshot.Trajectory.Events = append(state.snapshot.Trajectory.Events, value.Event)
	case *conversation.ConversationNarratorStateUpdatedEventPayload:
		state.snapshot.NarratorState = value.State
	case *conversation.ConversationNarrationCreatedEventPayload:
		state.snapshot.Narration.Events = append(state.snapshot.Narration.Events, value.Event)
	case *conversation.ConversationSideEventAppendedEventPayload:
		state.snapshot.SideEvents.Events = append(state.snapshot.SideEvents.Events, value.Event)
	}
	return nil
}

func (state *evaluationConversationState) applyTurn(turn conversation.ConversationTurn) {
	for index := range state.snapshot.Turns.Turns {
		if state.snapshot.Turns.Turns[index].ID == turn.ID {
			state.snapshot.Turns.Turns[index] = turn
			return
		}
	}
	state.snapshot.Turns.Turns = append(state.snapshot.Turns.Turns, turn)
}

func (state *evaluationConversationState) turn(
	turnID string,
) (conversation.ConversationTurn, bool) {
	for _, turn := range state.snapshot.Turns.Turns {
		if turn.ID == turnID {
			return turn, true
		}
	}
	return conversation.ConversationTurn{}, false
}

func (state *evaluationConversationState) queueTurnIDs() []string {
	ids := make([]string, len(state.snapshot.Queue))
	for index, queued := range state.snapshot.Queue {
		ids[index] = queued.TurnID
	}
	return ids
}

func (state *evaluationConversationState) completedWorkspaceMutationCount(
	turnID string,
) int {
	count := 0
	for _, event := range state.snapshot.Trajectory.Events {
		if event.TurnID != nil && *event.TurnID == turnID &&
			event.Kind == conversation.TrajectoryEventFileChangeCompleted &&
			event.FileChangeCompleted != nil &&
			event.FileChangeCompleted.Outcome == conversation.FileChangeOutcomeCompleted &&
			len(event.FileChangeCompleted.Changes) > 0 {
			count++
		}
	}
	return count
}

func (state *evaluationConversationState) triggerObservation(
	stepIndex int,
	trigger ScenarioTrigger,
	workstreamID string,
	observedTurnID string,
) (EvaluationTriggerObservation, bool, error) {
	turn, found := state.turn(observedTurnID)
	if !found {
		return EvaluationTriggerObservation{}, false, fmt.Errorf(
			"observed Agent turn %s disappeared from the bounded conversation state",
			observedTurnID,
		)
	}
	queueIDs := state.queueTurnIDs()
	mutationCount := state.completedWorkspaceMutationCount(observedTurnID)
	ready := false
	switch trigger {
	case ScenarioTriggerAgentTurnRunning:
		ready = turn.Status == conversation.TurnStatusRunning
	case ScenarioTriggerFirstWorkspaceMutation:
		ready = turn.Status == conversation.TurnStatusRunning && mutationCount > 0
	case ScenarioTriggerQueueNonempty:
		ready = turn.Status == conversation.TurnStatusRunning && len(queueIDs) > 0
	default:
		return EvaluationTriggerObservation{}, false, fmt.Errorf(
			"conversation state cannot observe trigger %s",
			trigger,
		)
	}
	if !ready {
		return EvaluationTriggerObservation{}, false, nil
	}
	status := turn.Status
	observation := EvaluationTriggerObservation{
		StepIndex:              stepIndex,
		Trigger:                trigger,
		WorkstreamID:           evaluationStringPointer(workstreamID),
		ConversationID:         evaluationStringPointer(state.snapshot.Conversation.ID),
		ObservedTurnID:         evaluationStringPointer(observedTurnID),
		ObservedTurnStatus:     &status,
		QueueTurnIDs:           queueIDs,
		WorkspaceMutationCount: mutationCount,
	}
	if err := observation.Validate(); err != nil {
		return EvaluationTriggerObservation{}, false, err
	}
	return observation, true, nil
}

func evaluationStringPointer(value string) *string {
	result := value
	return &result
}
