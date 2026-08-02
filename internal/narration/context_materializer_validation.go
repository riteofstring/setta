package narration

import (
	"fmt"

	"setta/internal/conversation"
)

func validateMaterializationSource(
	source conversation.NarratorContextSource,
	conversationID string,
	turnID *string,
	kind conversation.NarratorContextReadKind,
	projectionThroughSequence int,
	maxTrajectoryEvents int,
) error {
	if err := validateMaterializationIdentity(source, conversationID, projectionThroughSequence); err != nil {
		return err
	}
	if err := validateMaterializationTurn(source, turnID); err != nil {
		return err
	}
	if err := validateMaterializationTrajectory(
		source,
		conversationID,
		kind,
		projectionThroughSequence,
		maxTrajectoryEvents,
	); err != nil {
		return err
	}
	return validateMaterializationNarration(source)
}

func validateMaterializationIdentity(
	source conversation.NarratorContextSource,
	conversationID string,
	projectionThroughSequence int,
) error {
	if err := source.Conversation.Validate(); err != nil {
		return fmt.Errorf("narrator context conversation: %w", err)
	}
	if err := source.NarratorState.Validate(); err != nil {
		return fmt.Errorf("narrator context state: %w", err)
	}
	if source.Conversation.ID != conversationID || source.NarratorState.ConversationID != conversationID {
		return fmt.Errorf("narrator context source does not belong to conversation %s", conversationID)
	}
	if source.NarratorState.ObservedThroughSequence > source.Conversation.LastTrajectorySequence {
		return fmt.Errorf("narrator observed cursor exceeds latest trajectory")
	}
	if projectionThroughSequence > source.Conversation.LastTrajectorySequence {
		return fmt.Errorf(
			"narrator projection through sequence %d exceeds latest trajectory %d",
			projectionThroughSequence,
			source.Conversation.LastTrajectorySequence,
		)
	}
	return nil
}

func validateMaterializationTurn(source conversation.NarratorContextSource, turnID *string) error {
	if turnID != nil {
		if source.CurrentTurn.Turn == nil || source.CurrentTurn.Turn.ID != *turnID {
			return fmt.Errorf("narrator context source does not contain target turn %s", *turnID)
		}
	}
	current := source.CurrentTurn
	if current.AcceptedSteering == nil || current.ActiveActivities == nil || current.PendingApprovals == nil ||
		current.ActiveSubagents == nil || current.Artifacts == nil {
		return fmt.Errorf("narrator authoritative current-state collections must not be nil")
	}
	if current.LatestAssistantMessage != nil {
		if err := current.LatestAssistantMessage.Validate(); err != nil {
			return fmt.Errorf("narrator latest assistant message: %w", err)
		}
	}
	return nil
}

func validateMaterializationTrajectory(
	source conversation.NarratorContextSource,
	conversationID string,
	kind conversation.NarratorContextReadKind,
	projectionThroughSequence int,
	maxTrajectoryEvents int,
) error {
	if source.Trajectory.Events == nil {
		return fmt.Errorf("narrator context source collections must not be nil")
	}
	if len(source.Trajectory.Events) > maxTrajectoryEvents {
		return fmt.Errorf("narrator context source exceeds its requested trajectory limit")
	}
	if err := validateMaterializationWindowCoverage(source, kind, projectionThroughSequence); err != nil {
		return err
	}
	previous := 0
	for _, event := range source.Trajectory.Events {
		if err := event.Validate(); err != nil {
			return fmt.Errorf("narrator context trajectory: %w", err)
		}
		if event.ConversationID != conversationID || (previous != 0 && event.Sequence != previous+1) {
			return fmt.Errorf("narrator context trajectory is not a contiguous conversation range")
		}
		previous = event.Sequence
	}
	return nil
}

func validateMaterializationWindowCoverage(
	source conversation.NarratorContextSource,
	kind conversation.NarratorContextReadKind,
	projectionThroughSequence int,
) error {
	start := source.NarratorState.CheckpointThroughSequence + 1
	end := source.Conversation.LastTrajectorySequence
	switch kind {
	case conversation.NarratorContextReadProjection:
		end = projectionThroughSequence
	case conversation.NarratorContextReadCheckpoint:
		end = source.NarratorState.ObservedThroughSequence
	}
	window := source.Trajectory
	if start > end {
		return validateEmptyMaterializationWindow(window)
	}
	return validateNonemptyMaterializationWindow(window, kind, start, end)
}

func validateEmptyMaterializationWindow(window conversation.NarratorTrajectoryWindow) error {
	if window.AvailableRange != nil || window.IncludedRange != nil || len(window.Events) != 0 ||
		window.HasEarlier || window.HasLater {
		return fmt.Errorf("empty narrator materialization range contains trajectory")
	}
	return nil
}

func validateNonemptyMaterializationWindow(
	window conversation.NarratorTrajectoryWindow,
	kind conversation.NarratorContextReadKind,
	start int,
	end int,
) error {
	wantAvailable := conversation.TrajectorySequenceRange{Start: start, End: end}
	if window.AvailableRange == nil || *window.AvailableRange != wantAvailable ||
		window.IncludedRange == nil || len(window.Events) == 0 {
		return fmt.Errorf("narrator materialization source range is incomplete")
	}
	return validateMaterializationWindowShape(window, kind, start, end)
}

func validateMaterializationWindowShape(
	window conversation.NarratorTrajectoryWindow,
	kind conversation.NarratorContextReadKind,
	start int,
	end int,
) error {
	included := conversation.TrajectorySequenceRange{
		Start: window.Events[0].Sequence,
		End:   window.Events[len(window.Events)-1].Sequence,
	}
	if *window.IncludedRange != included {
		return fmt.Errorf("narrator materialization included range does not match its events")
	}
	if kind == conversation.NarratorContextReadStatus {
		if window.HasLater || included.End != end || window.HasEarlier != (included.Start > start) {
			return fmt.Errorf("narrator status source is not the latest trajectory suffix")
		}
		return nil
	}
	if window.HasEarlier || included.Start != start || window.HasLater != (included.End < end) {
		return fmt.Errorf("narrator projection source is not the earliest trajectory prefix")
	}
	return nil
}

func validateMaterializationNarration(source conversation.NarratorContextSource) error {
	if source.PriorMilestones == nil || source.RecentFinalSummaries == nil {
		return fmt.Errorf("narrator prior-output collections must not be nil")
	}
	for _, event := range source.PriorMilestones {
		if event.Milestone == nil {
			return fmt.Errorf("narrator prior milestone %s has no milestone payload", event.ID)
		}
	}
	for _, event := range source.RecentFinalSummaries {
		if event.FinalSummary == nil || event.TurnID == nil {
			return fmt.Errorf("narrator prior final summary %s is incomplete", event.ID)
		}
	}
	return nil
}
