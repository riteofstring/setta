package narration

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"setta/internal/conversation"
)

const defaultProjectionEventLimit = 64

var ErrNoUnobservedTrajectory = errors.New("narrator projection has no unobserved trajectory")

type ContextBuilder struct {
	store      *conversation.Store
	eventLimit int
}

type ProjectionMaterialization struct {
	Context ProjectionContext
	HasMore bool
	TurnID  *string
}

func NewContextBuilder(store *conversation.Store) (*ContextBuilder, error) {
	if store == nil {
		return nil, errors.New("narrator context store is required")
	}
	return &ContextBuilder{store: store, eventLimit: defaultProjectionEventLimit}, nil
}

func (builder *ContextBuilder) Projection(ctx context.Context, conversationID string, trigger conversation.NarrationTrigger, profile conversation.RoleProfile) (ProjectionMaterialization, error) {
	record, err := builder.store.ReadConversation(ctx, conversationID)
	if err != nil {
		return ProjectionMaterialization{}, err
	}
	snapshot, err := builder.store.ReadSnapshot(ctx, record.WorkspaceID, conversationID)
	if err != nil {
		return ProjectionMaterialization{}, err
	}
	events, hasMore, err := builder.store.ReadTrajectoryRange(ctx, conversationID, snapshot.NarratorState.ObservedThroughSequence, builder.eventLimit)
	if err != nil {
		return ProjectionMaterialization{}, err
	}
	if len(events) == 0 {
		return ProjectionMaterialization{}, ErrNoUnobservedTrajectory
	}
	turnID := latestTurnID(events)
	priorMilestones, err := builder.priorMilestones(ctx, conversationID, turnID)
	if err != nil {
		return ProjectionMaterialization{}, err
	}
	recentSummaries, err := builder.recentFinalSummaries(ctx, conversationID)
	if err != nil {
		return ProjectionMaterialization{}, err
	}
	contextBundle := ProjectionContext{
		ConversationID: conversationID, ConversationTitle: record.Title,
		TopicDescriptor: record.TopicDescriptor, CurrentObjective: snapshot.CurrentProjection.CurrentObjective,
		AcceptedSteering:          append([]string{}, snapshot.CurrentProjection.AcceptedSteering...),
		HistoricalCheckpoint:      snapshot.NarratorState.CheckpointText,
		CheckpointThroughSequence: snapshot.NarratorState.CheckpointThroughSequence,
		ObservedThroughSequence:   snapshot.NarratorState.ObservedThroughSequence,
		IncludedRange:             ContextRange{Start: events[0].Sequence, End: events[len(events)-1].Sequence},
		Events:                    events, CurrentPlan: clonePlan(snapshot.CurrentProjection.CurrentPlan),
		ActiveActivities:  append([]conversation.TrajectoryActivity{}, snapshot.CurrentProjection.ActiveActivities...),
		ActiveSubagents:   append([]conversation.Subagent{}, snapshot.CurrentProjection.ActiveSubagents...),
		PendingApproval:   cloneApproval(snapshot.CurrentProjection.PendingApproval),
		Artifacts:         append([]conversation.Artifact{}, snapshot.Artifacts.Artifacts...),
		PriorCurrentFocus: snapshot.NarratorState.CurrentFocus,
		PriorMilestones:   priorMilestones, RecentFinalSummaries: recentSummaries,
		Trigger: trigger,
	}
	trimmed, err := fitProjectionContext(contextBundle, profile.ContextBudget.MaxInputBytes)
	if err != nil {
		return ProjectionMaterialization{}, err
	}
	if len(trimmed.Events) < len(events) {
		hasMore = true
	}
	return ProjectionMaterialization{Context: trimmed, HasMore: hasMore, TurnID: turnID}, nil
}

