package conversation

import (
	"context"
	"fmt"
	"strings"

	"setta/internal/agent"
)

func (service *Service) persistAgentProgress(
	ctx context.Context,
	active *activeConversationTurn,
	event agent.Event,
) error {
	snapshot, turn, err := service.runningProgressState(ctx, active)
	if err != nil {
		return err
	}
	now := service.timestamp()
	trajectories, artifact, err := service.progressTrajectories(active, snapshot, event, now)
	if err != nil {
		return err
	}
	mutation := buildAgentProgressMutation(snapshot, turn, trajectories, artifact, event, now)
	publications, err := service.publications(
		active.conversationID,
		now,
		agentProgressPayloads(mutation)...,
	)
	if err != nil {
		return err
	}
	return service.commitAgentProgress(ctx, mutation, publications)
}

type agentProgressMutation struct {
	artifact            *Artifact
	conversation        TopicConversation
	conversationChanged bool
	snapshot            ConversationSnapshot
	trajectories        []TrajectoryEvent
	turn                ConversationTurn
	turnChanged         bool
}

func (service *Service) runningProgressState(
	ctx context.Context,
	active *activeConversationTurn,
) (ConversationSnapshot, ConversationTurn, error) {
	snapshot, err := service.snapshotLocked(ctx, active.workspaceID, active.conversationID)
	if err != nil {
		return ConversationSnapshot{}, ConversationTurn{}, err
	}
	turn, err := findConversationTurn(snapshot, active.turnID)
	if err != nil {
		return ConversationSnapshot{}, ConversationTurn{}, err
	}
	if turn.Status != TurnStatusRunning {
		return ConversationSnapshot{}, ConversationTurn{}, &CommandConflictError{
			ConversationID: active.conversationID,
			Reason:         "agent progress requires a running turn",
		}
	}
	return snapshot, turn, nil
}

func (service *Service) progressTrajectories(
	active *activeConversationTurn,
	snapshot ConversationSnapshot,
	event agent.Event,
	now string,
) ([]TrajectoryEvent, *Artifact, error) {
	trajectory, artifact, err := service.trajectoryFromAgentEvent(active, snapshot, event, now)
	if err != nil {
		return nil, nil, err
	}
	trajectory.Sequence = snapshot.Conversation.LastTrajectorySequence + 1
	trajectories := []TrajectoryEvent{trajectory}
	if artifact != nil {
		artifactTrajectory, err := service.artifactTrajectory(active, event, *artifact, trajectory.Sequence+1, now)
		if err != nil {
			return nil, nil, err
		}
		artifact.TrajectorySequence = &artifactTrajectory.Sequence
		trajectories = append(trajectories, artifactTrajectory)
	}
	return trajectories, artifact, nil
}

func (service *Service) artifactTrajectory(
	active *activeConversationTurn,
	event agent.Event,
	artifact Artifact,
	sequence int,
	now string,
) (TrajectoryEvent, error) {
	artifactEventID, err := service.newID("trajectory")
	if err != nil {
		return TrajectoryEvent{}, err
	}
	return TrajectoryEvent{
		ID:               artifactEventID,
		ConversationID:   active.conversationID,
		TurnID:           &active.turnID,
		Sequence:         sequence,
		EmittedAt:        now,
		Kind:             TrajectoryEventArtifactEmitted,
		Actor:            TrajectoryActorSystem,
		ProviderThreadID: &event.ProviderThreadID,
		ProviderTurnID:   &event.ProviderTurnID,
		ArtifactEmitted:  &TrajectoryArtifactEmitted{ArtifactID: artifact.ID},
	}, nil
}

func buildAgentProgressMutation(
	snapshot ConversationSnapshot,
	turn ConversationTurn,
	trajectories []TrajectoryEvent,
	artifact *Artifact,
	event agent.Event,
	now string,
) agentProgressMutation {
	mutation := agentProgressMutation{
		artifact:     artifact,
		conversation: snapshot.Conversation,
		snapshot:     snapshot,
		trajectories: trajectories,
		turn:         turn,
	}
	if event.Kind == agent.EventKindApprovalRequested {
		mutation.conversation.Status = ConversationStatusWaitingForApproval
		mutation.conversation.UpdatedAt = advanceTimestamp(mutation.conversation.UpdatedAt, now)
		mutation.conversationChanged = true
	}
	if event.Kind == agent.EventKindModelRerouted {
		reroute := trajectories[0].ModelRerouted.Reroute
		mutation.turn.ResolvedInvocation.ModelReroutes = append(mutation.turn.ResolvedInvocation.ModelReroutes, reroute)
		mutation.turnChanged = true
	}
	return mutation
}

