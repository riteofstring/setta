package conversation

import "fmt"

func (source NarratorContextSource) validate(request NarratorContextReadRequest) error {
	if err := source.Conversation.Validate(); err != nil {
		return err
	}
	if source.Conversation.ID != request.ConversationID {
		return fmt.Errorf("narrator context conversation is %s, want %s", source.Conversation.ID, request.ConversationID)
	}
	if err := source.NarratorState.Validate(); err != nil {
		return err
	}
	if source.NarratorState.ConversationID != request.ConversationID {
		return fmt.Errorf("narrator context state belongs to %s, want %s", source.NarratorState.ConversationID, request.ConversationID)
	}
	if source.NarratorState.ObservedThroughSequence > source.Conversation.LastTrajectorySequence {
		return fmt.Errorf("narrator observed cursor exceeds latest trajectory")
	}
	if request.Kind == NarratorContextReadProjection &&
		request.ProjectionThroughSequence > source.Conversation.LastTrajectorySequence {
		return fmt.Errorf(
			"narrator projection through sequence %d exceeds latest trajectory %d",
			request.ProjectionThroughSequence,
			source.Conversation.LastTrajectorySequence,
		)
	}
	if err := source.CurrentTurn.validate(request); err != nil {
		return err
	}
	if err := source.Trajectory.validate(source, request); err != nil {
		return err
	}
	if err := validateNarratorContextNarration(source, request); err != nil {
		return err
	}
	return nil
}

func (projection NarratorCurrentTurnProjection) validate(request NarratorContextReadRequest) error {
	if err := projection.validateCollections(); err != nil {
		return err
	}
	if projection.Turn == nil {
		if request.Kind == NarratorContextReadProjection || request.TurnID != nil {
			return fmt.Errorf("narrator context target turn is missing")
		}
		return nil
	}
	turn := *projection.Turn
	if err := turn.Validate(); err != nil {
		return err
	}
	if turn.ConversationID != request.ConversationID {
		return fmt.Errorf("narrator context turn %s belongs to %s", turn.ID, turn.ConversationID)
	}
	if request.TurnID != nil && turn.ID != *request.TurnID {
		return fmt.Errorf("narrator context turn is %s, want %s", turn.ID, *request.TurnID)
	}
	if err := projection.validateCurrentState(); err != nil {
		return err
	}
	return projection.validateArtifacts(request.ConversationID, turn.ID)
}

func (projection NarratorCurrentTurnProjection) validateCollections() error {
	if projection.AcceptedSteering == nil || projection.ActiveActivities == nil ||
		projection.PendingApprovals == nil || projection.ActiveSubagents == nil ||
		projection.Artifacts == nil {
		return fmt.Errorf("narrator current-turn collections must not be nil")
	}
	return nil
}

func (projection NarratorCurrentTurnProjection) validateArtifacts(conversationID string, turnID string) error {
	for _, artifact := range projection.Artifacts {
		if err := artifact.Validate(); err != nil {
			return err
		}
		if artifact.ConversationID != conversationID || artifact.TurnID == nil || *artifact.TurnID != turnID {
			return fmt.Errorf("narrator artifact %s does not belong to target turn %s", artifact.ID, turnID)
		}
	}
	return nil
}

func (projection NarratorCurrentTurnProjection) validateCurrentState() error {
	validators := []func() error{
		projection.validateSteering,
		projection.validatePlan,
		projection.validateActivities,
		projection.validateApprovals,
		projection.validateSubagents,
	}
	for _, validate := range validators {
		if err := validate(); err != nil {
			return err
		}
	}
	return nil
}

func (projection NarratorCurrentTurnProjection) validateSteering() error {
	previousSequence := 0
	for _, steering := range projection.AcceptedSteering {
		if steering.Sequence <= previousSequence {
			return fmt.Errorf("narrator steering inputs are not strictly ordered")
		}
		if err := steering.Input.Validate(); err != nil {
			return err
		}
		previousSequence = steering.Sequence
	}
	return nil
}

