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
		ID:             artifactEventID,
		ConversationID: active.conversationID,
		TurnID:         &active.turnID,
		Sequence:       sequence,
		EmittedAt:      now,
		Kind:           TrajectoryEventArtifactEmitted,
		Actor:          TrajectoryActorSystem,
		ProviderTurnID: &event.ProviderTurnID,
		ArtifactEmitted: &TrajectoryArtifactEmitted{
			ArtifactID: artifact.ID,
			Kind:       artifact.Kind,
			Title:      artifact.Title,
		},
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
	// A superseded approval stops being something the user can answer, so the
	// conversation goes back to working unless another approval is still waiting.
	if event.Kind == agent.EventKindApprovalSuperseded && len(pendingApprovalsForTurn(snapshot, turn.ID)) <= 1 {
		mutation.conversation.Status = ConversationStatusWorking
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
		payloads = append(payloads, ConversationArtifactCreatedEventPayload{Type: ConversationEventTypeArtifactCreated, Artifact: mutation.artifact.Metadata()})
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
		artifacts := []ArtifactMetadata(nil)
		if mutation.artifact != nil {
			artifacts = []ArtifactMetadata{mutation.artifact.Metadata()}
		}
		service.observeCommittedTrajectory(
			mutation.conversation,
			mutation.turn,
			mutation.trajectories,
			artifacts,
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
		ID:              eventID,
		ConversationID:  active.conversationID,
		TurnID:          &active.turnID,
		EmittedAt:       now,
		ProviderEventID: cloneStringPointer(event.ProviderEventID),
		ProviderTurnID:  &event.ProviderTurnID,
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
	case agent.EventKindApprovalSuperseded:
		return conversationApprovalSupersededTrajectory(trajectory, snapshot, event, now)
	case agent.EventKindValidationRecorded:
		return conversationValidationTrajectory(trajectory, event)
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
	if event.Activity == nil {
		return TrajectoryEvent{}, nil, fmt.Errorf("agent activity payload is required")
	}
	if event.Activity.Kind == agent.ActivityKindSubagent {
		return service.conversationSubagentTrajectory(trajectory, active, event)
	}
	if event.Activity.Kind == agent.ActivityKindFileChange &&
		event.Kind != agent.EventKindActivityUpdated &&
		len(event.Activity.FileChanges) > 0 {
		return conversationFileChangeTrajectory(trajectory, event)
	}
	trajectory.Actor = TrajectoryActorAgent
	// Progress addresses the activity the start already described, so it needs
	// the activity's id and its new progress text, not a second description of
	// what the activity is.
	if event.Kind == agent.EventKindActivityUpdated {
		trajectory.Kind = TrajectoryEventActivityProgressed
		trajectory.ActivityProgressed = &TrajectoryActivityProgressed{
			ActivityID: event.Activity.ProviderItemID,
			Progress:   activityProgressText(*event.Activity),
		}
		return trajectory, nil, nil
	}
	activity, err := conversationActivity(*event.Activity)
	if err != nil {
		return TrajectoryEvent{}, nil, err
	}
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

// conversationApprovalSupersededTrajectory resolves the durable approval record
// the provider answered elsewhere. The decision is superseded rather than
// cancelled, because nobody in this app made a choice.
func conversationApprovalSupersededTrajectory(
	trajectory TrajectoryEvent,
	snapshot ConversationSnapshot,
	event agent.Event,
	now string,
) (TrajectoryEvent, *Artifact, error) {
	if event.ApprovalSuperseded == nil {
		return TrajectoryEvent{}, nil, fmt.Errorf("agent approval superseded payload is required")
	}
	if trajectory.TurnID == nil {
		return TrajectoryEvent{}, nil, fmt.Errorf("agent approval superseded trajectory turn id is required")
	}
	approvalID := event.ApprovalSuperseded.ApprovalID
	if _, pending := pendingApprovalsForTurn(snapshot, *trajectory.TurnID)[approvalID]; !pending {
		return TrajectoryEvent{}, nil, fmt.Errorf(
			"agent approval %s cannot be superseded because it is not durably pending for turn %s",
			approvalID,
			*trajectory.TurnID,
		)
	}
	trajectory.Kind = TrajectoryEventApprovalResolved
	trajectory.Actor = TrajectoryActorProvider
	trajectory.ApprovalResolved = &TrajectoryApprovalResolved{Resolution: TrajectoryApprovalResolution{
		ApprovalID: approvalID,
		Decision:   TrajectoryApprovalDecisionSuperseded,
		Answers:    []ConversationApprovalAnswer{},
		ResolvedAt: now,
	}}
	return trajectory, nil, nil
}

func conversationValidationTrajectory(
	trajectory TrajectoryEvent,
	event agent.Event,
) (TrajectoryEvent, *Artifact, error) {
	validation, err := conversationValidation(event.Validation)
	if err != nil {
		return TrajectoryEvent{}, nil, err
	}
	trajectory.Kind = TrajectoryEventValidationRecorded
	trajectory.Actor = TrajectoryActorProvider
	trajectory.ValidationRecorded = &TrajectoryValidationRecorded{Validation: validation}
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
	if event.ModelReroute == nil {
		return TrajectoryEvent{}, nil, fmt.Errorf("agent model-reroute payload is required")
	}
	reason, err := conversationModelRerouteReason(event.ModelReroute.Reason)
	if err != nil {
		return TrajectoryEvent{}, nil, err
	}
	trajectory.Kind = TrajectoryEventModelRerouted
	trajectory.Actor = TrajectoryActorProvider
	trajectory.ModelRerouted = &TrajectoryModelRerouted{Reroute: InvocationModelReroute{
		FromModelID: event.ModelReroute.FromModel,
		ToModelID:   event.ModelReroute.ToModel,
		Reason:      reason,
	}}
	return trajectory, nil, nil
}

func conversationModelRerouteReason(reason agent.ModelRerouteReason) (InvocationModelRerouteReason, error) {
	switch reason {
	case agent.ModelRerouteReasonHighRiskCyberActivity:
		return InvocationModelRerouteReasonHighRiskCyberActivity, nil
	default:
		return "", fmt.Errorf("unsupported agent model-reroute reason %q", reason)
	}
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

func activityProgressText(activity agent.ActivityEvent) string {
	if summary := strings.TrimSpace(activity.Summary); summary != "" {
		return summary
	}
	return activity.Title
}

func conversationActivity(activity agent.ActivityEvent) (TrajectoryActivity, error) {
	kind, err := trajectoryActivityKind(activity.Kind)
	if err != nil {
		return TrajectoryActivity{}, err
	}
	result := TrajectoryActivity{
		ID:        activity.ProviderItemID,
		Kind:      kind,
		Title:     activity.Title,
		Command:   cloneStringPointer(activity.Command),
		CWD:       cloneStringPointer(activity.CWD),
		Server:    cloneStringPointer(activity.Server),
		Tool:      cloneStringPointer(activity.Tool),
		Namespace: cloneStringPointer(activity.Namespace),
		ProcessID: cloneStringPointer(activity.ProcessID),
	}
	return result, result.Validate()
}

// trajectoryActivityKind renames the adapter's activity vocabulary into the
// durable one. The two catalogs are the same set of typed activities, so a new
// provider activity kind has to be given durable meaning here rather than
// collapsing into a bucket the Director cannot resolve.
func trajectoryActivityKind(kind agent.ActivityKind) (TrajectoryActivityKind, error) {
	resolved, ok := trajectoryActivityKindByAgentKind[kind]
	if !ok {
		return "", fmt.Errorf("unsupported agent activity kind %q", kind)
	}
	return resolved, nil
}

var trajectoryActivityKindByAgentKind = map[agent.ActivityKind]TrajectoryActivityKind{
	agent.ActivityKindCommand:         TrajectoryActivityCommand,
	agent.ActivityKindDynamicTool:     TrajectoryActivityDynamicTool,
	agent.ActivityKindFileChange:      TrajectoryActivityFileChange,
	agent.ActivityKindHook:            TrajectoryActivityHook,
	agent.ActivityKindImageGeneration: TrajectoryActivityImageGeneration,
	agent.ActivityKindImageView:       TrajectoryActivityImageView,
	agent.ActivityKindMCPTool:         TrajectoryActivityMCPTool,
	agent.ActivityKindOther:           TrajectoryActivityOther,
	agent.ActivityKindSleep:           TrajectoryActivitySleep,
	agent.ActivityKindSubagent:        TrajectoryActivitySubagent,
	agent.ActivityKindWebSearch:       TrajectoryActivityWebSearch,
}

func (service *Service) conversationSubagentTrajectory(
	trajectory TrajectoryEvent,
	active *activeConversationTurn,
	event agent.Event,
) (TrajectoryEvent, *Artifact, error) {
	activity := event.Activity
	if activity == nil {
		return TrajectoryEvent{}, nil, fmt.Errorf("agent subagent activity payload is required")
	}
	if active == nil {
		return TrajectoryEvent{}, nil, fmt.Errorf("active turn is required to map a subagent")
	}
	if activity.ProviderSubagentThreadID == nil ||
		strings.TrimSpace(*activity.ProviderSubagentThreadID) == "" {
		return TrajectoryEvent{}, nil, fmt.Errorf("agent subagent activity requires provider thread id")
	}
	if active.subagentIDs == nil {
		active.subagentIDs = map[string]string{}
	}
	providerThreadID := strings.TrimSpace(*activity.ProviderSubagentThreadID)
	subagentID := active.subagentIDs[providerThreadID]
	if subagentID == "" {
		var err error
		subagentID, err = service.newID("subagent")
		if err != nil {
			return TrajectoryEvent{}, nil, err
		}
		active.subagentIDs[providerThreadID] = subagentID
	}
	subagent := Subagent{
		ID:      subagentID,
		Message: stringPointerValue(activity.Title),
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

func conversationFileChangeTrajectory(
	trajectory TrajectoryEvent,
	event agent.Event,
) (TrajectoryEvent, *Artifact, error) {
	if event.Activity == nil {
		return TrajectoryEvent{}, nil, fmt.Errorf("agent file change activity payload is required")
	}
	changes, err := conversationFileChanges(event.Activity.FileChanges)
	if err != nil {
		return TrajectoryEvent{}, nil, err
	}
	trajectory.Actor = TrajectoryActorAgent
	if event.Kind == agent.EventKindActivityStarted {
		trajectory.Kind = TrajectoryEventFileChangeProposed
		trajectory.FileChangeProposed = &TrajectoryFileChangeProposed{
			ProviderItemID: event.Activity.ProviderItemID,
			Changes:        changes,
		}
		return trajectory, nil, nil
	}
	if event.Kind != agent.EventKindActivityCompleted {
		return TrajectoryEvent{}, nil, fmt.Errorf("unsupported agent file change event %q", event.Kind)
	}
	completed := &TrajectoryFileChangeCompleted{
		ProviderItemID: event.Activity.ProviderItemID,
		Changes:        changes,
	}
	switch event.Activity.Status {
	case "completed":
		completed.Outcome = FileChangeOutcomeCompleted
	case "declined":
		completed.Outcome = FileChangeOutcomeDeclined
	case "failed":
		completed.Outcome = FileChangeOutcomeFailed
		completed.Failure = &Failure{
			Code:      "provider_file_change_failed",
			Message:   "The file change failed",
			Retryable: true,
		}
	default:
		return TrajectoryEvent{}, nil, fmt.Errorf(
			"unsupported provider file change status %q",
			event.Activity.Status,
		)
	}
	trajectory.Kind = TrajectoryEventFileChangeCompleted
	trajectory.FileChangeCompleted = completed
	return trajectory, nil, nil
}

func conversationFileChanges(changes []agent.FileChange) ([]FileChange, error) {
	result := make([]FileChange, 0, len(changes))
	for _, change := range changes {
		kind, err := conversationFileChangeKind(change.Kind)
		if err != nil {
			return nil, err
		}
		result = append(result, FileChange{
			Path:     change.Path,
			Kind:     kind,
			MovePath: cloneStringPointer(change.MovePath),
			Diff:     change.Diff,
		})
	}
	if err := validateFileChanges(result); err != nil {
		return nil, err
	}
	return result, nil
}

func conversationFileChangeKind(kind agent.FileChangeKind) (FileChangeKind, error) {
	switch kind {
	case agent.FileChangeKindAdd:
		return FileChangeAdd, nil
	case agent.FileChangeKindDelete:
		return FileChangeDelete, nil
	case agent.FileChangeKindUpdate:
		return FileChangeUpdate, nil
	default:
		return "", fmt.Errorf("unsupported agent file change kind %q", kind)
	}
}

func (service *Service) activityTrajectory(
	trajectory TrajectoryEvent,
	activity TrajectoryActivity,
	event agent.Event,
	now string,
) (TrajectoryEvent, *Artifact, error) {
	summary := activityProgressText(*event.Activity)
	if event.Kind == agent.EventKindActivityStarted {
		trajectory.Kind = TrajectoryEventActivityStarted
		trajectory.ActivityStarted = &TrajectoryActivityStarted{Activity: activity}
		return trajectory, nil, nil
	}
	if event.Kind != agent.EventKindActivityCompleted {
		return TrajectoryEvent{}, nil, fmt.Errorf("unsupported agent activity event %q", event.Kind)
	}
	failed, err := agentActivityFailed(event.Activity.Status)
	if err != nil {
		return TrajectoryEvent{}, nil, err
	}
	if failed {
		failure := Failure{Code: "provider_activity_failed", Message: summary, Retryable: true}
		trajectory.Kind = TrajectoryEventActivityFailed
		trajectory.ActivityFailed = &TrajectoryActivityFailed{Activity: activity, Failure: failure}
		return trajectory, nil, nil
	}
	trajectory.Kind = TrajectoryEventActivityCompleted
	trajectory.ActivityCompleted = &TrajectoryActivityCompleted{
		Activity: activity,
		Summary:  summary,
		ExitCode: event.Activity.ExitCode,
	}
	if event.Activity.Kind != agent.ActivityKindImageGeneration ||
		event.Activity.SavedPath == nil ||
		strings.TrimSpace(*event.Activity.SavedPath) == "" {
		return trajectory, nil, nil
	}
	artifactID, err := service.newID("artifact")
	if err != nil {
		return TrajectoryEvent{}, nil, err
	}
	return trajectory, &Artifact{
		ID:             artifactID,
		ConversationID: trajectory.ConversationID,
		TurnID:         trajectory.TurnID,
		Kind:           ArtifactKindFile,
		Title:          activity.Title,
		CreatedAt:      now,
		File:           &FileArtifactPayload{Path: strings.TrimSpace(*event.Activity.SavedPath)},
	}, nil
}

func agentActivityFailed(status string) (bool, error) {
	switch status {
	// A hook that blocks or stops the work it guards did not succeed, so it
	// closes as a failed activity the user can see and act on.
	case "failed", "declined", "cancelled", "blocked", "stopped":
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
	status, err := conversationProviderLifecycleStatus(lifecycle.State)
	if err != nil {
		return ProviderLifecycle{}, err
	}
	reason, err := conversationProviderLifecycleReason(lifecycle.Reason)
	if err != nil {
		return ProviderLifecycle{}, err
	}
	result := ProviderLifecycle{Provider: ProviderCodex, Status: status, Reason: reason}
	return result, result.Validate()
}

// conversationProviderLifecycleStatus renames the adapter's lifecycle states
// into the durable ones. The two catalogs are the same set, so a new provider
// state has to be given durable meaning here.
func conversationProviderLifecycleStatus(state agent.LifecycleState) (ProviderLifecycleStatus, error) {
	switch state {
	case agent.LifecycleStateReady:
		return ProviderLifecycleReady, nil
	case agent.LifecycleStateRestarting:
		return ProviderLifecycleRestarting, nil
	case agent.LifecycleStateUnavailable:
		return ProviderLifecycleUnavailable, nil
	case agent.LifecycleStateClosed:
		return ProviderLifecycleClosed, nil
	default:
		return "", fmt.Errorf("unsupported provider lifecycle state %q", state)
	}
}

func conversationProviderLifecycleReason(reason agent.LifecycleReason) (ProviderLifecycleReason, error) {
	switch reason {
	case agent.LifecycleReasonSessionFailed:
		return ProviderLifecycleReasonSessionFailed, nil
	case agent.LifecycleReasonTurnRetrying:
		return ProviderLifecycleReasonTurnRetrying, nil
	case agent.LifecycleReasonTurnFailed:
		return ProviderLifecycleReasonTurnFailed, nil
	case agent.LifecycleReasonThreadIdle:
		return ProviderLifecycleReasonThreadIdle, nil
	case agent.LifecycleReasonThreadActive:
		return ProviderLifecycleReasonThreadActive, nil
	case agent.LifecycleReasonThreadNotLoaded:
		return ProviderLifecycleReasonThreadNotLoaded, nil
	case agent.LifecycleReasonThreadSystemError:
		return ProviderLifecycleReasonThreadSystemError, nil
	case agent.LifecycleReasonThreadClosed:
		return ProviderLifecycleReasonThreadClosed, nil
	case agent.LifecycleReasonEnvironmentConnected:
		return ProviderLifecycleReasonEnvironmentConnected, nil
	case agent.LifecycleReasonEnvironmentDisconnected:
		return ProviderLifecycleReasonEnvironmentDisconnected, nil
	default:
		return "", fmt.Errorf("unsupported provider lifecycle reason %q", reason)
	}
}

func conversationValidation(validation *agent.ValidationEvent) (TrajectoryValidation, error) {
	if validation == nil {
		return TrajectoryValidation{}, fmt.Errorf("agent validation payload is required")
	}
	kind, err := conversationValidationKind(validation.Kind)
	if err != nil {
		return TrajectoryValidation{}, err
	}
	status, err := conversationValidationStatus(validation.Status)
	if err != nil {
		return TrajectoryValidation{}, err
	}
	risk, err := conversationValidationRisk(validation.Risk)
	if err != nil {
		return TrajectoryValidation{}, err
	}
	result := TrajectoryValidation{
		ID:      validation.ID,
		Kind:    kind,
		Status:  status,
		Risk:    risk,
		Subject: cloneStringPointer(validation.Subject),
		Summary: validation.Summary,
	}
	return result, result.Validate()
}

func conversationValidationRisk(risk *agent.ValidationRisk) (*TrajectoryValidationRisk, error) {
	if risk == nil {
		return nil, nil
	}
	var result TrajectoryValidationRisk
	switch *risk {
	case agent.ValidationRiskLow:
		result = TrajectoryValidationRiskLow
	case agent.ValidationRiskMedium:
		result = TrajectoryValidationRiskMedium
	case agent.ValidationRiskHigh:
		result = TrajectoryValidationRiskHigh
	case agent.ValidationRiskCritical:
		result = TrajectoryValidationRiskCritical
	default:
		return nil, fmt.Errorf("unsupported agent validation risk %q", *risk)
	}
	return &result, nil
}

func conversationValidationKind(kind agent.ValidationKind) (TrajectoryValidationKind, error) {
	switch kind {
	case agent.ValidationKindGuardianReview:
		return TrajectoryValidationGuardianReview, nil
	case agent.ValidationKindModelVerification:
		return TrajectoryValidationModelVerification, nil
	default:
		return "", fmt.Errorf("unsupported agent validation kind %q", kind)
	}
}

func conversationValidationStatus(status agent.ValidationStatus) (TrajectoryValidationStatus, error) {
	switch status {
	case agent.ValidationStatusInProgress:
		return TrajectoryValidationStatusInProgress, nil
	case agent.ValidationStatusPassed:
		return TrajectoryValidationStatusPassed, nil
	case agent.ValidationStatusFailed:
		return TrajectoryValidationStatusFailed, nil
	case agent.ValidationStatusInconclusive:
		return TrajectoryValidationStatusInconclusive, nil
	default:
		return "", fmt.Errorf("unsupported agent validation status %q", status)
	}
}
