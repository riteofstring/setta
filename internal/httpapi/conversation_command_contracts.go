package httpapi

import (
	"setta/internal/conversation"
	"setta/internal/speech"
)

type CreateTopicConversationRequest struct {
	WorkspaceID string `json:"workspaceId"`
	Title       string `json:"title"`
}

type ForkTopicConversationRequest struct {
	WorkspaceID          string `json:"workspaceId"`
	ParentConversationID string `json:"parentConversationId"`
	ForkedAtTurnID       string `json:"forkedAtTurnId"`
	Title                string `json:"title"`
}

type CreateSideConversationRequest struct {
	WorkspaceID          string `json:"workspaceId"`
	ParentConversationID string `json:"parentConversationId"`
	ParentPaneID         string `json:"parentPaneId"`
}

type SendSideConversationTurnRequest struct {
	WorkspaceID          string `json:"workspaceId"`
	ParentConversationID string `json:"parentConversationId"`
	SideConversationID   string `json:"sideConversationId"`
	Text                 string `json:"text"`
}

type DisposeSideConversationRequest struct {
	WorkspaceID          string `json:"workspaceId"`
	ParentConversationID string `json:"parentConversationId"`
	ParentPaneID         string `json:"parentPaneId"`
	SideConversationID   string `json:"sideConversationId"`
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

type UpdateTopicConversationNarratorVoiceRequest struct {
	WorkspaceID    string                       `json:"workspaceId"`
	ConversationID string                       `json:"conversationId"`
	Selection      speech.VoiceSelectionRequest `json:"selection"`
}
