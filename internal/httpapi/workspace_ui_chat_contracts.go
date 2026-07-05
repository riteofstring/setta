package httpapi

import (
	"setta/internal/chat"
	"setta/internal/workspaceui"
)

type ReadWorkspaceUIChatRequest struct {
	WorkspaceID string `json:"workspaceId"`
	PaneID      string `json:"paneId"`
	Limit       int    `json:"limit"`
}

type ReadWorkspaceUIChatResponse struct {
	WorkspaceID       string                                `json:"workspaceId"`
	Pane              workspaceui.WorkspaceUIPaneDescriptor `json:"pane"`
	ConversationID    string                                `json:"conversationId"`
	Page              chat.MessagePage                      `json:"page"`
	ActiveRun         *chat.Run                             `json:"activeRun"`
	ActiveRunLiveness *chat.RunLiveness                     `json:"activeRunLiveness"`
}

type SendWorkspaceUIChatRequest struct {
	WorkspaceID string         `json:"workspaceId"`
	PaneID      string         `json:"paneId"`
	Input       chat.ChatInput `json:"input"`
}

type SendWorkspaceUIChatResponse struct {
	WorkspaceID    string                                `json:"workspaceId"`
	Pane           workspaceui.WorkspaceUIPaneDescriptor `json:"pane"`
	ConversationID string                                `json:"conversationId"`
	Result         chat.SendMessageResult                `json:"result"`
}
