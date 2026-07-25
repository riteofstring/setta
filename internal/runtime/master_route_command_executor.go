package runtime

import (
	"context"
	"errors"
	"fmt"

	"setta/internal/conversation"
	"setta/internal/master"
	"setta/internal/narration"
)

type masterRouteCommandStore interface {
	MasterRouteCommandApplied(context.Context, master.RouteDecisionRecord) (bool, error)
	ReadSnapshot(context.Context, string, string) (conversation.ConversationSnapshot, error)
}

type masterRouteConversationService interface {
	ExecuteMasterRouteCommand(
		context.Context,
		string,
		master.RouteCommand,
	) (conversation.ConversationSnapshot, error)
}

type masterRouteNarratorService interface {
	AskRoutedStatus(
		context.Context,
		string,
		string,
		string,
		string,
	) (conversation.ConversationSnapshot, error)
	NotifyConversationInput(string) error
}

type masterRouteCommandExecutor struct {
	store         masterRouteCommandStore
	conversations masterRouteConversationService
	narrator      masterRouteNarratorService
}

func newMasterRouteCommandExecutor(
	store masterRouteCommandStore,
	conversations masterRouteConversationService,
	narrator masterRouteNarratorService,
) (*masterRouteCommandExecutor, error) {
	if store == nil || conversations == nil || narrator == nil {
		return nil, errors.New("master route command executor requires store, conversation, and narrator services")
	}
	return &masterRouteCommandExecutor{
		store:         store,
		conversations: conversations,
		narrator:      narrator,
	}, nil
}

func (executor *masterRouteCommandExecutor) ExecuteMasterRouteCommand(
	ctx context.Context,
	record master.RouteDecisionRecord,
) error {
	if err := validateMasterRouteCommandExecution(executor, ctx, record); err != nil {
		return err
	}
	applied, err := executor.store.MasterRouteCommandApplied(ctx, record)
	if err != nil {
		return err
	}
	if !applied {
		executeErr := executor.execute(ctx, record)
		if err := executor.verifyEffect(ctx, record, executeErr); err != nil {
			return err
		}
	}
	return executor.notifyFollowup(record)
}

func validateMasterRouteCommandExecution(
	executor *masterRouteCommandExecutor,
	ctx context.Context,
	record master.RouteDecisionRecord,
) error {
	if executor == nil || executor.store == nil || executor.conversations == nil || executor.narrator == nil {
		return errors.New("master route command executor is required")
	}
	if ctx == nil {
		return errors.New("master route command context is required")
	}
	if err := record.Validate(); err != nil {
		return fmt.Errorf("validate master route decision: %w", err)
	}
	return nil
}

func (executor *masterRouteCommandExecutor) verifyEffect(
	ctx context.Context,
	record master.RouteDecisionRecord,
	executeErr error,
) error {
	applied, err := executor.store.MasterRouteCommandApplied(ctx, record)
	if err != nil {
		verification := fmt.Errorf("verify master route command effect: %w", err)
		return errors.Join(executeErr, verification)
	}
	if applied {
		return nil
	}
	degradationApplied, degradationErr := executor.routedNarratorDegradationApplied(ctx, record, executeErr)
	if degradationErr != nil {
		return errors.Join(executeErr, degradationErr)
	}
	if degradationApplied {
		return nil
	}
	if executeErr == nil {
		return fmt.Errorf("master route command %s completed without its durable effect", record.ID)
	}
	return executeErr
}

func (executor *masterRouteCommandExecutor) execute(
	ctx context.Context,
	record master.RouteDecisionRecord,
) error {
	command := record.ResultingCommand
	switch command.Kind {
	case master.RouteDecisionKindAskNarrator:
		payload := command.AskNarrator
		workspaceID, err := masterRouteExecutorFolderWorkspaceID(payload.Target)
		if err != nil {
			return err
		}
		_, err = executor.narrator.AskRoutedStatus(
			ctx,
			workspaceID,
			payload.Target.ConversationID,
			payload.RequestID,
			payload.Question,
		)
		return err
	case master.RouteDecisionKindFocusConversation,
		master.RouteDecisionKindClarify,
		master.RouteDecisionKindAnswerGlobal:
		return nil
	default:
		_, err := executor.conversations.ExecuteMasterRouteCommand(ctx, record.ID, command)
		return err
	}
}

func (executor *masterRouteCommandExecutor) routedNarratorDegradationApplied(
	ctx context.Context,
	record master.RouteDecisionRecord,
	executeErr error,
) (bool, error) {
	if executeErr == nil || record.ResultingCommand.Kind != master.RouteDecisionKindAskNarrator {
		return false, nil
	}
	var degraded *narration.DegradedError
	if !errors.As(executeErr, &degraded) {
		return false, nil
	}
	payload := record.ResultingCommand.AskNarrator
	if degraded.RequestID != payload.RequestID {
		return false, fmt.Errorf(
			"verify master routed narrator degradation: request %s does not match %s",
			degraded.RequestID,
			payload.RequestID,
		)
	}
	workspaceID, err := masterRouteExecutorFolderWorkspaceID(payload.Target)
	if err != nil {
		return false, err
	}
	snapshot, err := executor.store.ReadSnapshot(
		ctx,
		workspaceID,
		payload.Target.ConversationID,
	)
	if err != nil {
		return false, fmt.Errorf("verify master routed narrator degradation: %w", err)
	}
	stored := snapshot.NarratorState.Degradation
	if snapshot.NarratorState.Status != conversation.NarratorStatusDegraded ||
		stored == nil || *stored != degraded.Degradation {
		return false, errors.New("verify master routed narrator degradation: durable state does not match the completed request")
	}
	return true, nil
}

func (executor *masterRouteCommandExecutor) notifyFollowup(record master.RouteDecisionRecord) error {
	if record.ResultingCommand.Kind != master.RouteDecisionKindCreateConversation {
		return nil
	}
	conversationID := record.ResultingCommand.CreateConversation.Target.ConversationID
	if err := executor.narrator.NotifyConversationInput(conversationID); err != nil {
		return fmt.Errorf("notify master-created conversation input %s: %w", conversationID, err)
	}
	return nil
}

func masterRouteExecutorFolderWorkspaceID(
	target master.ConversationPresentationTarget,
) (string, error) {
	workspaceID, ok := target.ResourceScope.FolderWorkspaceID()
	if !ok {
		return "", fmt.Errorf("master route target %s has no folder resource", target.ConversationID)
	}
	return workspaceID, nil
}

var _ master.RouteCommandExecutor = (*masterRouteCommandExecutor)(nil)
