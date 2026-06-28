package chat

import "fmt"

func (service *Service) validateRunAssistantMessage(workspaceID string, run Run) error {
	if run.Status == RunStatusQueued {
		return nil
	}
	message, ok, err := service.store.FindMessageByID(workspaceID, run.ConversationID, run.AssistantMessageID)
	if err != nil {
		return err
	}
	if !ok {
		return corruptStateErrorf(service.store.runPath(workspaceID, run.ID), "run %s assistant message %s was not found", run.ID, run.AssistantMessageID)
	}
	if err := validateRunAssistantMessageRecord(run, message); err != nil {
		return corruptStateError(service.store.runPath(workspaceID, run.ID), err)
	}
	return nil
}

func validateRunAssistantMessageRecord(run Run, message ChatMessage) error {
	if message.Role != RoleAssistant {
		return fmt.Errorf("run %s assistantMessageId %s refers to %s message", run.ID, run.AssistantMessageID, message.Role)
	}
	if message.RunID != run.ID {
		return fmt.Errorf("run %s assistant message %s belongs to run %s", run.ID, message.ID, message.RunID)
	}
	return nil
}
