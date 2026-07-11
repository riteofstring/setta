package narration

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"setta/internal/conversation"
	"setta/internal/workspace"
)

func (actor *actor) handleProjection(ctx context.Context, work actorWork, generation int64) error {
	profile, err := actor.roleProfile(ctx)
	if err != nil {
		return err
	}
	materialized, err := actor.service.contexts.Projection(ctx, actor.conversationID, work.trigger, profile)
	if errors.Is(err, ErrNoUnobservedTrajectory) {
		return nil
	}
	if err != nil {
		return actor.failNarrator(ctx, work, generation, err)
	}
	terminal := work.kind == workTerminal && !materialized.HasMore
	prompt, schema, err := projectionPrompt(materialized.Context, terminal)
	if err != nil {
		return err
	}
	callID, err := actor.service.newID("narrator_call")
	if err != nil {
		return err
	}
	workspaceSummary, err := actor.workspace(ctx)
	if err != nil {
		return actor.failNarrator(ctx, work, generation, err)
	}
	startedAt := actor.service.timestamp()
	if err := actor.service.markRunning(ctx, actor.conversationID, startedAt); err != nil {
		return err
	}
	result, err := actor.service.caller.Call(ctx, ModelCallRequest{
		CallID: callID, ConversationID: actor.conversationID,
		WorkspaceRoot: workspaceSummary.RootPath, Profile: profile,
		Kind: projectionCallKind(terminal), Prompt: prompt, OutputSchema: schema,
	})
	endedAt := actor.service.timestampAfter(startedAt)
	record := projectionInvocationRecord(materialized, work, profile, result, generation, terminal)
	if err != nil {
		record.Outcome = "failed"
		record.DiagnosticReference = callID
		actor.service.record(record)
		return actor.failNarrator(ctx, work, generation, err)
	}
	if !actor.generationCurrent(generation) {
		record.Outcome = "stale"
		actor.service.record(record)
		return context.Canceled
	}
	invocation := domainNarratorInvocation(callID, profile, result, startedAt, endedAt, len(prompt), len(result.Text))
	if terminal {
		output, err := decodeTerminalOutput(result.Text, materialized.Context)
		if err != nil {
			record.Outcome = "validation_failed"
			actor.service.record(record)
			return actor.failNarrator(ctx, work, generation, err)
		}
		err = actor.service.commitTerminalProjection(ctx, materialized, output, invocation)
	} else {
		output, err := decodeWorkingOutput(result.Text, materialized.Context)
		if err != nil {
			record.Outcome = "validation_failed"
			actor.service.record(record)
			return actor.failNarrator(ctx, work, generation, err)
		}
		err = actor.service.commitWorkingProjection(ctx, materialized, output, invocation)
	}
	if err != nil {
		record.Outcome = "commit_failed"
		actor.service.record(record)
		return err
	}
	record.Outcome = "committed"
	actor.service.record(record)
	if materialized.HasMore {
		actor.enqueue(work)
	} else {
		actor.maybeEnqueueCheckpoint(ctx)
	}
	return nil
}

func (actor *actor) handleStatus(ctx context.Context, work actorWork, generation int64) (conversation.NarrationEvent, error) {
	profile, err := actor.roleProfile(ctx)
	if err != nil {
		return conversation.NarrationEvent{}, err
	}
	statusContext, err := actor.service.contexts.Status(ctx, actor.conversationID, work.question)
	if err != nil {
		return conversation.NarrationEvent{}, err
	}
	prompt, schema, err := statusPrompt(statusContext)
	if err != nil {
		return conversation.NarrationEvent{}, err
	}
	callID, err := actor.service.newID("narrator_status_call")
	if err != nil {
		return conversation.NarrationEvent{}, err
	}
	workspaceSummary, err := actor.workspace(ctx)
	if err != nil {
		return conversation.NarrationEvent{}, err
	}
	startedAt := actor.service.timestamp()
	if err := actor.service.markRunning(ctx, actor.conversationID, startedAt); err != nil {
		return conversation.NarrationEvent{}, err
	}
	result, err := actor.service.caller.Call(ctx, ModelCallRequest{
		CallID: callID, ConversationID: actor.conversationID, WorkspaceRoot: workspaceSummary.RootPath,
		Profile: profile, Kind: CallKindStatus, Prompt: prompt, OutputSchema: schema,
	})
	endedAt := actor.service.timestampAfter(startedAt)
	if err != nil {
		_ = actor.failNarrator(ctx, work, generation, err)
		return conversation.NarrationEvent{}, err
	}
	if !actor.generationCurrent(generation) {
		return conversation.NarrationEvent{}, context.Canceled
	}
	output, err := decodeStatusOutput(result.Text, statusContext)
	if err != nil {
		_ = actor.failNarrator(ctx, work, generation, err)
		return conversation.NarrationEvent{}, err
	}
	invocation := domainNarratorInvocation(callID, profile, result, startedAt, endedAt, len(prompt), len(result.Text))
	event, err := actor.service.commitStatusReply(ctx, statusContext, output, invocation)
	actor.service.record(InvocationRecord{
		ConversationID: actor.conversationID, CallKind: CallKindStatus,
		Trigger: work.trigger, ContextRange: ContextRange{Start: statusContext.SourceThroughSequence, End: statusContext.SourceThroughSequence},
		RequestedModel: requestedModel(profile), ResolvedModel: result.ResolvedInvocation.Model,
		Generation: generation, Outcome: outcomeString(err), DiagnosticReference: callID,
	})
	return event, err
}

