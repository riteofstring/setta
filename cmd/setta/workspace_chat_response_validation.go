package main

import (
	"errors"
	"fmt"

	"setta/internal/chat"
	"setta/internal/httpapi"
	"setta/internal/workspaceui"
)

func validateWorkspaceChatReadResponse(response httpapi.ReadWorkspaceUIChatResponse, workspaceID string, paneID string) error {
	if response.WorkspaceID != workspaceID {
		return fmt.Errorf("workspace chat read returned workspaceId %s, want %s", response.WorkspaceID, workspaceID)
	}
	if response.Pane.PaneID != paneID {
		return fmt.Errorf("workspace chat read returned paneId %s, want %s", response.Pane.PaneID, paneID)
	}
	if err := validateWorkspaceChatReadPane(response.Pane); err != nil {
		return fmt.Errorf("workspace chat read pane descriptor is invalid: %w", err)
	}
	contentRef := response.Pane.ContentRefs.Chat
	if response.ConversationID != contentRef.ConversationID {
		return fmt.Errorf("workspace chat read conversationId = %s, want %s", response.ConversationID, contentRef.ConversationID)
	}
	if err := validateWorkspaceChatReadPage(response.Page, workspaceID, response.ConversationID); err != nil {
		return fmt.Errorf("workspace chat read page is invalid: %w", err)
	}
	return validateWorkspaceChatReadActiveRun(response.ActiveRun, response.ActiveRunLiveness, workspaceID, response.ConversationID)
}

func validateWorkspaceChatSendResponse(response httpapi.SendWorkspaceUIChatResponse, workspaceID string, paneID string) error {
	conversationID, err := validateWorkspaceChatSendEnvelope(response, workspaceID, paneID)
	if err != nil {
		return err
	}
	return validateWorkspaceChatSendResult(response.Result, workspaceID, conversationID)
}

func validateWorkspaceChatSendEnvelope(response httpapi.SendWorkspaceUIChatResponse, workspaceID string, paneID string) (string, error) {
	if response.WorkspaceID != workspaceID {
		return "", fmt.Errorf("workspace chat send returned workspaceId %s, want %s", response.WorkspaceID, workspaceID)
	}
	if response.Pane.PaneID != paneID {
		return "", fmt.Errorf("workspace chat send returned paneId %s, want %s", response.Pane.PaneID, paneID)
	}
	if err := validateWorkspaceChatSendPane(response.Pane); err != nil {
		return "", fmt.Errorf("workspace chat send pane descriptor is invalid: %w", err)
	}
	contentRef := response.Pane.ContentRefs.Chat
	if response.ConversationID != contentRef.ConversationID {
		return "", fmt.Errorf("workspace chat send conversationId = %s, want %s", response.ConversationID, contentRef.ConversationID)
	}
	return response.ConversationID, nil
}

func validateWorkspaceChatSendResult(result chat.SendMessageResult, workspaceID string, conversationID string) error {
	if result.Conversation.WorkspaceID != workspaceID {
		return fmt.Errorf("workspace chat send result conversation workspaceId = %s, want %s", result.Conversation.WorkspaceID, workspaceID)
	}
	if result.Conversation.ID != conversationID {
		return fmt.Errorf("workspace chat send result conversation id = %s, want %s", result.Conversation.ID, conversationID)
	}
	if err := validateWorkspaceChatMessage(result.UserMessage, conversationID); err != nil {
		return fmt.Errorf("workspace chat send user message is invalid: %w", err)
	}
	if result.UserMessage.Delivery != chat.MessageDeliveryNormal {
		return fmt.Errorf("workspace chat send user message delivery = %s, want normal", result.UserMessage.Delivery)
	}
	if err := validateWorkspaceChatMessage(result.AssistantMessage, conversationID); err != nil {
		return fmt.Errorf("workspace chat send assistant message is invalid: %w", err)
	}
	if err := validateWorkspaceChatRun(result.Run, workspaceID, conversationID); err != nil {
		return fmt.Errorf("workspace chat send run is invalid: %w", err)
	}
	if err := validateWorkspaceChatReadPage(result.Page, workspaceID, conversationID); err != nil {
		return fmt.Errorf("workspace chat send page is invalid: %w", err)
	}
	return nil
}

