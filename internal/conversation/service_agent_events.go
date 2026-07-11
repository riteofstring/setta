package conversation

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"

	"setta/internal/agent"
)

type conversationAgentSink struct {
	service *Service
}

func (sink *conversationAgentSink) HandleAgentEvent(event agent.Event) error {
	if sink == nil || sink.service == nil {
		return errors.New("conversation agent event sink is required")
	}
	service := sink.service
	actor := service.actor(event.ConversationID)
	actor.mu.Lock()
	defer actor.mu.Unlock()
	workspaceID, err := service.workspaceIDForConversation(context.Background(), event.ConversationID)
	if err != nil {
		return err
	}
	snapshot, err := service.ReadSnapshot(context.Background(), workspaceID, event.ConversationID)
	if err != nil {
		return err
	}
	turn := snapshotTurn(snapshot, event.TurnID)
	if turn == nil {
		return fmt.Errorf("agent event turn %s is not persisted", event.TurnID)
	}
	return service.persistAgentEvent(context.Background(), snapshot, *turn, event)
}

func (service *Service) workspaceIDForConversation(ctx context.Context, conversationID string) (string, error) {
	var workspaceID string
	err := service.store.read(ctx, "resolve topic conversation workspace", func(ctx context.Context, reader *sql.Conn) error {
		return reader.QueryRowContext(ctx, `SELECT workspace_id FROM conversations WHERE id = ?`, conversationID).Scan(&workspaceID)
	})
	return workspaceID, err
}

func (service *Service) persistAgentEvent(ctx context.Context, snapshot ConversationSnapshot, turn ConversationTurn, providerEvent agent.Event) error {
	handler := agentEventHandlers[providerEvent.Kind]
	if handler == nil {
		return fmt.Errorf("unsupported normalized agent event %q", providerEvent.Kind)
	}
	mutation, err := handler(service, snapshot, turn, providerEvent)
	if err != nil {
		return err
	}
	return service.persistAgentMutation(ctx, snapshot, mutation)
}

type agentEventMutation struct {
	trajectory         TrajectoryEvent
	turn               *ConversationTurn
	binding            *AgentThreadBinding
	conversationStatus ConversationStatus
	updateConversation bool
}

type agentEventHandler func(*Service, ConversationSnapshot, ConversationTurn, agent.Event) (agentEventMutation, error)

var agentEventHandlers = map[agent.EventKind]agentEventHandler{
	agent.EventKindTurnStarted:        startedAgentEvent,
	agent.EventKindAgentTextDelta:     textDeltaAgentEvent,
	agent.EventKindAgentTextCompleted: textCompletedAgentEvent,
	agent.EventKindReasoningSummary:   reasoningAgentEvent,
	agent.EventKindPlanChanged:        planAgentEvent,
	agent.EventKindActivityStarted:    activityStartedAgentEvent,
	agent.EventKindActivityUpdated:    activityUpdatedAgentEvent,
	agent.EventKindActivityCompleted:  activityCompletedAgentEvent,
	agent.EventKindApprovalRequested:  approvalAgentEvent,
	agent.EventKindModelRerouted:      rerouteAgentEvent,
	agent.EventKindTurnTerminal:       terminalAgentEvent,
	agent.EventKindLifecycleChanged:   lifecycleAgentEvent,
}