func (actor *actor) handleCheckpoint(ctx context.Context, generation int64) error {
	record, err := actor.service.store.ReadConversation(ctx, actor.conversationID)
	if err != nil {
		return err
	}
	snapshot, err := actor.service.store.ReadSnapshot(ctx, record.WorkspaceID, actor.conversationID)
	if err != nil {
		return err
	}
	state := snapshot.NarratorState
	if state.ObservedThroughSequence-state.CheckpointThroughSequence < actor.service.checkpointEvents {
		return nil
	}
	events, _, err := actor.service.store.ReadTrajectoryRange(ctx, actor.conversationID, state.CheckpointThroughSequence, actor.service.checkpointEvents)
	if err != nil {
		return err
	}
	events = observedEvents(events, state.ObservedThroughSequence)
	if len(events) == 0 {
		return nil
	}
	end := events[len(events)-1].Sequence
	prompt, schema, err := checkpointPrompt(state.CheckpointText, events[0].Sequence, end, events, snapshot.CurrentProjection.CurrentObjective)
	if err != nil {
		return err
	}
	profile, err := actor.roleProfile(ctx)
	if err != nil {
		return err
	}
	callID, err := actor.service.newID("narrator_checkpoint_call")
	if err != nil {
		return err
	}
	workspaceSummary, err := actor.workspace(ctx)
	if err != nil {
		return err
	}
	startedAt := actor.service.timestamp()
	if err := actor.service.markRunning(ctx, actor.conversationID, startedAt); err != nil {
		return err
	}
	result, err := actor.service.caller.Call(ctx, ModelCallRequest{
		CallID: callID, ConversationID: actor.conversationID, WorkspaceRoot: workspaceSummary.RootPath,
		Profile: profile, Kind: CallKindCheckpoint, Prompt: prompt, OutputSchema: schema,
	})
	if err != nil {
		return err
	}
	if !actor.generationCurrent(generation) {
		actor.service.record(InvocationRecord{ConversationID: actor.conversationID, CallKind: CallKindCheckpoint, Generation: generation, Outcome: "stale", DiagnosticReference: callID})
		return context.Canceled
	}
	output, err := decodeCheckpointOutput(result.Text, end)
	if err != nil {
		return err
	}
	err = actor.service.commitCheckpoint(ctx, snapshot, output)
	actor.service.record(InvocationRecord{
		ConversationID: actor.conversationID, CallKind: CallKindCheckpoint,
		Trigger:          conversation.NarrationTriggerCheckpointWindowExceeded,
		ContextRange:     ContextRange{Start: events[0].Sequence, End: end},
		CheckpointBefore: state.CheckpointThroughSequence, ObservedBefore: state.ObservedThroughSequence,
		RequestedModel: requestedModel(profile), ResolvedModel: result.ResolvedInvocation.Model,
		Generation: generation, Outcome: outcomeString(err), DiagnosticReference: callID,
	})
	return err
}

func (actor *actor) failNarrator(ctx context.Context, work actorWork, generation int64, failure error) error {
	if errors.Is(failure, context.Canceled) && !actor.generationCurrent(generation) {
		return failure
	}
	if err := actor.service.commitDegradation(ctx, actor.conversationID, failure); err != nil {
		return errors.Join(failure, err)
	}
	if work.retryCount == 0 && work.kind != workStatus {
		time.AfterFunc(time.Second, func() {
			work.kind = workRetry
			work.retryCount = 1
			actor.enqueue(work)
		})
	}
	return failure
}

func (actor *actor) maybeEnqueueCheckpoint(ctx context.Context) {
	record, err := actor.service.store.ReadConversation(ctx, actor.conversationID)
	if err != nil {
		return
	}
	snapshot, err := actor.service.store.ReadSnapshot(ctx, record.WorkspaceID, actor.conversationID)
	if err == nil && snapshot.NarratorState.ObservedThroughSequence-snapshot.NarratorState.CheckpointThroughSequence >= actor.service.checkpointEvents {
		actor.enqueue(actorWork{kind: workCheckpoint, trigger: conversation.NarrationTriggerCheckpointWindowExceeded})
	}
}

