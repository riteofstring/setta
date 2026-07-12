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
		conversation.ConversationRouteDecisionSource,
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

type conversationRouteCommandExecutor struct {
	store         *conversation.Store
	conversations conversationRouteCommandService
	narrator      conversationRouteNarratorService
}

func newConversationRouteCommandExecutor(
	store *conversation.Store,
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
	if executor == nil || executor.store == nil || executor.conversations == nil || executor.narrator == nil {
		return errors.New("conversation route command executor is required")
	}
	if ctx == nil {
		return errors.New("conversation route command context is required")
	}
	if err := record.Validate(); err != nil {
		return fmt.Errorf("validate conversation route decision: %w", err)
	}
	workspaceID, err := executor.store.ReadConversationWorkspaceID(ctx, record.ConversationID)
	if err != nil {
		return err
	}
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
			record.Source,
			record.ResultingCommand,
		)
		return err
	}
}

var _ narration.ConversationRouteCommandExecutor = (*conversationRouteCommandExecutor)(nil)