func startedAgentEvent(service *Service, snapshot ConversationSnapshot, turn ConversationTurn, event agent.Event) (agentEventMutation, error) {
	now := service.timestampAfterSnapshot(snapshot)
	resolved, err := service.resolvedInvocation(turn.ConversationID, turn.ID)
	if err != nil {
		return agentEventMutation{}, err
	}
	invocationID, err := service.newID("invocation")
	if err != nil {
		return agentEventMutation{}, err
	}
	domainInvocation := runningDomainInvocation(invocationID, now, turn.RequestedRoleProfile, resolved, snapshot.ThreadBinding)
	turn.Status = TurnStatusRunning
	turn.StartedAt = &now
	turn.ResolvedInvocation = &domainInvocation
	turn.ProviderTurnID = stringPointerValue(event.ProviderTurnID)
	turn.ResolvedInvocation.ProviderReferences.ThreadID = stringPointerValue(event.ProviderThreadID)
	turn.ResolvedInvocation.ProviderReferences.TurnID = stringPointerValue(event.ProviderTurnID)
	binding := *snapshot.ThreadBinding
	binding.LastTurnID = stringPointerValue(turn.ID)
	binding.LastResumedAt = &now
	trajectory := baseProviderTrajectory(snapshot, turn.ID, event, TrajectoryEventTurnStarted, TrajectoryActorAgent, now)
	trajectory.TurnStarted = &TrajectoryTurnStarted{Invocation: *turn.ResolvedInvocation}
	return agentEventMutation{trajectory: trajectory, turn: &turn, binding: &binding, conversationStatus: ConversationStatusWorking, updateConversation: true}, nil
}

func (service *Service) resolvedInvocation(conversationID string, turnID string) (agent.ResolvedInvocation, error) {
	actor := service.actor(conversationID)
	resolved, ok := actor.resolved[turnID]
	if !ok {
		return agent.ResolvedInvocation{}, fmt.Errorf("turn %s has no resolved agent invocation", turnID)
	}
	delete(actor.resolved, turnID)
	return resolved, nil
}

func textDeltaAgentEvent(service *Service, snapshot ConversationSnapshot, turn ConversationTurn, event agent.Event) (agentEventMutation, error) {
	if event.Text == nil {
		return agentEventMutation{}, errors.New("agent text delta payload is missing")
	}
	trajectory := baseProviderTrajectory(snapshot, turn.ID, event, TrajectoryEventAgentPublicTextDelta, TrajectoryActorAgent, service.timestampAfterSnapshot(snapshot))
	trajectory.AgentPublicTextDelta = &TrajectoryAgentPublicTextDelta{ProviderItemID: event.Text.ProviderItemID, Delta: event.Text.Text}
	return trajectoryOnlyMutation(trajectory), nil
}

func textCompletedAgentEvent(service *Service, snapshot ConversationSnapshot, turn ConversationTurn, event agent.Event) (agentEventMutation, error) {
	if event.Text == nil {
		return agentEventMutation{}, errors.New("agent completed text payload is missing")
	}
	trajectory := baseProviderTrajectory(snapshot, turn.ID, event, TrajectoryEventAgentMessageCompleted, TrajectoryActorAgent, service.timestampAfterSnapshot(snapshot))
	trajectory.AgentMessageCompleted = &TrajectoryAgentMessageCompleted{ProviderItemID: event.Text.ProviderItemID, Text: event.Text.Text}
	return trajectoryOnlyMutation(trajectory), nil
}

func reasoningAgentEvent(service *Service, snapshot ConversationSnapshot, turn ConversationTurn, event agent.Event) (agentEventMutation, error) {
	if event.Text == nil {
		return agentEventMutation{}, errors.New("agent reasoning payload is missing")
	}
	trajectory := baseProviderTrajectory(snapshot, turn.ID, event, TrajectoryEventPublicReasoningSummaryUpdated, TrajectoryActorAgent, service.timestampAfterSnapshot(snapshot))
	trajectory.PublicReasoningSummaryUpdated = &TrajectoryPublicReasoningSummaryUpdated{ProviderItemID: event.Text.ProviderItemID, Summary: []string{event.Text.Text}}
	return trajectoryOnlyMutation(trajectory), nil
}

func planAgentEvent(service *Service, snapshot ConversationSnapshot, turn ConversationTurn, event agent.Event) (agentEventMutation, error) {
	if event.Plan == nil {
		return agentEventMutation{}, errors.New("agent plan payload is missing")
	}
	steps := make([]PlanStep, 0, len(event.Plan.Steps))
	for _, step := range event.Plan.Steps {
		status, err := providerPlanStatus(step.Status)
		if err != nil {
			return agentEventMutation{}, err
		}
		steps = append(steps, PlanStep{Text: step.Step, Status: status})
	}
	trajectory := baseProviderTrajectory(snapshot, turn.ID, event, TrajectoryEventPlanChanged, TrajectoryActorAgent, service.timestampAfterSnapshot(snapshot))
	trajectory.PlanChanged = &TrajectoryPlanChanged{Explanation: cloneStringPointer(event.Plan.Explanation), Steps: steps}
	return trajectoryOnlyMutation(trajectory), nil
}