func (projection NarratorCurrentTurnProjection) validatePlan() error {
	if projection.Plan != nil {
		if projection.Plan.Sequence <= 0 {
			return fmt.Errorf("narrator current plan sequence must be positive")
		}
		if err := projection.Plan.Plan.Validate(); err != nil {
			return err
		}
	}
	return nil
}

func (projection NarratorCurrentTurnProjection) validateActivities() error {
	for _, active := range projection.ActiveActivities {
		if active.StartedAtSequence <= 0 || active.LastUpdatedAtSequence < active.StartedAtSequence {
			return fmt.Errorf("narrator active activity %s has invalid sequence coverage", active.Activity.ID)
		}
		if err := active.Activity.Validate(); err != nil {
			return err
		}
		if active.LatestOutput != nil {
			if err := active.LatestOutput.Validate(); err != nil {
				return err
			}
		}
	}
	return nil
}

func (projection NarratorCurrentTurnProjection) validateApprovals() error {
	for _, pending := range projection.PendingApprovals {
		if pending.RequestedAtSequence <= 0 {
			return fmt.Errorf("narrator pending approval %s has invalid sequence", pending.Approval.ID)
		}
		if err := pending.Approval.Validate(); err != nil {
			return err
		}
	}
	return nil
}

func (projection NarratorCurrentTurnProjection) validateSubagents() error {
	for _, active := range projection.ActiveSubagents {
		if active.StartedAtSequence <= 0 || active.LastUpdatedAtSequence < active.StartedAtSequence {
			return fmt.Errorf("narrator active subagent %s has invalid sequence coverage", active.Subagent.ID)
		}
		if err := active.Subagent.Validate(); err != nil {
			return err
		}
		if subagentStatusTerminal(active.Subagent.Status) {
			return fmt.Errorf("narrator active subagent %s has terminal status %s", active.Subagent.ID, active.Subagent.Status)
		}
	}
	return nil
}

func (window NarratorTrajectoryWindow) validate(
	source NarratorContextSource,
	request NarratorContextReadRequest,
) error {
	if window.Events == nil {
		return fmt.Errorf("narrator trajectory events must be an array")
	}
	wantStart, wantEnd := narratorTrajectoryBounds(source.Conversation, source.NarratorState, request)
	if wantStart > wantEnd {
		return window.validateEmpty()
	}
	if window.AvailableRange == nil || *window.AvailableRange != (TrajectorySequenceRange{Start: wantStart, End: wantEnd}) {
		return fmt.Errorf("narrator available trajectory range does not match %d..%d", wantStart, wantEnd)
	}
	if len(window.Events) == 0 || window.IncludedRange == nil {
		return fmt.Errorf("non-empty narrator trajectory range has no included events")
	}
	if len(window.Events) > request.MaxTrajectoryEvents {
		return fmt.Errorf("narrator trajectory window exceeds requested limit")
	}
	if err := window.validateEvents(request.ConversationID); err != nil {
		return err
	}
	included := TrajectorySequenceRange{
		Start: window.Events[0].Sequence,
		End:   window.Events[len(window.Events)-1].Sequence,
	}
	if *window.IncludedRange != included {
		return fmt.Errorf("narrator included trajectory range does not match its events")
	}
	return window.validateWindowShape(request.Kind, wantStart, wantEnd, included)
}

func (window NarratorTrajectoryWindow) validateEmpty() error {
	if window.AvailableRange != nil || window.IncludedRange != nil || len(window.Events) != 0 || window.HasEarlier || window.HasLater {
		return fmt.Errorf("empty narrator trajectory range contains records or continuation flags")
	}
	return nil
}

func (window NarratorTrajectoryWindow) validateEvents(conversationID string) error {
	previous := window.Events[0].Sequence - 1
	for _, event := range window.Events {
		if err := event.Validate(); err != nil {
			return err
		}
		if event.ConversationID != conversationID || event.Sequence != previous+1 {
			return fmt.Errorf("narrator trajectory window is not contiguous for %s", conversationID)
		}
		previous = event.Sequence
	}
	return nil
}