func agentProgressPayloads(mutation agentProgressMutation) []ConversationEventPayload {
	payloads := make([]ConversationEventPayload, 0, len(mutation.trajectories)+3)
	if mutation.conversationChanged {
		published := mutation.conversation
		published.LastTrajectorySequence += len(mutation.trajectories)
		payloads = append(payloads, ConversationUpdatedEventPayload{Type: ConversationEventTypeConversationUpdated, Conversation: published})
	}
	if mutation.turnChanged {
		payloads = append(payloads, ConversationTurnUpdatedEventPayload{Type: ConversationEventTypeTurnUpdated, Turn: mutation.turn})
	}
	for _, current := range mutation.trajectories {
		payloads = append(payloads, ConversationTrajectoryAppendedEventPayload{Type: ConversationEventTypeTrajectoryAppended, Event: current})
	}
	if mutation.artifact != nil {
		payloads = append(payloads, ConversationArtifactCreatedEventPayload{Type: ConversationEventTypeArtifactCreated, Artifact: *mutation.artifact})
	}
	return payloads
}

func (service *Service) commitAgentProgress(
	ctx context.Context,
	mutation agentProgressMutation,
	publications []preparedPublication,
) error {
	_, err := service.store.transactPresentationAware(ctx, "persist topic agent progress", func(transaction *WriteTransaction) error {
		if err := applyAgentProgressAggregates(transaction, mutation); err != nil {
			return err
		}
		for _, current := range mutation.trajectories {
			if err := transaction.AppendTrajectoryEvent(current); err != nil {
				return err
			}
		}
		if mutation.artifact != nil {
			if err := transaction.InsertArtifact(*mutation.artifact); err != nil {
				return err
			}
		}
		return appendPublications(transaction, publications)
	})
	if err == nil {
		service.observeCommittedTrajectory(
			mutation.snapshot.Conversation,
			mutation.turn.ID,
			mutation.trajectories,
			false,
		)
	}
	return err
}

func applyAgentProgressAggregates(transaction *WriteTransaction, mutation agentProgressMutation) error {
	if mutation.conversationChanged {
		if err := transaction.UpdateConversation(
			ConversationExpectation{
				UpdatedAt:              mutation.snapshot.Conversation.UpdatedAt,
				LastTrajectorySequence: mutation.snapshot.Conversation.LastTrajectorySequence,
			},
			mutation.conversation,
		); err != nil {
			return err
		}
	}
	if mutation.turnChanged {
		return transaction.UpdateTurn(TurnStatusRunning, mutation.turn)
	}
	return nil
}

func (service *Service) trajectoryFromAgentEvent(
	active *activeConversationTurn,
	snapshot ConversationSnapshot,
	event agent.Event,
	now string,
) (TrajectoryEvent, *Artifact, error) {
	eventID, err := service.newID("trajectory")
	if err != nil {
		return TrajectoryEvent{}, nil, err
	}
	trajectory := TrajectoryEvent{
		ID:               eventID,
		ConversationID:   active.conversationID,
		TurnID:           &active.turnID,
		EmittedAt:        now,
		ProviderEventID:  cloneStringPointer(event.ProviderEventID),
		ProviderThreadID: &event.ProviderThreadID,
		ProviderTurnID:   &event.ProviderTurnID,
	}
	return service.populateAgentTrajectory(trajectory, active, snapshot, event, now)
}

