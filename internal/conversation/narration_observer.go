package conversation

// NarrationTrajectoryObservation is emitted only after its trajectory batch
// and aggregate changes commit. Terminal identifies the authoritative
// provider/system terminal transition; a user interruption request may use the
// same trajectory kind while the turn is still running and is not terminal.
type NarrationTrajectoryObservation struct {
	WorkspaceID    string
	ConversationID string
	TurnID         string
	Trajectory     []TrajectoryEvent
	Terminal       bool
}

// NarrationTrajectoryObserver admits committed lifecycle facts to an
// independent projector. It must return promptly and must never make narrator
// availability part of primary-agent transaction success.
type NarrationTrajectoryObserver interface {
	ObserveCommittedTrajectory(NarrationTrajectoryObservation)
}

func (service *Service) observeCommittedTrajectory(
	conversation TopicConversation,
	turnID string,
	events []TrajectoryEvent,
	terminal bool,
) {
	if service == nil || service.narration == nil || len(events) == 0 {
		return
	}
	cloned := make([]TrajectoryEvent, len(events))
	copy(cloned, events)
	service.narration.ObserveCommittedTrajectory(NarrationTrajectoryObservation{
		WorkspaceID:    conversation.WorkspaceID,
		ConversationID: conversation.ID,
		TurnID:         turnID,
		Trajectory:     cloned,
		Terminal:       terminal,
	})
}
