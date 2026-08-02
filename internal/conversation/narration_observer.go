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
	Semantic       []NarratorSemanticEvent
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
	turn ConversationTurn,
	events []TrajectoryEvent,
	artifacts []ArtifactMetadata,
	terminal bool,
) {
	if service == nil || service.narration == nil || len(events) == 0 {
		return
	}
	cloned := make([]TrajectoryEvent, len(events))
	copy(cloned, events)
	semantic := narratorSemanticEventsForLiveCommit(
		conversation,
		turn,
		cloned,
		artifacts,
		terminal,
	)
	/*
	 * A folderless conversation is narrated like any other.
	 *
	 * It used to return here, which meant the one kind of work with no files to
	 * look at was also the one kind with no account of itself. The narrator
	 * already supports it end to end: an empty workspace resolves to
	 * `folderlessRuntimeRoot`, and the context materializer already yields an
	 * empty workspace for a conversation bound to no folder.
	 */
	service.narration.ObserveCommittedTrajectory(NarrationTrajectoryObservation{
		WorkspaceID:    optionalWorkspaceID(conversation.WorkspaceID),
		ConversationID: conversation.ID,
		TurnID:         turn.ID,
		Trajectory:     cloned,
		Semantic:       semantic,
		Terminal:       terminal,
	})
}

// optionalWorkspaceID is the empty string for a conversation with no folder,
// which is what the narrator's workspace resolution already treats as
// folderless.
func optionalWorkspaceID(workspaceID *string) string {
	if workspaceID == nil {
		return ""
	}
	return *workspaceID
}
