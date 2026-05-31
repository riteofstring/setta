package chat

import (
	"context"
	"fmt"
)

func (service *Service) ListCommands(workspaceID string, conversationID string) (ChatCommandListResult, error) {
	workspaceSummary, err := service.workspaceResolver.ResolveWorkspace(workspaceID)
	if err != nil {
		return ChatCommandListResult{}, err
	}
	executor, err := service.commandExecutor()
	if err != nil {
		return ChatCommandListResult{}, err
	}

	service.mu.Lock()
	conversation, activeRun, err := service.commandConversationStateLocked(workspaceID, conversationID)
	service.mu.Unlock()
	if err != nil {
		return ChatCommandListResult{}, err
	}

	result, err := executor.ListCommandCapabilities(context.Background(), HarnessCommandListRequest{
		ActiveRun:    activeRun,
		Conversation: conversation,
		ThreadRef:    latestHarnessRef(conversation, HarnessCodex),
		Workspace:    workspaceSummary,
	})
	if err != nil {
		return ChatCommandListResult{}, err
	}
	if result.Commands == nil {
		result.Commands = []ChatCommandCapability{}
	}
	return ChatCommandListResult{Commands: result.Commands}, nil
}

func (service *Service) ExecuteChatCommand(workspaceID string, conversationID string, raw string) (ChatCommandExecuteResult, error) {
	workspaceSummary, err := service.workspaceResolver.ResolveWorkspace(workspaceID)
	if err != nil {
		return ChatCommandExecuteResult{}, err
	}
	command, err := ParseChatCommand(raw)
	if err != nil {
		return ChatCommandExecuteResult{}, err
	}
	executor, err := service.commandExecutor()
	if err != nil {
		return ChatCommandExecuteResult{}, err
	}

	service.mu.Lock()
	conversation, activeRun, err := service.commandConversationStateLocked(workspaceID, conversationID)
	service.mu.Unlock()
	if err != nil {
		return ChatCommandExecuteResult{}, err
	}
	if err := ensureCommandAvailable(command, activeRun); err != nil {
		return ChatCommandExecuteResult{}, err
	}

	harnessResult, err := executor.ExecuteCommand(context.Background(), HarnessCommandRequest{
		ActiveRun:    activeRun,
		Command:      command,
		Conversation: conversation,
		ThreadRef:    latestHarnessRef(conversation, HarnessCodex),
		Workspace:    workspaceSummary,
	})
	if err != nil {
		return ChatCommandExecuteResult{}, err
	}

	service.mu.Lock()
	defer service.mu.Unlock()
	return service.persistCommandResultLocked(workspaceID, conversationID, command, harnessResult)
}

func (service *Service) commandExecutor() (HarnessCommandExecutor, error) {
	executor, ok := service.harness.(HarnessCommandExecutor)
	if !ok {
		return nil, commandError(ChatCommandErrorUnsupportedHarness, "selected harness does not support chat commands", nil)
	}
	return executor, nil
}

func (service *Service) commandConversationStateLocked(workspaceID string, conversationID string) (Conversation, *Run, error) {
	conversation, err := service.store.LoadConversation(workspaceID, conversationID)
	if err != nil {
		return Conversation{}, nil, err
	}
	runs, err := service.runsForConversationWithDiagnosticsLocked(workspaceID, conversationID)
	if err != nil {
		return Conversation{}, nil, err
	}
	run, ok, err := service.activeRunFromRunsLocked(workspaceID, conversationID, runs)
	if err != nil {
		return Conversation{}, nil, err
	}
	if !ok {
		return conversation, nil, nil
	}
	return conversation, &run, nil
}

func (service *Service) persistCommandResultLocked(
	workspaceID string,
	conversationID string,
	command ChatCommand,
	harnessResult HarnessCommandResult,
) (ChatCommandExecuteResult, error) {
	conversation, err := service.store.LoadConversation(workspaceID, conversationID)
	if err != nil {
		return ChatCommandExecuteResult{}, err
	}
	now := timestamp(service.now())
	conversation, err = service.persistCommandThreadRefLocked(workspaceID, conversationID, conversation, harnessResult, now)
	if err != nil {
		return ChatCommandExecuteResult{}, err
	}

	result := commandResult(command, harnessResult)
	message, err := service.persistCommandMessageLocked(workspaceID, conversationID, conversation, result, now)
	if err != nil {
		return ChatCommandExecuteResult{}, err
	}

	page, err := service.loadMessagePageLocked(workspaceID, conversationID, 0, defaultPageLimit)
	if err != nil {
		return ChatCommandExecuteResult{}, err
	}
	return ChatCommandExecuteResult{
		Conversation: page.Conversation,
		Message:      message,
		Page:         page,
		Result:       result,
	}, nil
}