func (service *Service) populateAgentTrajectory(
	trajectory TrajectoryEvent,
	active *activeConversationTurn,
	snapshot ConversationSnapshot,
	event agent.Event,
	now string,
) (TrajectoryEvent, *Artifact, error) {
	switch event.Kind {
	case agent.EventKindAgentTextDelta, agent.EventKindAgentTextCompleted, agent.EventKindReasoningSummary:
		return conversationTextTrajectory(trajectory, event)
	case agent.EventKindPlanChanged:
		return conversationPlanTrajectory(trajectory, event)
	case agent.EventKindActivityStarted, agent.EventKindActivityUpdated, agent.EventKindActivityCompleted:
		return service.conversationActivityTrajectory(trajectory, active, event, now)
	case agent.EventKindApprovalRequested:
		return conversationApprovalTrajectory(trajectory, active, event, now)
	case agent.EventKindModelRerouted:
		return conversationModelRerouteTrajectory(trajectory, snapshot, event)
	case agent.EventKindLifecycleChanged:
		return conversationLifecycleTrajectory(trajectory, event)
	default:
		return TrajectoryEvent{}, nil, fmt.Errorf("unsupported agent progress event %q", event.Kind)
	}
}

func conversationTextTrajectory(
	trajectory TrajectoryEvent,
	event agent.Event,
) (TrajectoryEvent, *Artifact, error) {
	trajectory.Actor = TrajectoryActorAgent
	switch event.Kind {
	case agent.EventKindAgentTextDelta:
		trajectory.Kind = TrajectoryEventAgentPublicTextDelta
		trajectory.AgentPublicTextDelta = &TrajectoryAgentPublicTextDelta{
			ProviderItemID: event.Text.ProviderItemID,
			Delta:          event.Text.Text,
		}
	case agent.EventKindAgentTextCompleted:
		trajectory.Kind = TrajectoryEventAgentMessageCompleted
		trajectory.AgentMessageCompleted = &TrajectoryAgentMessageCompleted{
			ProviderItemID: event.Text.ProviderItemID,
			Text:           event.Text.Text,
		}
	case agent.EventKindReasoningSummary:
		trajectory.Kind = TrajectoryEventPublicReasoningSummaryUpdated
		trajectory.PublicReasoningSummaryUpdated = &TrajectoryPublicReasoningSummaryUpdated{
			ProviderItemID: event.Text.ProviderItemID,
			Summary:        []string{event.Text.Text},
		}
	default:
		return TrajectoryEvent{}, nil, fmt.Errorf("unsupported agent text event %q", event.Kind)
	}
	return trajectory, nil, nil
}

func conversationPlanTrajectory(
	trajectory TrajectoryEvent,
	event agent.Event,
) (TrajectoryEvent, *Artifact, error) {
	plan, err := conversationPlan(event.Plan)
	if err != nil {
		return TrajectoryEvent{}, nil, err
	}
	trajectory.Kind = TrajectoryEventPlanChanged
	trajectory.Actor = TrajectoryActorAgent
	trajectory.PlanChanged = plan
	return trajectory, nil, nil
}

func (service *Service) conversationActivityTrajectory(
	trajectory TrajectoryEvent,
	active *activeConversationTurn,
	event agent.Event,
	now string,
) (TrajectoryEvent, *Artifact, error) {
	if event.Activity != nil &&
		event.Activity.Kind == agent.ActivityKindSubagent &&
		event.Kind == agent.EventKindActivityCompleted {
		return conversationSubagentTrajectory(trajectory, event)
	}
	activity, err := conversationActivity(event.Activity, active.request.WorkspaceRoot)
	if err != nil {
		return TrajectoryEvent{}, nil, err
	}
	trajectory.Actor = TrajectoryActorAgent
	return service.activityTrajectory(trajectory, activity, event, now)
}

func conversationApprovalTrajectory(
	trajectory TrajectoryEvent,
	active *activeConversationTurn,
	event agent.Event,
	now string,
) (TrajectoryEvent, *Artifact, error) {
	approval, err := conversationApproval(event.Approval, active.request.WorkspaceRoot, now)
	if err != nil {
		return TrajectoryEvent{}, nil, err
	}
	trajectory.Kind = TrajectoryEventApprovalRequested
	trajectory.Actor = TrajectoryActorProvider
	trajectory.ApprovalRequested = &TrajectoryApprovalRequested{Approval: approval}
	return trajectory, nil, nil
}