func (actor *actor) workspace(ctx context.Context) (workspace.WorkspaceSummary, error) {
	record, err := actor.service.store.ReadConversation(ctx, actor.conversationID)
	if err != nil {
		return workspace.WorkspaceSummary{}, err
	}
	return actor.service.workspaceResolver.ResolveWorkspace(record.WorkspaceID)
}

func (actor *actor) roleProfile(ctx context.Context) (conversation.RoleProfile, error) {
	record, err := actor.service.store.ReadConversation(ctx, actor.conversationID)
	if err != nil {
		return conversation.RoleProfile{}, err
	}
	return actor.service.store.ResolveRoleProfile(ctx, conversation.RoleNarrator, record.WorkspaceID, record.ID)
}

func projectionCallKind(terminal bool) CallKind {
	if terminal {
		return CallKindTerminal
	}
	return CallKindWorking
}

func observedEvents(events []conversation.TrajectoryEvent, observedThrough int) []conversation.TrajectoryEvent {
	result := make([]conversation.TrajectoryEvent, 0, len(events))
	for _, event := range events {
		if event.Sequence > observedThrough {
			break
		}
		result = append(result, event)
	}
	return result
}

func projectionInvocationRecord(materialized ProjectionMaterialization, work actorWork, profile conversation.RoleProfile, result ModelCallResult, generation int64, terminal bool) InvocationRecord {
	return InvocationRecord{
		ConversationID: materialized.Context.ConversationID, TurnID: materialized.TurnID,
		CallKind: projectionCallKind(terminal), Trigger: work.trigger,
		ContextRange:           materialized.Context.IncludedRange,
		CheckpointBefore:       materialized.Context.CheckpointThroughSequence,
		ObservedBefore:         materialized.Context.ObservedThroughSequence,
		PreviousMilestoneCount: len(materialized.Context.PriorMilestones),
		PreviousSummaryCount:   len(materialized.Context.RecentFinalSummaries),
		RequestedModel:         requestedModel(profile), ResolvedModel: result.ResolvedInvocation.Model,
		Generation: generation,
	}
}

func requestedModel(profile conversation.RoleProfile) string {
	if profile.ModelSelection.ModelID == nil {
		return "provider_default"
	}
	return *profile.ModelSelection.ModelID
}

func outcomeString(err error) string {
	if err != nil {
		return "failed"
	}
	return "committed"
}

func (service *Service) timestamp() string {
	return service.now().UTC().Format(time.RFC3339Nano)
}

func (service *Service) timestampAfter(previous string) string {
	candidate := service.timestamp()
	previousTime, err := time.Parse(time.RFC3339Nano, previous)
	if err != nil {
		return candidate
	}
	candidateTime, err := time.Parse(time.RFC3339Nano, candidate)
	if err != nil || !candidateTime.After(previousTime) {
		return previousTime.Add(time.Nanosecond).Format(time.RFC3339Nano)
	}
	return candidate
}

func domainNarratorInvocation(id string, profile conversation.RoleProfile, result ModelCallResult, startedAt string, endedAt string, inputBytes int, outputBytes int) conversation.ResolvedInvocation {
	return conversation.ResolvedInvocation{
		ID: id, Role: conversation.RoleNarrator, Provider: conversation.ProviderCodex,
		Requested: profile,
		Resolved: conversation.ResolvedInvocationSettings{
			ModelID:           result.ResolvedInvocation.Model,
			ReasoningEffort:   result.ResolvedInvocation.ReasoningEffort,
			ServiceTier:       cloneString(result.ResolvedInvocation.ServiceTier),
			PermissionProfile: profile.PermissionProfile,
		},
		ContextUsage: conversation.InvocationContextUsage{
			InputBytes: inputBytes, EstimatedInputTokens: inputBytes / 4,
			OutputBytes: outputBytes, EstimatedOutputTokens: outputBytes / 4,
		},
		ProviderReferences: conversation.InvocationProviderReferences{
			ThreadID: stringPointer(result.ProviderThreadID), TurnID: stringPointer(result.ProviderTurnID),
		},
		ModelReroutes: []conversation.InvocationModelReroute{},
		StartedAt:     startedAt, EndedAt: &endedAt, Outcome: conversation.InvocationOutcomeSucceeded,
	}
}

func stringPointer(value string) *string {
	if value == "" {
		return nil
	}
	return &value
}

func encodeContext(value any) int {
	encoded, _ := json.Marshal(value)
	return len(encoded)
}
