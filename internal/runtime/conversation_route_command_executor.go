package runtime

import (
	"context"
	"errors"
	"fmt"

	"setta/internal/conversation"
	"setta/internal/narration"
)

type conversationRouteCommandService interface {
	ExecuteRouteCommand(
		context.Context,
		string,
		string,
		string,
		conversation.ConversationRouteCommand,
	) (conversation.ConversationSnapshot, error)
}

type conversationRouteNarratorService interface {
	AskRoutedStatus(
		context.Context,
		string,
		string,
		string,
		string,
	) (conversation.ConversationSnapshot, error)
}

type conversationRouteCommandStore interface {
	ConversationRouteCommandApplied(
		context.Context,
		conversation.ConversationRouteDecisionRecord,
	) (bool, error)
	ReadConversationWorkspaceID(context.Context, string) (string, error)
	ReadSnapshot(context.Context, string, string) (conversation.ConversationSnapshot, error)
}

type conversationRouteCommandExecutor struct {
	store         conversationRouteCommandStore
	conversations conversationRouteCommandService
	narrator      conversationRouteNarratorService
}

func newConversationRouteCommandExecutor(
	store conversationRouteCommandStore,
	conversations conversationRouteCommandService,
	narrator conversationRouteNarratorService,
) (*conversationRouteCommandExecutor, error) {
	if store == nil || conversations == nil || narrator == nil {
		return nil, errors.New("conversation route executor requires store, conversation, and narrator services")
	}
	return &conversationRouteCommandExecutor{
		store:         store,
		conversations: conversations,
		narrator:      narrator,
	}, nil
}

func (executor *conversationRouteCommandExecutor) ExecuteConversationRouteCommand(
	ctx context.Context,
	record conversation.ConversationRouteDecisionRecord,
) error {
	if err := executor.validateExecution(ctx, record); err != nil {
		return err
	}
	applied, err := executor.store.ConversationRouteCommandApplied(ctx, record)
	if err != nil || applied {
		return err
	}
	workspaceID, err := executor.store.ReadConversationWorkspaceID(ctx, record.ConversationID)
	if err != nil {
		return err
	}
	executeErr := executor.executeConversationRouteCommand(ctx, workspaceID, record)
	return executor.verifyConversationRouteCommandEffect(ctx, workspaceID, record, executeErr)
}

func (executor *conversationRouteCommandExecutor) validateExecution(
	ctx context.Context,
	record conversation.ConversationRouteDecisionRecord,
) error {
	if executor == nil || executor.store == nil || executor.conversations == nil || executor.narrator == nil {
		return errors.New("conversation route command executor is required")
	}
	if ctx == nil {
		return errors.New("conversation route command context is required")
	}
	if err := record.Validate(); err != nil {
		return fmt.Errorf("validate conversation route decision: %w", err)
	}
	return nil
}

func (executor *conversationRouteCommandExecutor) executeConversationRouteCommand(
	ctx context.Context,
	workspaceID string,
	record conversation.ConversationRouteDecisionRecord,
) error {
	switch record.ResultingCommand.Kind {
	case conversation.ConversationRouteDecisionKindAnswerAsNarrator:
		command := record.ResultingCommand.AnswerAsNarrator
		_, err := executor.narrator.AskRoutedStatus(
			ctx,
			workspaceID,
			record.ConversationID,
			command.RequestID,
			command.Question,
		)
		return err
	case conversation.ConversationRouteDecisionKindEscalateToMaster,
		conversation.ConversationRouteDecisionKindClarify:
		return nil
	default:
		_, err := executor.conversations.ExecuteRouteCommand(
			ctx,
			workspaceID,
			record.ConversationID,
			record.ID,
			record.ResultingCommand,
		)
		return err
	}
}

func (executor *conversationRouteCommandExecutor) verifyConversationRouteCommandEffect(
	ctx context.Context,
	workspaceID string,
	record conversation.ConversationRouteDecisionRecord,
	executeErr error,
) error {
	applied, verifyErr := executor.store.ConversationRouteCommandApplied(ctx, record)
	if verifyErr != nil {
		verification := fmt.Errorf("verify conversation route command effect: %w", verifyErr)
		return errors.Join(executeErr, verification)
	}
	if applied {
		return nil
	}
	degradationApplied, degradationErr := executor.routedNarratorDegradationApplied(
		ctx,
		workspaceID,
		record,
		executeErr,
	)
	if degradationErr != nil {
		return errors.Join(executeErr, degradationErr)
	}
	if degradationApplied {
		return nil
	}
	if executeErr == nil {
		return fmt.Errorf("conversation route command %s completed without its durable effect", record.ID)
	}
	return executeErr
}

func (executor *conversationRouteCommandExecutor) routedNarratorDegradationApplied(
	ctx context.Context,
	workspaceID string,
	record conversation.ConversationRouteDecisionRecord,
	executeErr error,
) (bool, error) {
	if executeErr == nil || record.ResultingCommand.Kind != conversation.ConversationRouteDecisionKindAnswerAsNarrator {
		return false, nil
	}
	var degraded *narration.DegradedError
	if !errors.As(executeErr, &degraded) {
		return false, nil
	}
	requestID := record.ResultingCommand.AnswerAsNarrator.RequestID
	if degraded.RequestID != requestID {
		return false, fmt.Errorf(
			"verify routed narrator degradation: request %s does not match %s",
			degraded.RequestID,
			requestID,
		)
	}
	snapshot, err := executor.store.ReadSnapshot(ctx, workspaceID, record.ConversationID)
	if err != nil {
		return false, fmt.Errorf("verify routed narrator degradation: %w", err)
	}
	stored := snapshot.NarratorState.Degradation
	if snapshot.NarratorState.Status != conversation.NarratorStatusDegraded ||
		stored == nil || *stored != degraded.Degradation {
		return false, errors.New("verify routed narrator degradation: durable state does not match the completed request")
	}
	return true, nil
}

var _ narration.ConversationRouteCommandExecutor = (*conversationRouteCommandExecutor)(nil)
