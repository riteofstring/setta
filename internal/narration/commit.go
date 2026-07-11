package narration

import (
	"context"
	"errors"
	"strings"

	"setta/internal/conversation"
)

func (service *Service) commitWorkingProjection(ctx context.Context, materialized ProjectionMaterialization, output WorkingOutput, invocation conversation.ResolvedInvocation) error {
	return service.commitProjection(ctx, materialized, output.CurrentFocus, output.Milestones, "", output.TopicDescriptor, invocation)
}

func (service *Service) commitTerminalProjection(ctx context.Context, materialized ProjectionMaterialization, output TerminalOutput, invocation conversation.ResolvedInvocation) error {
	return service.commitProjection(ctx, materialized, output.CurrentFocus, output.Milestones, output.FinalSummary, output.TopicDescriptor, invocation)
}

func (service *Service) commitProjection(ctx context.Context, materialized ProjectionMaterialization, focus string, milestones []string, finalSummary string, descriptor *string, invocation conversation.ResolvedInvocation) error {
	record, err := service.store.ReadConversation(ctx, materialized.Context.ConversationID)
	if err != nil {
		return err
	}
	snapshot, err := service.store.ReadSnapshot(ctx, record.WorkspaceID, record.ID)
	if err != nil {
		return err
	}
	state := snapshot.NarratorState
	if state.ObservedThroughSequence != materialized.Context.ObservedThroughSequence || state.CheckpointThroughSequence != materialized.Context.CheckpointThroughSequence {
		return errors.New("narrator projection cursor changed before commit")
	}
	nextState := state
	nextState.ObservedThroughSequence = materialized.Context.IncludedRange.End
	nextState.CurrentFocus = focus
	nextState.CurrentFocusRevision++
	nextState.Status = conversation.NarratorStatusReady
	nextState.Degradation = nil
	nextState.LastInvocationAt = cloneString(invocation.EndedAt)
	nextState.UpdatedAt = service.timestampAfter(state.UpdatedAt)
	if descriptor != nil {
		nextState.TopicDescriptor = *descriptor
	}
	drafts, err := service.projectionNarrationDrafts(materialized, milestones, finalSummary, descriptor, invocation, nextState.UpdatedAt)
	if err != nil {
		return err
	}
	_, err = service.store.Transact(ctx, "commit narrator projection", func(transaction *conversation.WriteTransaction) error {
		if err := transaction.UpdateNarratorState(narratorExpectation(state), nextState); err != nil {
			return err
		}
		updatedConversation := snapshot.Conversation
		if descriptor != nil {
			updatedConversation.TopicDescriptor = *descriptor
			updatedConversation.UpdatedAt = service.timestampAfter(updatedConversation.UpdatedAt)
			if err := transaction.UpdateConversation(conversation.ConversationExpectation{UpdatedAt: snapshot.Conversation.UpdatedAt, LastTrajectorySequence: snapshot.Conversation.LastTrajectorySequence}, updatedConversation); err != nil {
				return err
			}
		}
		if descriptor != nil || finalSummary != "" {
			if err := transaction.UpdateTopicIndexNarration(snapshot.Conversation.ID, descriptor, finalSummary, nextState.UpdatedAt); err != nil {
				return err
			}
		}
		if err := service.appendNarratorStateOutbox(transaction, snapshot.Conversation, nextState); err != nil {
			return err
		}
		for _, draft := range drafts {
			created, err := transaction.AppendNarrationEvent(draft)
			if err != nil {
				return err
			}
			if err := service.appendNarrationOutbox(transaction, snapshot.Conversation, created); err != nil {
				return err
			}
		}
		if descriptor != nil {
			return service.appendRawOutbox(transaction, updatedConversation, conversation.ConversationEventTypeConversationUpdated, conversation.ConversationUpdatedEventPayload{Type: conversation.ConversationEventTypeConversationUpdated, Conversation: updatedConversation})
		}
		return nil
	})
	return err
}