func (builder *ContextBuilder) Status(ctx context.Context, conversationID string, question string) (StatusContext, error) {
	record, err := builder.store.ReadConversation(ctx, conversationID)
	if err != nil {
		return StatusContext{}, err
	}
	snapshot, err := builder.store.ReadSnapshot(ctx, record.WorkspaceID, conversationID)
	if err != nil {
		return StatusContext{}, err
	}
	summaries, err := builder.recentFinalSummaries(ctx, conversationID)
	if err != nil {
		return StatusContext{}, err
	}
	latest := append([]conversation.TrajectoryEvent{}, snapshot.Trajectory.Events...)
	var omitted *ContextRange
	if snapshot.Trajectory.HasEarlier && len(latest) > 0 && snapshot.NarratorState.ObservedThroughSequence < latest[0].Sequence-1 {
		omitted = &ContextRange{Start: snapshot.NarratorState.ObservedThroughSequence + 1, End: latest[0].Sequence - 1}
	}
	return StatusContext{
		ConversationID: conversationID, ConversationTitle: record.Title, Question: question,
		CurrentObjective: snapshot.CurrentProjection.CurrentObjective,
		AcceptedSteering: append([]string{}, snapshot.CurrentProjection.AcceptedSteering...),
		CurrentPlan:      clonePlan(snapshot.CurrentProjection.CurrentPlan),
		ActiveActivities: append([]conversation.TrajectoryActivity{}, snapshot.CurrentProjection.ActiveActivities...),
		ActiveSubagents:  append([]conversation.Subagent{}, snapshot.CurrentProjection.ActiveSubagents...),
		PendingApproval:  cloneApproval(snapshot.CurrentProjection.PendingApproval), Artifacts: append([]conversation.Artifact{}, snapshot.Artifacts.Artifacts...),
		CurrentFocus: snapshot.NarratorState.CurrentFocus, LatestEvents: latest,
		OmittedRange: omitted, RecentSummaries: summaries,
		SourceThroughSequence: record.LastTrajectorySequence,
	}, nil
}

func fitProjectionContext(bundle ProjectionContext, maxBytes int) (ProjectionContext, error) {
	events := bundle.Events
	bundle.Events = []conversation.TrajectoryEvent{}
	base, err := json.Marshal(bundle)
	if err != nil {
		return ProjectionContext{}, err
	}
	if len(base) > maxBytes {
		return ProjectionContext{}, fmt.Errorf("required narrator context is %d bytes, exceeds %d", len(base), maxBytes)
	}
	for _, event := range events {
		candidate := bundle
		candidate.Events = append(append([]conversation.TrajectoryEvent{}, bundle.Events...), event)
		encoded, err := json.Marshal(candidate)
		if err != nil {
			return ProjectionContext{}, err
		}
		if len(encoded) > maxBytes {
			break
		}
		bundle = candidate
	}
	if len(bundle.Events) == 0 {
		return ProjectionContext{}, errors.New("required narrator context leaves no room for one complete trajectory event")
	}
	bundle.IncludedRange.End = bundle.Events[len(bundle.Events)-1].Sequence
	return bundle, nil
}

func clonePlan(value *conversation.TrajectoryPlanChanged) *conversation.TrajectoryPlanChanged {
	if value == nil {
		return nil
	}
	copy := *value
	copy.Steps = append([]conversation.PlanStep{}, value.Steps...)
	return &copy
}

func cloneApproval(value *conversation.TrajectoryApprovalRequest) *conversation.TrajectoryApprovalRequest {
	if value == nil {
		return nil
	}
	copy := *value
	copy.Questions = append([]conversation.TrajectoryApprovalQuestion{}, value.Questions...)
	return &copy
}

func latestTurnID(events []conversation.TrajectoryEvent) *string {
	for index := len(events) - 1; index >= 0; index-- {
		if events[index].TurnID != nil {
			value := *events[index].TurnID
			return &value
		}
	}
	return nil
}

func (builder *ContextBuilder) priorMilestones(ctx context.Context, conversationID string, turnID *string) ([]string, error) {
	if turnID == nil {
		return []string{}, nil
	}
	events, err := builder.store.ReadNarrationHistory(ctx, conversationID, turnID, conversation.MaxCommittedEventReadLimit)
	if err != nil {
		return nil, err
	}
	result := make([]string, 0)
	for _, event := range events {
		if event.Milestone != nil {
			result = append(result, event.Milestone.Text)
		}
	}
	return result, nil
}

func (builder *ContextBuilder) recentFinalSummaries(ctx context.Context, conversationID string) ([]string, error) {
	events, err := builder.store.ReadNarrationHistory(ctx, conversationID, nil, 32)
	if err != nil {
		return nil, err
	}
	result := make([]string, 0)
	for _, event := range events {
		if event.FinalSummary != nil {
			result = append(result, event.FinalSummary.Text)
		}
	}
	return result, nil
}