func conversationModelRerouteTrajectory(
	trajectory TrajectoryEvent,
	snapshot ConversationSnapshot,
	event agent.Event,
) (TrajectoryEvent, *Artifact, error) {
	if snapshot.Turns.Turns == nil {
		return TrajectoryEvent{}, nil, fmt.Errorf("conversation snapshot turns are unavailable")
	}
	trajectory.Kind = TrajectoryEventModelRerouted
	trajectory.Actor = TrajectoryActorProvider
	trajectory.ModelRerouted = &TrajectoryModelRerouted{Reroute: InvocationModelReroute{
		FromModelID: event.ModelReroute.FromModel,
		ToModelID:   event.ModelReroute.ToModel,
		Reason:      event.ModelReroute.Reason,
	}}
	return trajectory, nil, nil
}

func conversationLifecycleTrajectory(
	trajectory TrajectoryEvent,
	event agent.Event,
) (TrajectoryEvent, *Artifact, error) {
	lifecycle, err := conversationProviderLifecycle(event.Lifecycle)
	if err != nil {
		return TrajectoryEvent{}, nil, err
	}
	trajectory.Kind = TrajectoryEventProviderLifecycleChanged
	trajectory.Actor = TrajectoryActorProvider
	trajectory.ProviderLifecycleChanged = &TrajectoryProviderLifecycleChanged{Lifecycle: lifecycle}
	return trajectory, nil, nil
}

func conversationPlan(plan *agent.PlanEvent) (*TrajectoryPlanChanged, error) {
	if plan == nil {
		return nil, fmt.Errorf("agent plan payload is required")
	}
	result := &TrajectoryPlanChanged{Explanation: cloneStringPointer(plan.Explanation), Steps: []PlanStep{}}
	for _, step := range plan.Steps {
		status, err := conversationPlanStatus(step.Status)
		if err != nil {
			return nil, err
		}
		result.Steps = append(result.Steps, PlanStep{Text: step.Step, Status: status})
	}
	return result, nil
}

func conversationPlanStatus(status string) (PlanStepStatus, error) {
	switch status {
	case "pending":
		return PlanStepStatusPending, nil
	case "inProgress", "in_progress":
		return PlanStepStatusInProgress, nil
	case "completed":
		return PlanStepStatusCompleted, nil
	default:
		return "", fmt.Errorf("unsupported provider plan status %q", status)
	}
}

func conversationActivity(activity *agent.ActivityEvent, workspaceRoot string) (TrajectoryActivity, error) {
	if activity == nil {
		return TrajectoryActivity{}, fmt.Errorf("agent activity payload is required")
	}
	result := TrajectoryActivity{ID: activity.ProviderItemID, Title: activity.Title}
	switch activity.Kind {
	case agent.ActivityKindCommand:
		result.Kind = TrajectoryActivityCommand
		result.Command = &result.Title
		result.CWD = &workspaceRoot
	case agent.ActivityKindFileChange:
		result.Kind = TrajectoryActivityFileChange
	case agent.ActivityKindTool:
		result.Kind = TrajectoryActivityDynamicTool
		result.Tool = &result.Title
	case agent.ActivityKindCollaboration:
		result.Kind = TrajectoryActivityOther
	case agent.ActivityKindSubagent:
		result.Kind = TrajectoryActivitySubagent
	case agent.ActivityKindArtifact:
		result.Kind = TrajectoryActivityImageGeneration
	case agent.ActivityKindOther:
		result.Kind = TrajectoryActivityOther
	default:
		return TrajectoryActivity{}, fmt.Errorf("unsupported agent activity kind %q", activity.Kind)
	}
	return result, result.Validate()
}

func conversationSubagentTrajectory(
	trajectory TrajectoryEvent,
	event agent.Event,
) (TrajectoryEvent, *Artifact, error) {
	activity := event.Activity
	if activity == nil {
		return TrajectoryEvent{}, nil, fmt.Errorf("agent subagent activity payload is required")
	}
	providerThreadID := strings.TrimSpace(activity.Summary)
	if providerThreadID == "" {
		return TrajectoryEvent{}, nil, fmt.Errorf("agent subagent activity requires provider thread id")
	}
	subagent := Subagent{
		ID:               providerThreadID,
		ProviderThreadID: providerThreadID,
		Message:          stringPointerValue(activity.Title),
	}
	trajectory.Actor = TrajectoryActorAgent
	switch activity.Status {
	case "started":
		subagent.Status = SubagentStatusRunning
		trajectory.Kind = TrajectoryEventSubagentStarted
		trajectory.SubagentStarted = &TrajectorySubagentStarted{Subagent: subagent}
	case "interacted":
		subagent.Status = SubagentStatusRunning
		trajectory.Kind = TrajectoryEventSubagentUpdated
		trajectory.SubagentUpdated = &TrajectorySubagentUpdated{Subagent: subagent}
	case "interrupted":
		subagent.Status = SubagentStatusInterrupted
		trajectory.Kind = TrajectoryEventSubagentCompleted
		trajectory.SubagentCompleted = &TrajectorySubagentCompleted{Subagent: subagent}
	default:
		return TrajectoryEvent{}, nil, fmt.Errorf("unsupported provider subagent activity %q", activity.Status)
	}
	return trajectory, nil, nil
}