func (service *Service) projectionNarrationDrafts(materialized ProjectionMaterialization, milestones []string, finalSummary string, descriptor *string, invocation conversation.ResolvedInvocation, createdAt string) ([]conversation.NarrationEvent, error) {
	drafts := make([]conversation.NarrationEvent, 0, len(milestones)+2)
	for _, text := range milestones {
		if materialized.TurnID == nil {
			return nil, errors.New("narrator milestone requires an active turn")
		}
		draft, err := service.narrationDraft(materialized, conversation.NarrationEventKindMilestone, invocation, createdAt)
		if err != nil {
			return nil, err
		}
		draft.Milestone = &conversation.NarrationMilestone{Text: text}
		drafts = append(drafts, draft)
	}
	if finalSummary != "" {
		if materialized.TurnID == nil {
			return nil, errors.New("narrator final summary requires an active turn")
		}
		draft, err := service.narrationDraft(materialized, conversation.NarrationEventKindFinalSummary, invocation, createdAt)
		if err != nil {
			return nil, err
		}
		draft.FinalSummary = &conversation.NarrationFinalSummary{Text: finalSummary}
		drafts = append(drafts, draft)
	}
	if descriptor != nil {
		if materialized.TurnID == nil {
			return nil, errors.New("narrator topic descriptor requires an active turn")
		}
		draft, err := service.narrationDraft(materialized, conversation.NarrationEventKindTopicDescriptor, invocation, createdAt)
		if err != nil {
			return nil, err
		}
		draft.TopicDescriptor = &conversation.NarrationTopicDescriptor{Text: *descriptor}
		drafts = append(drafts, draft)
	}
	return drafts, nil
}

func (service *Service) narrationDraft(materialized ProjectionMaterialization, kind conversation.NarrationEventKind, invocation conversation.ResolvedInvocation, createdAt string) (conversation.NarrationEvent, error) {
	id, err := service.newID("narration_event")
	if err != nil {
		return conversation.NarrationEvent{}, err
	}
	return conversation.NarrationEvent{
		ID: id, ConversationID: materialized.Context.ConversationID,
		TurnID: cloneString(materialized.TurnID), Kind: kind,
		SourceSequenceStart: materialized.Context.IncludedRange.Start,
		SourceSequenceEnd:   materialized.Context.IncludedRange.End,
		Trigger:             materialized.Context.Trigger, ResolvedInvocation: invocation,
		CreatedAt: createdAt,
	}, nil
}

func (service *Service) commitStatusReply(ctx context.Context, statusContext StatusContext, output StatusOutput, invocation conversation.ResolvedInvocation) (conversation.NarrationEvent, error) {
	record, err := service.store.ReadConversation(ctx, statusContext.ConversationID)
	if err != nil {
		return conversation.NarrationEvent{}, err
	}
	snapshot, err := service.store.ReadSnapshot(ctx, record.WorkspaceID, record.ID)
	if err != nil {
		return conversation.NarrationEvent{}, err
	}
	id, err := service.newID("narration_status_reply")
	if err != nil {
		return conversation.NarrationEvent{}, err
	}
	event := conversation.NarrationEvent{
		ID: id, ConversationID: record.ID, TurnID: runningTurnID(snapshot),
		Kind:                conversation.NarrationEventKindStatusReply,
		SourceSequenceStart: output.SourceThroughSequence, SourceSequenceEnd: output.SourceThroughSequence,
		Trigger:            conversation.NarrationTriggerExplicitStatusRequested,
		ResolvedInvocation: invocation, CreatedAt: service.timestamp(),
		StatusReply: &conversation.NarrationStatusReply{Question: statusContext.Question, Text: output.StatusReply},
	}
	var created conversation.NarrationEvent
	_, err = service.store.Transact(ctx, "commit narrator status reply", func(transaction *conversation.WriteTransaction) error {
		nextState := snapshot.NarratorState
		nextState.Status = conversation.NarratorStatusReady
		nextState.Degradation = nil
		nextState.LastInvocationAt = cloneString(invocation.EndedAt)
		nextState.UpdatedAt = service.timestampAfter(snapshot.NarratorState.UpdatedAt)
		if err := transaction.UpdateNarratorState(narratorExpectation(snapshot.NarratorState), nextState); err != nil {
			return err
		}
		if err := service.appendNarratorStateOutbox(transaction, snapshot.Conversation, nextState); err != nil {
			return err
		}
		var appendErr error
		created, appendErr = transaction.AppendNarrationEvent(event)
		if appendErr != nil {
			return appendErr
		}
		return service.appendNarrationOutbox(transaction, snapshot.Conversation, created)
	})
	return created, err
}

func (service *Service) commitCheckpoint(ctx context.Context, snapshot conversation.ConversationSnapshot, output CheckpointOutput) error {
	state := snapshot.NarratorState
	if output.CoveredThroughSequence > state.ObservedThroughSequence {
		return errors.New("checkpoint cannot cross the observed narrator cursor")
	}
	next := state
	next.CheckpointThroughSequence = output.CoveredThroughSequence
	next.CheckpointText = output.HistoricalSummary
	next.Status = conversation.NarratorStatusReady
	next.Degradation = nil
	next.UpdatedAt = service.timestampAfter(state.UpdatedAt)
	_, err := service.store.Transact(ctx, "commit narrator checkpoint", func(transaction *conversation.WriteTransaction) error {
		if err := transaction.UpdateNarratorState(narratorExpectation(state), next); err != nil {
			return err
		}
		return service.appendNarratorStateOutbox(transaction, snapshot.Conversation, next)
	})
	return err
}