func activityStartedAgentEvent(service *Service, snapshot ConversationSnapshot, turn ConversationTurn, event agent.Event) (agentEventMutation, error) {
	if event.Activity == nil {
		return agentEventMutation{}, errors.New("agent activity payload is missing")
	}
	if event.Activity.Kind == agent.ActivityKindSubagent {
		return subagentMutation(service, snapshot, turn, event, TrajectoryEventSubagentStarted)
	}
	if event.Activity.Kind == agent.ActivityKindFileChange {
		return fileChangeMutation(service, snapshot, turn, event, false)
	}
	trajectory := baseProviderTrajectory(snapshot, turn.ID, event, TrajectoryEventActivityStarted, TrajectoryActorAgent, service.timestampAfterSnapshot(snapshot))
	trajectory.ActivityStarted = &TrajectoryActivityStarted{Activity: trajectoryActivity(*event.Activity)}
	return trajectoryOnlyMutation(trajectory), nil
}

func activityUpdatedAgentEvent(service *Service, snapshot ConversationSnapshot, turn ConversationTurn, event agent.Event) (agentEventMutation, error) {
	if event.Activity == nil {
		return agentEventMutation{}, errors.New("agent activity payload is missing")
	}
	if event.Activity.Kind == agent.ActivityKindSubagent {
		return subagentMutation(service, snapshot, turn, event, TrajectoryEventSubagentUpdated)
	}
	trajectory := baseProviderTrajectory(snapshot, turn.ID, event, TrajectoryEventActivityProgressed, TrajectoryActorAgent, service.timestampAfterSnapshot(snapshot))
	progress := event.Activity.Status
	if progress == "" {
		progress = event.Activity.Title
	}
	trajectory.ActivityProgressed = &TrajectoryActivityProgressed{ActivityID: event.Activity.ProviderItemID, Progress: progress}
	return trajectoryOnlyMutation(trajectory), nil
}

func activityCompletedAgentEvent(service *Service, snapshot ConversationSnapshot, turn ConversationTurn, event agent.Event) (agentEventMutation, error) {
	if event.Activity == nil {
		return agentEventMutation{}, errors.New("agent activity payload is missing")
	}
	if event.Activity.Kind == agent.ActivityKindSubagent {
		return subagentMutation(service, snapshot, turn, event, TrajectoryEventSubagentCompleted)
	}
	if event.Activity.Kind == agent.ActivityKindFileChange {
		return fileChangeMutation(service, snapshot, turn, event, true)
	}
	now := service.timestampAfterSnapshot(snapshot)
	activity := trajectoryActivity(*event.Activity)
	if event.Activity.Status == "failed" {
		trajectory := baseProviderTrajectory(snapshot, turn.ID, event, TrajectoryEventActivityFailed, TrajectoryActorAgent, now)
		trajectory.ActivityFailed = &TrajectoryActivityFailed{Activity: activity, Failure: providerFailure("activity_failed", event.Activity.Summary, event.Activity.ProviderItemID)}
		return trajectoryOnlyMutation(trajectory), nil
	}
	trajectory := baseProviderTrajectory(snapshot, turn.ID, event, TrajectoryEventActivityCompleted, TrajectoryActorAgent, now)
	summary := event.Activity.Summary
	if strings.TrimSpace(summary) == "" {
		summary = event.Activity.Title
	}
	trajectory.ActivityCompleted = &TrajectoryActivityCompleted{Activity: activity, Summary: summary, DurationMs: cloneIntPointer(event.Activity.DurationMs), ExitCode: cloneIntPointer(event.Activity.ExitCode)}
	return trajectoryOnlyMutation(trajectory), nil
}

