package evalharness

import (
	"context"
	"errors"
	"fmt"

	"setta/internal/conversation"
)

type evaluationConversationState struct {
	snapshot            conversation.ConversationSnapshot
	reader              eventStreamReader[conversation.ConversationEvent]
	workspaceObserver   *evaluationWorkspaceObserver
	workspace           EvaluationWorkspaceObservation
	trajectoryWorkspace map[string]EvaluationWorkspaceObservation
}

func newEvaluationConversationState(
	snapshot conversation.ConversationSnapshot,
	stream *EventStream[conversation.ConversationEvent],
	workspaceObserver *evaluationWorkspaceObserver,
) (*evaluationConversationState, error) {
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
	state := &evaluationConversationState{
		snapshot:            snapshot,
		reader:              newEventStreamReader("conversation", stream),
		workspaceObserver:   workspaceObserver,
		trajectoryWorkspace: map[string]EvaluationWorkspaceObservation{},
	}
	if workspaceObserver != nil {
		workspace, err := workspaceObserver.Current()
		if err != nil {
			return nil, err
		}
		state.workspace = workspace
	}
	return state, nil
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
	return state.accept(event)
}

func (state *evaluationConversationState) accept(event conversation.ConversationEvent) error {
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
	if err := state.observeWorkspace(); err != nil {
		return err
	}
	if payload, ok := event.Payload.(*conversation.ConversationTrajectoryAppendedEventPayload); ok {
		state.trajectoryWorkspace[payload.Event.ID] = state.workspace
	}
	return nil
}

func (state *evaluationConversationState) observeWorkspace() error {
	if state.workspaceObserver == nil {
		return nil
	}
	workspace, err := state.workspaceObserver.Observe()
	if err != nil {
		return err
	}
	state.workspace = workspace
	return nil
}

func (state *evaluationConversationState) workspaceByTrajectory() map[string]EvaluationWorkspaceObservation {
	result := make(map[string]EvaluationWorkspaceObservation, len(state.trajectoryWorkspace))
	for eventID, workspace := range state.trajectoryWorkspace {
		result[eventID] = workspace
	}
	return result
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

func (state *evaluationConversationState) pendingUserInputApprovals(
	turnID string,
) []conversation.TrajectoryApprovalRequest {
	pending := map[string]conversation.TrajectoryApprovalRequest{}
	order := make([]string, 0)
	for _, event := range state.snapshot.Trajectory.Events {
		if !trajectoryEventTargetsTurn(event, turnID) {
			continue
		}
		updatePendingUserInputApprovals(event, pending, &order)
	}
	result := make([]conversation.TrajectoryApprovalRequest, 0, len(pending))
	for _, approvalID := range order {
		if approval, exists := pending[approvalID]; exists {
			result = append(result, approval)
		}
	}
	return result
}

func trajectoryEventTargetsTurn(event conversation.TrajectoryEvent, turnID string) bool {
	return event.TurnID != nil && *event.TurnID == turnID
}

func updatePendingUserInputApprovals(
	event conversation.TrajectoryEvent,
	pending map[string]conversation.TrajectoryApprovalRequest,
	order *[]string,
) {
	if event.Kind == conversation.TrajectoryEventApprovalRequested &&
		event.ApprovalRequested != nil &&
		isUserInputApproval(event.ApprovalRequested.Approval.Kind) {
		approval := event.ApprovalRequested.Approval
		if _, exists := pending[approval.ID]; !exists {
			*order = append(*order, approval.ID)
		}
		pending[approval.ID] = approval
		return
	}
	if event.Kind == conversation.TrajectoryEventApprovalResolved && event.ApprovalResolved != nil {
		delete(pending, event.ApprovalResolved.Resolution.ApprovalID)
	}
}

func isUserInputApproval(kind conversation.TrajectoryApprovalKind) bool {
	return kind == conversation.TrajectoryApprovalKindStructuredInput ||
		kind == conversation.TrajectoryApprovalKindUserInput
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
	inputApprovals := state.pendingUserInputApprovals(observedTurnID)
	ready, err := evaluationTriggerReady(trigger, turn.Status, len(inputApprovals), len(queueIDs), state.workspace.Revision)
	if err != nil {
		return EvaluationTriggerObservation{}, false, err
	}
	if !ready {
		return EvaluationTriggerObservation{}, false, nil
	}
	status := turn.Status
	var approvalID *string
	if trigger == ScenarioTriggerAgentUserInputRequested {
		approvalID = evaluationStringPointer(inputApprovals[0].ID)
	}
	observation := EvaluationTriggerObservation{
		StepIndex:          stepIndex,
		Trigger:            trigger,
		WorkstreamID:       evaluationStringPointer(workstreamID),
		ConversationID:     evaluationStringPointer(state.snapshot.Conversation.ID),
		ObservedTurnID:     evaluationStringPointer(observedTurnID),
		ObservedTurnStatus: &status,
		ObservedApprovalID: approvalID,
		QueueTurnIDs:       queueIDs,
		Workspace:          state.workspace,
	}
	if err := observation.Validate(); err != nil {
		return EvaluationTriggerObservation{}, false, err
	}
	return observation, true, nil
}

func evaluationTriggerReady(
	trigger ScenarioTrigger,
	turnStatus conversation.TurnStatus,
	inputApprovalCount int,
	queueCount int,
	workspaceRevision int,
) (bool, error) {
	switch trigger {
	case ScenarioTriggerAgentUserInputRequested:
		return turnStatus == conversation.TurnStatusRunning && inputApprovalCount > 0, nil
	case ScenarioTriggerAgentTurnRunning:
		return turnStatus == conversation.TurnStatusRunning, nil
	case ScenarioTriggerFirstWorkspaceMutation:
		return turnStatus == conversation.TurnStatusRunning && workspaceRevision > 0, nil
	case ScenarioTriggerQueueNonempty:
		return turnStatus == conversation.TurnStatusRunning && queueCount > 0, nil
	default:
		return false, fmt.Errorf("conversation state cannot observe trigger %s", trigger)
	}
}

func evaluationStringPointer(value string) *string {
	result := value
	return &result
}