func (window NarratorTrajectoryWindow) validateWindowShape(
	kind NarratorContextReadKind,
	wantStart int,
	wantEnd int,
	included TrajectorySequenceRange,
) error {
	if kind == NarratorContextReadStatus {
		if window.HasLater || included.End != wantEnd || window.HasEarlier != (included.Start > wantStart) {
			return fmt.Errorf("narrator status trajectory is not the latest contiguous suffix")
		}
		return nil
	}
	if window.HasEarlier || included.Start != wantStart || window.HasLater != (included.End < wantEnd) {
		return fmt.Errorf("narrator trajectory is not the earliest contiguous prefix")
	}
	return nil
}

func validateNarratorContextNarration(source NarratorContextSource, request NarratorContextReadRequest) error {
	if source.PriorMilestones == nil || source.RecentFinalSummaries == nil {
		return fmt.Errorf("narrator prior-output collections must not be nil")
	}
	if len(source.RecentFinalSummaries) > request.MaxFinalSummaries {
		return fmt.Errorf("narrator final summaries exceed requested limit")
	}
	if err := validateNarratorPriorMilestones(source.PriorMilestones, source.CurrentTurn.Turn, request.ConversationID); err != nil {
		return err
	}
	if err := validateNarratorCurrentTurnFinalSummary(source.CurrentTurnFinalSummary, source.CurrentTurn.Turn, request.ConversationID); err != nil {
		return err
	}
	return validateNarratorFinalSummaries(
		source.RecentFinalSummaries,
		source.CurrentTurn.Turn,
		request.ConversationID,
		request.Kind == NarratorContextReadProjection,
	)
}

func validateNarratorPriorMilestones(
	events []NarrationEvent,
	turn *ConversationTurn,
	conversationID string,
) error {
	previousSequence := 0
	for _, event := range events {
		if err := event.Validate(); err != nil {
			return err
		}
		if event.Kind != NarrationEventKindMilestone || event.ConversationID != conversationID ||
			turn == nil || event.TurnID == nil || *event.TurnID != turn.ID {
			return fmt.Errorf("narrator prior milestone %s does not belong to the target turn", event.ID)
		}
		if event.StreamSequence <= previousSequence {
			return fmt.Errorf("narrator prior milestones are not strictly ordered")
		}
		previousSequence = event.StreamSequence
	}
	return nil
}

func validateNarratorCurrentTurnFinalSummary(
	event *NarrationEvent,
	turn *ConversationTurn,
	conversationID string,
) error {
	if event == nil {
		return nil
	}
	if err := event.Validate(); err != nil {
		return err
	}
	if event.Kind != NarrationEventKindFinalSummary || event.ConversationID != conversationID ||
		turn == nil || event.TurnID == nil || *event.TurnID != turn.ID {
		return fmt.Errorf("narrator current-turn final summary %s does not belong to the target turn", event.ID)
	}
	return nil
}

func validateNarratorFinalSummaries(
	events []NarrationEvent,
	turn *ConversationTurn,
	conversationID string,
	excludeTargetTurn bool,
) error {
	previousSequence := 0
	for _, event := range events {
		if err := event.Validate(); err != nil {
			return err
		}
		if event.Kind != NarrationEventKindFinalSummary || event.ConversationID != conversationID {
			return fmt.Errorf("narrator recent output %s is not a conversation final summary", event.ID)
		}
		if excludeTargetTurn && turn != nil && event.TurnID != nil && *event.TurnID == turn.ID {
			return fmt.Errorf("narrator final summary %s belongs to the target turn", event.ID)
		}
		if event.StreamSequence <= previousSequence {
			return fmt.Errorf("narrator final summaries are not strictly ordered")
		}
		previousSequence = event.StreamSequence
	}
	return nil
}