func approvalAgentEvent(service *Service, snapshot ConversationSnapshot, turn ConversationTurn, event agent.Event) (agentEventMutation, error) {
	if event.Approval == nil {
		return agentEventMutation{}, errors.New("agent approval payload is missing")
	}
	now := service.timestampAfterSnapshot(snapshot)
	trajectory := baseProviderTrajectory(snapshot, turn.ID, event, TrajectoryEventApprovalRequested, TrajectoryActorProvider, now)
	approval, err := trajectoryApproval(*event.Approval, now)
	if err != nil {
		return agentEventMutation{}, err
	}
	trajectory.ApprovalRequested = &TrajectoryApprovalRequested{Approval: approval}
	return agentEventMutation{trajectory: trajectory, conversationStatus: ConversationStatusWaitingForApproval, updateConversation: true}, nil
}

func rerouteAgentEvent(service *Service, snapshot ConversationSnapshot, turn ConversationTurn, event agent.Event) (agentEventMutation, error) {
	if event.ModelReroute == nil {
		return agentEventMutation{}, errors.New("agent model reroute payload is missing")
	}
	reroute := InvocationModelReroute{FromModelID: event.ModelReroute.FromModel, ToModelID: event.ModelReroute.ToModel, Reason: event.ModelReroute.Reason}
	turn.ResolvedInvocation.ModelReroutes = append(turn.ResolvedInvocation.ModelReroutes, reroute)
	trajectory := baseProviderTrajectory(snapshot, turn.ID, event, TrajectoryEventModelRerouted, TrajectoryActorProvider, service.timestampAfterSnapshot(snapshot))
	trajectory.ModelRerouted = &TrajectoryModelRerouted{Reroute: reroute}
	return agentEventMutation{trajectory: trajectory, turn: &turn, conversationStatus: snapshot.Conversation.Status, updateConversation: true}, nil
}

func terminalAgentEvent(service *Service, snapshot ConversationSnapshot, turn ConversationTurn, event agent.Event) (agentEventMutation, error) {
	if event.Terminal == nil {
		return agentEventMutation{}, errors.New("agent terminal payload is missing")
	}
	result := agent.TurnResult{ProviderThreadID: event.ProviderThreadID, ProviderTurnID: event.ProviderTurnID, Outcome: event.Terminal.Outcome, Error: cloneStringPointer(event.Terminal.Error)}
	return terminalMutation(service, snapshot, turn, result)
}

func lifecycleAgentEvent(service *Service, snapshot ConversationSnapshot, turn ConversationTurn, event agent.Event) (agentEventMutation, error) {
	if event.Lifecycle == nil {
		return agentEventMutation{}, errors.New("agent lifecycle payload is missing")
	}
	status := ProviderLifecycleUnavailable
	if event.Lifecycle.State == "ready" {
		status = ProviderLifecycleReady
	}
	message := event.Lifecycle.Reason
	if event.Lifecycle.Error != nil {
		message = *event.Lifecycle.Error
	}
	trajectory := baseProviderTrajectory(snapshot, turn.ID, event, TrajectoryEventProviderLifecycleChanged, TrajectoryActorProvider, service.timestampAfterSnapshot(snapshot))
	trajectory.ProviderLifecycleChanged = &TrajectoryProviderLifecycleChanged{Lifecycle: ProviderLifecycle{Provider: ProviderCodex, Status: status, Message: message}}
	return trajectoryOnlyMutation(trajectory), nil
}

func trajectoryOnlyMutation(trajectory TrajectoryEvent) agentEventMutation {
	return agentEventMutation{trajectory: trajectory, updateConversation: true}
}