func validateWorkspaceChatReadPane(pane workspaceui.WorkspaceUIPaneDescriptor) error {
	if err := validateWorkspacePaneDescriptor(pane); err != nil {
		return err
	}
	if pane.SurfaceKind != workspaceui.SurfaceKindChatDOM {
		return fmt.Errorf("surfaceKind = %s, want chat-dom", pane.SurfaceKind)
	}
	if pane.ContentRefs.Chat == nil {
		return errors.New("chat content ref is required")
	}
	if pane.ContentRefs.Chat.ConversationID == "" {
		return errors.New("chat content ref conversationId is required")
	}
	if !workspacePaneReadModesContain(pane.ReadModes, workspaceui.WorkspaceUIPaneReadModeChatState) {
		return errors.New("chat pane descriptor did not advertise chat_state")
	}
	return nil
}

func validateWorkspaceChatSendPane(pane workspaceui.WorkspaceUIPaneDescriptor) error {
	if err := validateWorkspaceChatReadPane(pane); err != nil {
		return err
	}
	if !workspacePaneWriteModesContain(pane.WriteModes, workspaceui.WorkspaceUIPaneWriteModeChatSend) {
		return errors.New("chat pane descriptor did not advertise chat_send")
	}
	return nil
}

func validateWorkspaceChatReadPage(page chat.MessagePage, workspaceID string, conversationID string) error {
	if page.Conversation.WorkspaceID != workspaceID {
		return fmt.Errorf("page conversation workspaceId = %s, want %s", page.Conversation.WorkspaceID, workspaceID)
	}
	if page.Conversation.ID != conversationID {
		return fmt.Errorf("page conversation id = %s, want %s", page.Conversation.ID, conversationID)
	}
	if page.Messages == nil {
		return errors.New("page messages array is required")
	}
	if page.Queue.Messages == nil || page.Queue.Runs == nil {
		return errors.New("page queue arrays are required")
	}
	if page.Blocks == nil {
		return errors.New("page blocks array is required")
	}
	for _, message := range page.Messages {
		if err := validateWorkspaceChatMessage(message, conversationID); err != nil {
			return err
		}
	}
	if err := validateWorkspaceChatReadQueue(page.Queue, workspaceID, conversationID); err != nil {
		return err
	}
	if page.OlderBeforeBlockOrdinal < 0 {
		return fmt.Errorf("olderBeforeBlockOrdinal must not be negative: %d", page.OlderBeforeBlockOrdinal)
	}
	return nil
}

func validateWorkspaceChatReadQueue(queue chat.QueueState, workspaceID string, conversationID string) error {
	for _, message := range queue.Messages {
		if err := validateWorkspaceChatMessage(message, conversationID); err != nil {
			return err
		}
	}
	for _, run := range queue.Runs {
		if err := validateWorkspaceChatRun(run, workspaceID, conversationID); err != nil {
			return err
		}
		if run.Status != chat.RunStatusQueued {
			return fmt.Errorf("queued run %s status = %s, want queued", run.ID, run.Status)
		}
	}
	return nil
}

func validateWorkspaceChatReadActiveRun(activeRun *chat.Run, liveness *chat.RunLiveness, workspaceID string, conversationID string) error {
	if activeRun == nil {
		if liveness != nil {
			return errors.New("activeRunLiveness returned without activeRun")
		}
		return nil
	}
	if err := validateWorkspaceChatRun(*activeRun, workspaceID, conversationID); err != nil {
		return err
	}
	if activeRun.Status == chat.RunStatusQueued {
		return fmt.Errorf("active run %s status must not be queued", activeRun.ID)
	}
	if liveness != nil {
		if liveness.WorkspaceID != workspaceID || liveness.ConversationID != conversationID || liveness.RunID != activeRun.ID {
			return fmt.Errorf("active run liveness target = %s/%s/%s, want %s/%s/%s", liveness.WorkspaceID, liveness.ConversationID, liveness.RunID, workspaceID, conversationID, activeRun.ID)
		}
	}
	return nil
}

func validateWorkspaceChatMessage(message chat.ChatMessage, conversationID string) error {
	if message.ConversationID != conversationID {
		return fmt.Errorf("message %s conversationId = %s, want %s", message.ID, message.ConversationID, conversationID)
	}
	if message.ID == "" {
		return errors.New("message id is required")
	}
	if message.Parts == nil {
		return fmt.Errorf("message %s parts array is required", message.ID)
	}
	return nil
}

func validateWorkspaceChatRun(run chat.Run, workspaceID string, conversationID string) error {
	if run.ID == "" {
		return errors.New("run id is required")
	}
	if run.WorkspaceID != workspaceID {
		return fmt.Errorf("run %s workspaceId = %s, want %s", run.ID, run.WorkspaceID, workspaceID)
	}
	if run.ConversationID != conversationID {
		return fmt.Errorf("run %s conversationId = %s, want %s", run.ID, run.ConversationID, conversationID)
	}
	if run.Status == "" {
		return fmt.Errorf("run %s status is required", run.ID)
	}
	return nil
}