func (service *Service) markRunning(ctx context.Context, conversationID string, startedAt string) error {
	record, err := service.store.ReadConversation(ctx, conversationID)
	if err != nil {
		return err
	}
	snapshot, err := service.store.ReadSnapshot(ctx, record.WorkspaceID, conversationID)
	if err != nil {
		return err
	}
	state := snapshot.NarratorState
	next := state
	next.Status = conversation.NarratorStatusRunning
	next.Degradation = nil
	next.LastInvocationAt = &startedAt
	next.UpdatedAt = service.timestampAfter(state.UpdatedAt)
	_, err = service.store.Transact(ctx, "mark narrator running", func(transaction *conversation.WriteTransaction) error {
		if err := transaction.UpdateNarratorState(narratorExpectation(state), next); err != nil {
			return err
		}
		return service.appendNarratorStateOutbox(transaction, snapshot.Conversation, next)
	})
	return err
}

func (service *Service) commitDegradation(ctx context.Context, conversationID string, failure error) error {
	record, err := service.store.ReadConversation(ctx, conversationID)
	if err != nil {
		return err
	}
	snapshot, err := service.store.ReadSnapshot(ctx, record.WorkspaceID, conversationID)
	if err != nil {
		return err
	}
	diagnosticID, err := service.newID("narrator_diagnostic")
	if err != nil {
		return err
	}
	state := snapshot.NarratorState
	next := state
	next.Status = conversation.NarratorStatusDegraded
	next.Degradation = &conversation.NarratorDegradation{
		Code: "narrator_call_failed", Message: strings.TrimSpace(failure.Error()), Retryable: true,
		DiagnosticReference: diagnosticID, DegradedAt: service.timestamp(),
	}
	next.UpdatedAt = service.timestampAfter(state.UpdatedAt)
	_, err = service.store.Transact(ctx, "persist narrator degradation", func(transaction *conversation.WriteTransaction) error {
		if err := transaction.UpdateNarratorState(narratorExpectation(state), next); err != nil {
			return err
		}
		return service.appendNarratorStateOutbox(transaction, snapshot.Conversation, next)
	})
	return err
}

func (service *Service) appendNarratorStateOutbox(transaction *conversation.WriteTransaction, owner conversation.TopicConversation, state conversation.NarratorState) error {
	return service.appendRawOutbox(transaction, owner, conversation.ConversationEventTypeNarratorStateUpdated, conversation.ConversationNarratorStateUpdatedEventPayload{Type: conversation.ConversationEventTypeNarratorStateUpdated, State: state})
}

func (service *Service) appendNarrationOutbox(transaction *conversation.WriteTransaction, owner conversation.TopicConversation, event conversation.NarrationEvent) error {
	return service.appendRawOutbox(transaction, owner, conversation.ConversationEventTypeNarrationCreated, conversation.ConversationNarrationCreatedEventPayload{Type: conversation.ConversationEventTypeNarrationCreated, Event: event})
}

func (service *Service) appendRawOutbox(transaction *conversation.WriteTransaction, owner conversation.TopicConversation, kind conversation.ConversationEventType, payload any) error {
	id, err := service.newID("conversation_event")
	if err != nil {
		return err
	}
	streamID, err := conversation.ConversationStreamID(owner.ID)
	if err != nil {
		return err
	}
	_, err = transaction.AppendCommittedEvent(conversation.CommittedEventDraft{
		ID: id, StreamID: streamID, Kind: string(kind), Payload: payload,
		CommittedAt: service.timestamp(),
	})
	return err
}

func narratorExpectation(state conversation.NarratorState) conversation.NarratorStateExpectation {
	return conversation.NarratorStateExpectation{
		ObservedThroughSequence:   state.ObservedThroughSequence,
		CheckpointThroughSequence: state.CheckpointThroughSequence,
		CurrentFocusRevision:      state.CurrentFocusRevision, UpdatedAt: state.UpdatedAt,
	}
}

func runningTurnID(snapshot conversation.ConversationSnapshot) *string {
	for index := len(snapshot.Turns.Turns) - 1; index >= 0; index-- {
		if snapshot.Turns.Turns[index].Status == conversation.TurnStatusRunning {
			value := snapshot.Turns.Turns[index].ID
			return &value
		}
	}
	return nil
}