func subagentMutation(service *Service, snapshot ConversationSnapshot, turn ConversationTurn, event agent.Event, kind TrajectoryEventKind) (agentEventMutation, error) {
	activity := event.Activity
	status := SubagentStatusRunning
	if kind == TrajectoryEventSubagentCompleted {
		status = SubagentStatusCompleted
	}
	if activity.ProviderThreadID == "" {
		return agentEventMutation{}, errors.New("subagent activity has no provider thread id")
	}
	subagent := Subagent{ID: activity.ProviderItemID, ProviderThreadID: activity.ProviderThreadID, Status: status, Message: stringPointerValue(activity.Title)}
	trajectory := baseProviderTrajectory(snapshot, turn.ID, event, kind, TrajectoryActorAgent, service.timestampAfterSnapshot(snapshot))
	switch kind {
	case TrajectoryEventSubagentStarted:
		trajectory.SubagentStarted = &TrajectorySubagentStarted{Subagent: subagent}
	case TrajectoryEventSubagentUpdated:
		trajectory.SubagentUpdated = &TrajectorySubagentUpdated{Subagent: subagent}
	case TrajectoryEventSubagentCompleted:
		trajectory.SubagentCompleted = &TrajectorySubagentCompleted{Subagent: subagent}
	default:
		return agentEventMutation{}, fmt.Errorf("unsupported subagent trajectory kind %q", kind)
	}
	return trajectoryOnlyMutation(trajectory), nil
}

func fileChangeMutation(service *Service, snapshot ConversationSnapshot, turn ConversationTurn, event agent.Event, completed bool) (agentEventMutation, error) {
	changes, err := trajectoryFileChanges(event.Activity.FileChanges)
	if err != nil {
		return agentEventMutation{}, err
	}
	now := service.timestampAfterSnapshot(snapshot)
	if !completed {
		trajectory := baseProviderTrajectory(snapshot, turn.ID, event, TrajectoryEventFileChangeProposed, TrajectoryActorAgent, now)
		trajectory.FileChangeProposed = &TrajectoryFileChangeProposed{ProviderItemID: event.Activity.ProviderItemID, Changes: changes}
		return trajectoryOnlyMutation(trajectory), nil
	}
	outcome := FileChangeOutcomeCompleted
	var failure *Failure
	switch event.Activity.Status {
	case "completed":
	case "declined":
		outcome = FileChangeOutcomeDeclined
	case "failed":
		outcome = FileChangeOutcomeFailed
		value := providerFailure("file_change_failed", event.Activity.Summary, event.Activity.ProviderItemID)
		failure = &value
	default:
		return agentEventMutation{}, fmt.Errorf("unsupported completed file change status %q", event.Activity.Status)
	}
	trajectory := baseProviderTrajectory(snapshot, turn.ID, event, TrajectoryEventFileChangeCompleted, TrajectoryActorAgent, now)
	trajectory.FileChangeCompleted = &TrajectoryFileChangeCompleted{ProviderItemID: event.Activity.ProviderItemID, Changes: changes, Outcome: outcome, Failure: failure}
	return trajectoryOnlyMutation(trajectory), nil
}

func trajectoryFileChanges(changes []agent.ActivityFileChange) ([]FileChange, error) {
	result := make([]FileChange, 0, len(changes))
	for _, change := range changes {
		var kind FileChangeKind
		switch change.Kind {
		case "add":
			kind = FileChangeAdd
		case "delete":
			kind = FileChangeDelete
		case "update":
			kind = FileChangeUpdate
		default:
			return nil, fmt.Errorf("unsupported normalized file change kind %q", change.Kind)
		}
		result = append(result, FileChange{Path: change.Path, Kind: kind, MovePath: cloneStringPointer(change.MovePath), Diff: change.Diff})
	}
	if err := validateFileChanges(result); err != nil {
		return nil, err
	}
	return result, nil
}

