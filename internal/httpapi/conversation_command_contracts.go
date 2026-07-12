package httpapi

import "setta/internal/conversation"

type CreateTopicConversationRequest struct {
	WorkspaceID string `json:"workspaceId"`
	Title       string `json:"title"`
}

type SendTopicConversationTurnRequest struct {
	WorkspaceID    string `json:"workspaceId"`
	ConversationID string `json:"conversationId"`
	Text           string `json:"text"`
}

type QueueTopicConversationTurnRequest struct {
	WorkspaceID    string `json:"workspaceId"`
	ConversationID string `json:"conversationId"`
	Text           string `json:"text"`
}

type SteerTopicConversationTurnRequest struct {
	WorkspaceID    string `json:"workspaceId"`
	ConversationID string `json:"conversationId"`
	Text           string `json:"text"`
}

type StopTopicConversationTurnRequest struct {
	WorkspaceID    string `json:"workspaceId"`
	ConversationID string `json:"conversationId"`
}

type SubmitTopicConversationApprovalRequest struct {
	WorkspaceID    string                                    `json:"workspaceId"`
	ConversationID string                                    `json:"conversationId"`
	Response       conversation.ConversationApprovalResponse `json:"response"`
}

type AskTopicConversationNarratorStatusRequest struct {
	WorkspaceID    string `json:"workspaceId"`
	ConversationID string `json:"conversationId"`
	Question       string `json:"question"`
}