func (service *Service) activityTrajectory(
	trajectory TrajectoryEvent,
	activity TrajectoryActivity,
	event agent.Event,
	now string,
) (TrajectoryEvent, *Artifact, error) {
	summary := strings.TrimSpace(event.Activity.Summary)
	if summary == "" {
		summary = activity.Title
	}
	switch event.Kind {
	case agent.EventKindActivityStarted:
		trajectory.Kind = TrajectoryEventActivityStarted
		trajectory.ActivityStarted = &TrajectoryActivityStarted{Activity: activity}
	case agent.EventKindActivityUpdated:
		trajectory.Kind = TrajectoryEventActivityProgressed
		trajectory.ActivityProgressed = &TrajectoryActivityProgressed{
			ActivityID: activity.ID,
			Progress:   summary,
		}
	case agent.EventKindActivityCompleted:
		failed, err := agentActivityFailed(event.Activity.Status)
		if err != nil {
			return TrajectoryEvent{}, nil, err
		}
		if failed {
			failure := Failure{Code: "provider_activity_failed", Message: summary, Retryable: true}
			trajectory.Kind = TrajectoryEventActivityFailed
			trajectory.ActivityFailed = &TrajectoryActivityFailed{Activity: activity, Failure: failure}
			break
		}
		trajectory.Kind = TrajectoryEventActivityCompleted
		trajectory.ActivityCompleted = &TrajectoryActivityCompleted{
			Activity: activity,
			Summary:  summary,
			ExitCode: event.Activity.ExitCode,
		}
		if event.Activity.Kind == agent.ActivityKindArtifact && strings.TrimSpace(event.Activity.Summary) != "" {
			artifactID, err := service.newID("artifact")
			if err != nil {
				return TrajectoryEvent{}, nil, err
			}
			artifact := Artifact{
				ID:             artifactID,
				ConversationID: trajectory.ConversationID,
				TurnID:         trajectory.TurnID,
				Kind:           ArtifactKindFile,
				Title:          activity.Title,
				CreatedAt:      now,
				File:           &FileArtifactPayload{Path: event.Activity.Summary},
			}
			return trajectory, &artifact, nil
		}
	}
	return trajectory, nil, nil
}

func agentActivityFailed(status string) (bool, error) {
	switch status {
	case "failed", "declined", "cancelled":
		return true, nil
	case "completed", "inProgress", "in_progress", "running", "success", "succeeded":
		return false, nil
	default:
		return false, fmt.Errorf("unsupported provider activity status %q", status)
	}
}

func conversationProviderLifecycle(lifecycle *agent.LifecycleEvent) (ProviderLifecycle, error) {
	if lifecycle == nil {
		return ProviderLifecycle{}, fmt.Errorf("agent lifecycle payload is required")
	}
	status := ProviderLifecycleUnavailable
	switch lifecycle.State {
	case "starting":
		status = ProviderLifecycleStarting
	case "ready":
		status = ProviderLifecycleReady
	case "restarting":
		status = ProviderLifecycleRestarting
	case "unavailable", "degraded":
		status = ProviderLifecycleUnavailable
	case "closed":
		status = ProviderLifecycleClosed
	default:
		return ProviderLifecycle{}, fmt.Errorf("unsupported provider lifecycle state %q", lifecycle.State)
	}
	message := lifecycle.Reason
	if lifecycle.Error != nil && *lifecycle.Error != "" {
		message = *lifecycle.Error
	}
	if strings.TrimSpace(message) == "" {
		message = string(status)
	}
	return ProviderLifecycle{Provider: ProviderCodex, Status: status, Message: message}, nil
}
