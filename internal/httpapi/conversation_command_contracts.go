package httpapi

import (
	"setta/internal/conversation"
)

type CreateTopicConversationRequest struct {
	WorkspaceID *string `json:"workspaceId"`
	Title       string  `json:"title"`
}

type ArchiveTopicConversationRequest struct {
	WorkspaceID    string `json:"workspaceId"`
	ConversationID string `json:"conversationId"`
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

type StopTopicConversationTurnRequest struct {
	WorkspaceID    string `json:"workspaceId"`
	ConversationID string `json:"conversationId"`
}

type SubmitTopicConversationApprovalRequest struct {
	WorkspaceID    string                                    `json:"workspaceId"`
	ConversationID string                                    `json:"conversationId"`
	Response       conversation.ConversationApprovalResponse `json:"response"`
}

type UpdateTopicConversationPresentationRequest struct {
	WorkspaceID    string                                        `json:"workspaceId"`
	ConversationID string                                        `json:"conversationId"`
	Settings       conversation.ConversationPresentationSettings `json:"settings"`
}

type ReadConversationRoleConfigurationRequest struct {
	WorkspaceID    string `json:"workspaceId"`
	ConversationID string `json:"conversationId"`
}

type ReadWorkspaceRoleConfigurationRequest struct {
	WorkspaceID string `json:"workspaceId"`
}

type UpdateGlobalRoleProfilesRequest struct {
	Updates []conversation.RoleProfileUpdate `json:"updates"`
}

type UpdateWorkspaceRoleProfilesRequest struct {
	WorkspaceID string                           `json:"workspaceId"`
	Updates     []conversation.RoleProfileUpdate `json:"updates"`
}

type UpdateConversationRoleProfilesRequest struct {
	WorkspaceID    string                           `json:"workspaceId"`
	ConversationID string                           `json:"conversationId"`
	Updates        []conversation.RoleProfileUpdate `json:"updates"`
}