func providerPlanStatus(status string) (PlanStepStatus, error) {
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

func trajectoryActivity(activity agent.ActivityEvent) TrajectoryActivity {
	kind := TrajectoryActivityHook
	switch activity.Kind {
	case agent.ActivityKindCommand:
		kind = TrajectoryActivityCommand
	case agent.ActivityKindMCPTool:
		kind = TrajectoryActivityMCPTool
	case agent.ActivityKindDynamicTool:
		kind = TrajectoryActivityDynamicTool
	case agent.ActivityKindWebSearch:
		kind = TrajectoryActivityWebSearch
	case agent.ActivityKindImageView:
		kind = TrajectoryActivityImageView
	case agent.ActivityKindImageGeneration:
		kind = TrajectoryActivityImageGeneration
	case agent.ActivityKindSleep:
		kind = TrajectoryActivitySleep
	case agent.ActivityKindHook:
		kind = TrajectoryActivityHook
	}
	result := TrajectoryActivity{ID: activity.ProviderItemID, Kind: kind, Title: activity.Title}
	if activity.Kind == agent.ActivityKindCommand {
		result.Command = stringPointerValue(activity.Command)
		result.CWD = stringPointerValue(activity.CWD)
		if activity.ProcessID != "" {
			result.ProcessID = stringPointerValue(activity.ProcessID)
		}
	}
	if activity.Kind == agent.ActivityKindMCPTool {
		result.Server = stringPointerValue(activity.Server)
		result.Tool = stringPointerValue(activity.Tool)
	}
	if activity.Kind == agent.ActivityKindDynamicTool {
		result.Tool = stringPointerValue(activity.Tool)
		if activity.Namespace != "" {
			result.Namespace = stringPointerValue(activity.Namespace)
		}
	}
	return result
}

func trajectoryApproval(approval agent.ApprovalRequest, requestedAt string) (TrajectoryApprovalRequest, error) {
	kind := TrajectoryApprovalKindStructuredInput
	switch approval.Kind {
	case agent.ApprovalKindCommand:
		kind = TrajectoryApprovalKindCommand
	case agent.ApprovalKindFileChange:
		kind = TrajectoryApprovalKindFileChange
	case agent.ApprovalKindPermission:
		kind = TrajectoryApprovalKindPermission
	case agent.ApprovalKindUserInput, agent.ApprovalKindMCPElicitation:
		kind = TrajectoryApprovalKindStructuredInput
	default:
		return TrajectoryApprovalRequest{}, fmt.Errorf("unsupported agent approval kind %q", approval.Kind)
	}
	questions := make([]TrajectoryApprovalQuestion, 0, len(approval.Questions))
	for _, question := range approval.Questions {
		questions = append(questions, TrajectoryApprovalQuestion{ID: question.ID, Header: question.Header, Question: question.Question, Options: append([]string{}, question.Options...)})
	}
	result := TrajectoryApprovalRequest{
		ID: approval.ID, ProviderItemID: approval.ProviderItemID, Kind: kind,
		Title: approval.Title, Body: approval.Body, FilePaths: []string{}, Questions: questions,
		RequestedAt: requestedAt,
	}
	if strings.TrimSpace(result.Body) == "" {
		result.Body = result.Title
	}
	if approval.Command != "" {
		result.Command = stringPointerValue(approval.Command)
	}
	if approval.Path != "" {
		result.CWD = stringPointerValue(approval.Path)
		if kind == TrajectoryApprovalKindFileChange {
			result.FilePaths = []string{approval.Path}
		}
	}
	if approval.RequestedPermissionProfile != "" {
		result.RequestedPermissionProfile = stringPointerValue(approval.RequestedPermissionProfile)
	}
	return result, result.Validate()
}

func baseProviderTrajectory(snapshot ConversationSnapshot, turnID string, providerEvent agent.Event, kind TrajectoryEventKind, actor TrajectoryActor, emittedAt string) TrajectoryEvent {
	event := TrajectoryEvent{
		ID:             trajectoryEventID(snapshot.Conversation.ID, snapshot.Conversation.LastTrajectorySequence+1),
		ConversationID: snapshot.Conversation.ID, TurnID: stringPointerValue(turnID),
		Sequence: snapshot.Conversation.LastTrajectorySequence + 1, EmittedAt: emittedAt,
		Kind: kind, Actor: actor, ProviderEventID: cloneStringPointer(providerEvent.ProviderEventID),
	}
	if providerEvent.ProviderThreadID != "" {
		event.ProviderThreadID = stringPointerValue(providerEvent.ProviderThreadID)
	}
	if providerEvent.ProviderTurnID != "" {
		event.ProviderTurnID = stringPointerValue(providerEvent.ProviderTurnID)
	}
	return event
}

func newTrajectoryEvent(_ *Service, snapshot ConversationSnapshot, turnID string, kind TrajectoryEventKind, actor TrajectoryActor) TrajectoryEvent {
	sequence := snapshot.Conversation.LastTrajectorySequence + 1
	return TrajectoryEvent{
		ID: trajectoryEventID(snapshot.Conversation.ID, sequence), ConversationID: snapshot.Conversation.ID,
		TurnID: stringPointerValue(turnID), Sequence: sequence, EmittedAt: snapshot.Conversation.UpdatedAt,
		Kind: kind, Actor: actor,
	}
}

func trajectoryEventID(conversationID string, sequence int) string {
	return fmt.Sprintf("trajectory_%s_%d", conversationID, sequence)
}

func (service *Service) timestampAfterSnapshot(snapshot ConversationSnapshot) string {
	return timestampAfter(snapshot.Conversation.UpdatedAt, service.timestamp())
}

func providerFailure(code string, message string, reference string) Failure {
	if strings.TrimSpace(message) == "" {
		message = "Provider activity failed"
	}
	if strings.TrimSpace(reference) == "" {
		reference = "provider_activity"
	}
	return Failure{Code: code, Message: message, Retryable: false, DiagnosticReference: reference}
}

func cloneIntPointer(value *int) *int {
	if value == nil {
		return nil
	}
	copy := *value
	return &copy
}

func (service *Service) persistAgentMutation(ctx context.Context, snapshot ConversationSnapshot, mutation agentEventMutation) error {
	conversation := snapshot.Conversation
	conversation.UpdatedAt = timestampAfter(conversation.UpdatedAt, mutation.trajectory.EmittedAt)
	if mutation.updateConversation && mutation.conversationStatus != "" {
		conversation.Status = mutation.conversationStatus
	}
	_, err := service.store.Transact(ctx, "apply normalized agent event", func(transaction *WriteTransaction) error {
		if err := transaction.UpdateConversation(ConversationExpectation{UpdatedAt: snapshot.Conversation.UpdatedAt, LastTrajectorySequence: snapshot.Conversation.LastTrajectorySequence}, conversation); err != nil {
			return err
		}
		if mutation.turn != nil {
			if err := transaction.UpdateTurn(snapshotTurnStatus(snapshot, mutation.turn.ID), *mutation.turn); err != nil {
				return err
			}
		}
		if mutation.binding != nil {
			if err := transaction.UpsertAgentThreadBinding(*mutation.binding); err != nil {
				return err
			}
		}
		if err := transaction.AppendTrajectoryEvent(mutation.trajectory); err != nil {
			return err
		}
		conversation.LastTrajectorySequence++
		if mutation.turn != nil {
			if err := service.appendCommittedPayload(transaction, conversation, ConversationTurnUpdatedEventPayload{Type: ConversationEventTypeTurnUpdated, Turn: *mutation.turn}); err != nil {
				return err
			}
		}
		if mutation.binding != nil {
			if err := service.appendCommittedPayload(transaction, conversation, ConversationThreadBindingUpdatedEventPayload{Type: ConversationEventTypeThreadBindingUpdated, Binding: *mutation.binding}); err != nil {
				return err
			}
		}
		if err := service.appendCommittedPayload(transaction, conversation, ConversationTrajectoryAppendedEventPayload{Type: ConversationEventTypeTrajectoryAppended, Event: mutation.trajectory}); err != nil {
			return err
		}
		return service.appendCommittedPayload(transaction, conversation, ConversationUpdatedEventPayload{Type: ConversationEventTypeConversationUpdated, Conversation: conversation})
	})
	if err != nil {
		return err
	}
	service.observeTrajectory(ctx, mutation.trajectory)
	return nil
}

func snapshotTurnStatus(snapshot ConversationSnapshot, turnID string) TurnStatus {
	turn := snapshotTurn(snapshot, turnID)
	if turn == nil {
		return ""
	}
	return turn.Status
}