func (service *Service) persistCommandThreadRefLocked(workspaceID string, conversationID string, conversation Conversation, harnessResult HarnessCommandResult, now string) (Conversation, error) {
	if !harnessResult.HasThreadRef {
		return conversation, nil
	}
	conversation = commandConversationWithThreadRef(conversation, harnessResult.ThreadRef, now)
	if err := service.store.SaveConversation(conversation); err != nil {
		return Conversation{}, err
	}
	if err := service.publishConversationUpdatedLocked(workspaceID, conversationID, ""); err != nil {
		return Conversation{}, err
	}
	return conversation, nil
}

func (service *Service) persistCommandMessageLocked(workspaceID string, conversationID string, conversation Conversation, result ChatCommandResult, now string) (*ChatMessage, error) {
	if result.Action == ChatCommandResultDisplay {
		commandMessage, err := service.newCommandMessage(workspaceID, conversationID, result.Message, now)
		if err != nil {
			return nil, err
		}
		conversation.UpdatedAt = now
		if err := service.store.SaveMessage(workspaceID, commandMessage); err != nil {
			return nil, err
		}
		if err := service.store.SaveConversation(conversation); err != nil {
			return nil, err
		}
		if _, err := service.events.Publish(NewMessageCreatedEvent(workspaceID, conversationID, "", commandMessage)); err != nil {
			return nil, err
		}
		if err := service.publishConversationUpdatedLocked(workspaceID, conversationID, ""); err != nil {
			return nil, err
		}
		return &commandMessage, nil
	}
	return nil, nil
}

func commandConversationWithThreadRef(conversation Conversation, ref HarnessThreadRef, now string) Conversation {
	ref.Harness = HarnessCodex
	ref.Status = HarnessRefLinked
	ref.LastResumedAt = now
	if ref.CreatedAt == "" {
		ref.CreatedAt = now
	}
	upsertHarnessRef(&conversation.HarnessRefs, ref)
	conversation.UpdatedAt = now
	return conversation
}

func (service *Service) newCommandMessage(workspaceID string, conversationID string, text string, now string) (ChatMessage, error) {
	messageID, err := service.newID("message")
	if err != nil {
		return ChatMessage{}, fmt.Errorf("create command message id: %w", err)
	}
	partID, err := service.newID("part")
	if err != nil {
		return ChatMessage{}, fmt.Errorf("create command message part id: %w", err)
	}
	ordinal, err := service.store.NextMessageOrdinal(workspaceID, conversationID)
	if err != nil {
		return ChatMessage{}, err
	}
	return ChatMessage{
		SchemaVersion:  SchemaVersion,
		ID:             messageID,
		ConversationID: conversationID,
		RunID:          "",
		Role:           RoleCommand,
		Delivery:       MessageDeliveryNormal,
		Ordinal:        ordinal,
		CreatedAt:      now,
		UpdatedAt:      now,
		Status:         MessageStatusComplete,
		Parts: []MessagePart{{
			ID:     partID,
			Type:   MessagePartText,
			Text:   text,
			Format: TextFormatPlain,
		}},
	}, nil
}

func commandResult(command ChatCommand, harnessResult HarnessCommandResult) ChatCommandResult {
	action := harnessResult.Action
	if action == "" {
		action = ChatCommandResultDisplay
	}
	result := ChatCommandResult{
		Action:        action,
		Goal:          harnessResult.Goal,
		Kind:          command.Kind,
		Models:        nonNilModels(harnessResult.Models),
		Raw:           command.Raw,
		SelectedModel: harnessResult.SelectedModel,
	}
	result.Title, result.Message = commandResultText(command, result)
	return result
}

func nonNilModels(models []ChatModelOption) []ChatModelOption {
	if models == nil {
		return []ChatModelOption{}
	}
	return models
}

func commandResultText(command ChatCommand, result ChatCommandResult) (string, string) {
	switch command.Kind {
	case ChatCommandGoal:
		return goalCommandResultText(command, result.Goal)
	case ChatCommandModel:
		return modelCommandResultText(command, result)
	default:
		return "Command", "Command completed."
	}
}

func goalCommandResultText(command ChatCommand, goal *ChatGoalState) (string, string) {
	if command.Goal == nil {
		return "Goal", "Goal command completed."
	}
	switch command.Goal.Action {
	case GoalCommandShow:
		if goal == nil {
			return "Goal", "No goal set."
		}
		return "Goal", fmt.Sprintf("Goal is %s: %s", goal.Status, goal.Objective)
	case GoalCommandSet:
		return "Goal", "Goal set: " + command.Goal.Objective
	case GoalCommandClear:
		return "Goal", "Goal cleared."
	case GoalCommandPause:
		return "Goal", "Goal paused."
	case GoalCommandResume:
		return "Goal", "Goal resumed."
	default:
		return "Goal", "Goal command completed."
	}
}

func modelCommandResultText(command ChatCommand, result ChatCommandResult) (string, string) {
	if command.Model == nil {
		return "Model", "Model command completed."
	}
	switch command.Model.Action {
	case ModelCommandShowPicker:
		return "Model", "Choose a model."
	case ModelCommandSet:
		return "Model", "Model set: " + result.SelectedModel
	default:
		return "Model", "Model command completed."
	}
}
